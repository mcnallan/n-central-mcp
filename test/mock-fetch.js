/**
 * Shared helpers for the multi-tenant isolation tests.
 *
 * This is intentionally NOT a `*.test.js` file, so `node --test test/*.test.js`
 * does not run it as a suite — it only provides helpers other suites import.
 */

/** A promise plus its resolve/reject, for deterministic interleaving. */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Install a fake `global.fetch` that models the N-central auth + data API:
 *  - POST /api/auth/authenticate → access `acc:<jwt>` + refresh `ref:<jwt>`
 *    (the token embeds the originating JWT so provenance is verifiable),
 *  - POST /api/auth/refresh      → re-mints from the refresh token,
 *  - any other path             → echoes `{ host, bearer }` (the "data" call).
 *
 * Every call is recorded in `calls`. Optional hooks let a test inject delays
 * (onAuth) or custom responses such as a 401 (dataHandler).
 *
 * @param {{ onAuth?: Function, dataHandler?: Function }} [opts]
 */
export function installMockFetch({ onAuth, dataHandler } = {}) {
  const calls = [];
  const original = global.fetch;

  global.fetch = async (url, init = {}) => {
    const u = new URL(typeof url === 'string' ? url : url.url);
    // Pass localhost through to the real fetch so e2e tests can talk to their
    // own in-process HTTP server while N-central hosts stay mocked.
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return original(url, init);
    }
    const headers = init.headers || {};
    const authHeader = headers.Authorization || headers.authorization || '';
    const bearer = String(authHeader).replace(/^Bearer\s+/i, '');
    const call = { host: u.host, path: u.pathname, bearer, method: (init.method || 'GET').toUpperCase() };
    calls.push(call);

    if (u.pathname === '/api/auth/authenticate') {
      if (onAuth) await onAuth({ host: u.host, jwt: bearer });
      return jsonResponse({ tokens: { access: { token: `acc:${bearer}` }, refresh: { token: `ref:${bearer}` } } });
    }
    if (u.pathname === '/api/auth/refresh') {
      const jwt = bearer.replace(/^ref:/, '');
      return jsonResponse({ tokens: { access: { token: `acc:${jwt}` }, refresh: { token: `ref:${jwt}` } } });
    }
    if (dataHandler) {
      const custom = await dataHandler(call);
      if (custom) return custom;
    }
    return jsonResponse({ host: u.host, bearer });
  };

  return {
    calls,
    restore() { global.fetch = original; },
  };
}

/**
 * Assert every recorded DATA call carried a token belonging to the tenant that
 * owns the host it was sent to. A cross-tenant leak shows up as host A carrying
 * `acc:jwtB`. This is the core provenance invariant.
 *
 * @param {Array<{host:string, path:string, bearer:string}>} calls
 * @param {Record<string,string>} hostToJwt  e.g. { 'a.example.com': 'jwtA' }
 */
export function assertProvenance(calls, hostToJwt) {
  for (const c of calls) {
    if (c.path.startsWith('/api/auth/')) continue;
    const expected = hostToJwt[c.host];
    const m = /^acc:(.+)$/.exec(c.bearer);
    if (!m) throw new Error(`data call to ${c.host} had a non-access bearer: ${c.bearer}`);
    if (m[1] !== expected) {
      throw new Error(`CROSS-TENANT LEAK: call to ${c.host} carried token for ${m[1]} (expected ${expected})`);
    }
  }
}
