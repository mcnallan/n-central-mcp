/**
 * Multi-tenant isolation tests for the auth + client layer.
 *
 * These exercise the real src/client.js → src/auth.js → src/context.js path
 * with a faked global.fetch, forcing concurrent interleavings that would expose
 * any shared module-global credential/token state (the bug class this whole
 * refactor exists to prevent).
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { als, makeContext } from '../src/context.js';
import { apiGet } from '../src/client.js';
import { evictTenant, tenantCount } from '../src/auth.js';
import { deferred, installMockFetch, assertProvenance } from './mock-fetch.js';

const ctxA = makeContext('https://a.example.com', 'jwtA');
const ctxB = makeContext('https://b.example.com', 'jwtB');
const hostToJwt = { 'a.example.com': 'jwtA', 'b.example.com': 'jwtB' };

let active = null;
afterEach(() => {
  if (active) { active.restore(); active = null; }
  evictTenant(ctxA.key);
  evictTenant(ctxB.key);
});

describe('multi-tenant auth isolation', () => {
  it('isolates credentials when two tenants authenticate concurrently (forced interleave)', async () => {
    const aAuth = deferred();
    const bAuth = deferred();

    active = installMockFetch({
      // Force both authenticate() calls to be in-flight at the same instant:
      // each signals it has entered, then blocks on the other. With a shared
      // module-global pendingAuth/accessToken, one tenant would await the
      // other's exchange and receive the WRONG token here.
      onAuth: async ({ jwt }) => {
        if (jwt === 'jwtA') { aAuth.resolve(); await bAuth.promise; }
        else if (jwt === 'jwtB') { bAuth.resolve(); await aAuth.promise; }
      },
    });

    const [ra, rb] = await Promise.all([
      als.run(ctxA, () => apiGet('/api/devices')),
      als.run(ctxB, () => apiGet('/api/devices')),
    ]);

    assert.equal(ra.host, 'a.example.com');
    assert.equal(ra.bearer, 'acc:jwtA');
    assert.equal(rb.host, 'b.example.com');
    assert.equal(rb.bearer, 'acc:jwtB');
    assertProvenance(active.calls, hostToJwt);
  });

  it('survives many interleaved concurrent calls with zero cross-tenant leakage', async () => {
    active = installMockFetch({
      // Small staggered delay on every auth to maximize interleaving.
      onAuth: async ({ jwt }) => { await new Promise((r) => setTimeout(r, jwt === 'jwtA' ? 3 : 1)); },
    });

    const jobs = [];
    for (let i = 0; i < 100; i++) {
      const ctx = i % 2 === 0 ? ctxA : ctxB;
      jobs.push(als.run(ctx, () => apiGet(`/api/item/${i}`)));
    }
    const results = await Promise.all(jobs);

    for (let i = 0; i < results.length; i++) {
      const expectHost = i % 2 === 0 ? 'a.example.com' : 'b.example.com';
      assert.equal(results[i].host, expectHost, `call ${i} hit the wrong host`);
    }
    assertProvenance(active.calls, hostToJwt);
  });

  it('does not block or leak when tenant A hits a slow 401 re-auth', async () => {
    const releaseAReauth = deferred();
    let aAuthCount = 0;
    let armA401 = false;
    let a401Sent = false;

    active = installMockFetch({
      onAuth: async ({ jwt }) => {
        if (jwt === 'jwtA') {
          aAuthCount += 1;
          if (aAuthCount === 2) await releaseAReauth.promise; // block the re-auth (2nd exchange for A)
        }
      },
      dataHandler: async (call) => {
        if (armA401 && call.host === 'a.example.com' && !a401Sent) {
          a401Sent = true;
          return new Response('unauthorized', { status: 401 });
        }
        return null;
      },
    });

    // Prime both tenants (each authenticates once, data 200).
    await als.run(ctxA, () => apiGet('/api/ping'));
    await als.run(ctxB, () => apiGet('/api/ping'));
    armA401 = true;

    // Tenant A's next call 401s → reAuthenticate, which blocks on releaseAReauth.
    const aPromise = als.run(ctxA, () => apiGet('/api/devices'));

    // Tenant B must complete immediately with B's own token, unaffected by A.
    const rb = await als.run(ctxB, () => apiGet('/api/devices'));
    assert.equal(rb.host, 'b.example.com');
    assert.equal(rb.bearer, 'acc:jwtB');

    // Release A's re-auth and confirm A recovers using A's token.
    releaseAReauth.resolve();
    const ra = await aPromise;
    assert.equal(ra.host, 'a.example.com');
    assert.equal(ra.bearer, 'acc:jwtA');

    assertProvenance(active.calls, hostToJwt);
  });

  it('keeps a separate token-store entry per tenant and reuses it for the same tenant', async () => {
    active = installMockFetch();
    const before = tenantCount();

    await als.run(ctxA, () => apiGet('/api/a'));
    await als.run(ctxB, () => apiGet('/api/b'));
    await als.run(ctxA, () => apiGet('/api/a2')); // reuse A's entry — must NOT re-authenticate

    assert.equal(tenantCount(), before + 2);
    const auths = active.calls.filter((c) => c.path === '/api/auth/authenticate');
    assert.equal(auths.length, 2, 'each tenant should authenticate exactly once');
  });

  it('evicts a tenant on request, dropping its cached tokens', async () => {
    active = installMockFetch();
    const before = tenantCount();
    await als.run(ctxA, () => apiGet('/api/a'));
    assert.equal(tenantCount(), before + 1);
    evictTenant(ctxA.key);
    assert.equal(tenantCount(), before);
  });

  it('does not refresh on every call under a short NC_ACCESS_EXPIRY', async () => {
    // Fresh auth module instance that computes TOKEN_LIFETIME_MS for a 2m expiry.
    // Before the fix, ACCESS - 10m underflowed to a negative lifetime and every
    // getAccessToken() triggered a refresh.
    process.env.NC_ACCESS_EXPIRY = '2m';
    const auth = await import('../src/auth.js?shortexpiry=1');
    delete process.env.NC_ACCESS_EXPIRY;

    active = installMockFetch();
    try {
      await auth.getAccessToken(ctxA);
      await auth.getAccessToken(ctxA); // immediate second call must reuse the cached token
      const auths = active.calls.filter((c) => c.path === '/api/auth/authenticate');
      const refreshes = active.calls.filter((c) => c.path === '/api/auth/refresh');
      assert.equal(auths.length, 1, 'should authenticate exactly once');
      assert.equal(refreshes.length, 0, 'should not refresh on the immediate second call');
    } finally {
      auth.evictTenant(ctxA.key);
    }
  });
});
