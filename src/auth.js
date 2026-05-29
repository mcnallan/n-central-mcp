// @ts-check
/**
 * N-central auth: per-tenant JWT → access/refresh token exchange with
 * auto-refresh.
 *
 * Credentials are keyed by tenant (ctx.key), NOT held in module globals.
 * Each tenant entry owns its own access/refresh tokens AND its own in-flight
 * `pendingAuth`/`pendingRefresh` promises — this is load-bearing for isolation:
 * if the pending promise were shared, a second tenant could await the first
 * tenant's refresh and receive the first tenant's token.
 */

/** @typedef {import('./context.js').TenantContext} TenantContext */

import { MULTI_TENANT } from './context.js';

const AUTH_TIMEOUT_MS = 15_000;
const MAX_TENANTS = Number(process.env.NC_MAX_TENANTS) || 1000;
const QUIET = process.env.MCP_QUIET === '1';

function parseExpiryToMs(str) {
  if (!str) return null;
  const m = /^(\d+)([smh])$/.exec(String(str).trim());
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2];
  return unit === 's' ? value * 1000
    : unit === 'm' ? value * 60_000
    : unit === 'h' ? value * 3_600_000
    : null;
}

const NC_ACCESS_EXPIRY = process.env.NC_ACCESS_EXPIRY || null;
const NC_REFRESH_EXPIRY = process.env.NC_REFRESH_EXPIRY || null;

const ACCESS_TOKEN_MS = parseExpiryToMs(NC_ACCESS_EXPIRY) ?? 60 * 60_000;
// Refresh this long before the real expiry: 10 min normally, but never more than
// half the lifetime — so a short NC_ACCESS_EXPIRY can't drive TOKEN_LIFETIME_MS to
// <= 0 and make every request refresh the token.
const REFRESH_MARGIN_MS = Math.min(10 * 60_000, Math.floor(ACCESS_TOKEN_MS / 2));
const TOKEN_LIFETIME_MS = ACCESS_TOKEN_MS - REFRESH_MARGIN_MS;

/**
 * @typedef {Object} TenantAuth
 * @property {string} fqdn
 * @property {string} jwt
 * @property {string | null} accessToken
 * @property {string | null} refreshToken
 * @property {number | null} tokenExpiry
 * @property {Promise<void> | null} pendingAuth
 * @property {Promise<void> | null} pendingRefresh
 * @property {boolean} warned
 */

/** @type {Map<string, TenantAuth>} */
const store = new Map();

/**
 * Get (or lazily create) the auth entry for a tenant. A simple size cap evicts
 * the oldest-inserted entry as a backstop; the primary eviction is refcounted
 * to session lifetime in index.js via evictTenant().
 *
 * @param {TenantContext} ctx
 * @returns {TenantAuth}
 */
function getEntry(ctx) {
  let entry = store.get(ctx.key);
  if (entry) return entry;

  if (store.size >= MAX_TENANTS) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }

  entry = {
    fqdn: ctx.fqdn,
    jwt: ctx.jwt,
    accessToken: null,
    refreshToken: null,
    tokenExpiry: null,
    pendingAuth: null,
    pendingRefresh: null,
    warned: false,
  };
  store.set(ctx.key, entry);
  return entry;
}

function warnIfNearJwtExpiry(jwt) {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number') return;
    const expiresInMs = payload.exp * 1000 - Date.now();
    const days = expiresInMs / 86_400_000;
    if (days <= 0) {
      console.error(`⚠️  N-central JWT has already expired. Regenerate it in the N-central UI.`);
    } else if (days < 14) {
      console.error(`⚠️  N-central JWT expires in ${days.toFixed(1)} days. The API user password rotates every 90 days.`);
    }
  } catch {
    /* ignore unparseable JWT */
  }
}

/**
 * Exchange this tenant's JWT for access/refresh tokens. In-flight calls for the
 * same tenant share one promise (per-entry, never module-global).
 *
 * @param {TenantAuth} entry
 * @returns {Promise<void>}
 */
function exchangeJwt(entry) {
  if (entry.pendingAuth) return entry.pendingAuth;

  entry.pendingAuth = (async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), AUTH_TIMEOUT_MS);

    try {
      if (!entry.warned) {
        warnIfNearJwtExpiry(entry.jwt);
        entry.warned = true;
      }

      const headers = { Authorization: `Bearer ${entry.jwt}`, 'Content-Type': 'application/json' };
      if (NC_ACCESS_EXPIRY) headers['X-ACCESS-EXPIRY-OVERRIDE'] = NC_ACCESS_EXPIRY;
      if (NC_REFRESH_EXPIRY) headers['X-REFRESH-EXPIRY-OVERRIDE'] = NC_REFRESH_EXPIRY;

      const res = await fetch(`${entry.fqdn}/api/auth/authenticate`, {
        method: 'POST',
        headers,
        signal: ac.signal,
      });

      if (!res.ok) {
        // In multi-tenant mode, don't echo the auth response body — it can carry
        // tenant-identifying detail into shared operator logs.
        const body = MULTI_TENANT ? '' : await res.text();
        throw new Error(`Auth failed (${res.status})${body ? `: ${body.substring(0, 200)}` : ''}`);
      }

      const data = await res.json();
      entry.accessToken = data.tokens.access.token;
      entry.refreshToken = data.tokens.refresh.token;
      entry.tokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
      if (!QUIET) console.error(`Authenticated with N-central at ${entry.fqdn}`);
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`Auth timed out (${AUTH_TIMEOUT_MS}ms)`);
      throw err;
    } finally {
      clearTimeout(timer);
      entry.pendingAuth = null;
    }
  })();

  return entry.pendingAuth;
}

/**
 * Refresh this tenant's access token, falling back to a full re-exchange.
 *
 * @param {TenantAuth} entry
 * @returns {Promise<void>}
 */
function refreshAccessToken(entry) {
  if (entry.pendingRefresh) return entry.pendingRefresh;

  entry.pendingRefresh = (async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), AUTH_TIMEOUT_MS);

    try {
      const res = await fetch(`${entry.fqdn}/api/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${entry.refreshToken}`, 'Content-Type': 'application/json' },
        signal: ac.signal,
      });

      if (!res.ok) {
        console.error(`Refresh failed (${res.status}), re-authenticating...`);
        await exchangeJwt(entry);
        return;
      }

      const data = await res.json();
      entry.accessToken = data.tokens.access.token;
      entry.refreshToken = data.tokens.refresh.token;
      entry.tokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('Refresh timed out, re-authenticating...');
        await exchangeJwt(entry);
        return;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      entry.pendingRefresh = null;
    }
  })();

  return entry.pendingRefresh;
}

/**
 * Return a valid access token for the tenant, authenticating on first use and
 * refreshing if within REFRESH_BUFFER_MS of expiry.
 *
 * @param {TenantContext} ctx
 * @returns {Promise<string>}
 */
export async function getAccessToken(ctx) {
  const entry = getEntry(ctx);
  if (!entry.accessToken) await exchangeJwt(entry);
  // tokenExpiry already has REFRESH_MARGIN_MS subtracted, so refreshing at it
  // still leaves that margin of real validity.
  if (entry.tokenExpiry != null && Date.now() >= entry.tokenExpiry) {
    await refreshAccessToken(entry);
  }
  if (!entry.accessToken) throw new Error('Not authenticated');
  return entry.accessToken;
}

/**
 * Force a full JWT re-exchange for the tenant (used after a 401).
 * @param {TenantContext} ctx
 * @returns {Promise<void>}
 */
export async function reAuthenticate(ctx) {
  const entry = getEntry(ctx);
  await exchangeJwt(entry);
}

/**
 * Drop a tenant's cached tokens. Called when the last session for a tenant
 * closes, so credential material does not accumulate for the process lifetime.
 * @param {string} key tenant key
 */
export function evictTenant(key) {
  store.delete(key);
}

/** Test helper: number of tenants currently held in the store. */
export function tenantCount() {
  return store.size;
}
