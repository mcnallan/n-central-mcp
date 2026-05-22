// @ts-check
/** N-central auth: JWT → access/refresh token exchange with auto-refresh. */

const AUTH_TIMEOUT_MS = 15_000;
const REFRESH_BUFFER_MS = 5 * 60_000;

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

const TOKEN_LIFETIME_MS = (parseExpiryToMs(NC_ACCESS_EXPIRY) ?? 60 * 60_000) - 10 * 60_000;

/** @type {string | null} */
let serverUrl = null;
/** @type {string | null} */
let jwtToken = null;
/** @type {string | null} */
let accessToken = null;
/** @type {string | null} */
let refreshToken = null;
/** @type {number | null} */
let tokenExpiry = null;

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

let pendingAuth = null;
let pendingRefresh = null;

/**
 * Initialize the auth module and perform the first JWT-to-access-token exchange.
 * @param {string} url N-central server URL
 * @param {string} jwt User-API JWT token from the N-central UI
 */
export async function authenticate(url, jwt) {
  serverUrl = url.replace(/\/+$/, '');
  jwtToken = jwt;
  warnIfNearJwtExpiry(jwt);
  await exchangeJwt();
}

function exchangeJwt() {
  if (pendingAuth) return pendingAuth;

  pendingAuth = (async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), AUTH_TIMEOUT_MS);

    try {
      const headers = { Authorization: `Bearer ${jwtToken}`, 'Content-Type': 'application/json' };
      if (NC_ACCESS_EXPIRY) headers['X-ACCESS-EXPIRY-OVERRIDE'] = NC_ACCESS_EXPIRY;
      if (NC_REFRESH_EXPIRY) headers['X-REFRESH-EXPIRY-OVERRIDE'] = NC_REFRESH_EXPIRY;

      const res = await fetch(`${serverUrl}/api/auth/authenticate`, {
        method: 'POST',
        headers,
        signal: ac.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Auth failed (${res.status}): ${body.substring(0, 200)}`);
      }

      const data = await res.json();
      accessToken = data.tokens.access.token;
      refreshToken = data.tokens.refresh.token;
      tokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`Auth timed out (${AUTH_TIMEOUT_MS}ms)`);
      throw err;
    } finally {
      clearTimeout(timer);
      pendingAuth = null;
    }
  })();

  return pendingAuth;
}

function refreshAccessToken() {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), AUTH_TIMEOUT_MS);

    try {
      const res = await fetch(`${serverUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${refreshToken}`, 'Content-Type': 'application/json' },
        signal: ac.signal,
      });

      if (!res.ok) {
        console.error(`Refresh failed (${res.status}), re-authenticating...`);
        await exchangeJwt();
        return;
      }

      const data = await res.json();
      accessToken = data.tokens.access.token;
      refreshToken = data.tokens.refresh.token;
      tokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('Refresh timed out, re-authenticating...');
        await exchangeJwt();
        return;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}

/**
 * Returns a valid access token, refreshing it if within REFRESH_BUFFER_MS of expiry.
 * @returns {Promise<string>}
 */
export async function getAccessToken() {
  if (!accessToken) throw new Error('Not authenticated');
  if (tokenExpiry != null && Date.now() > tokenExpiry - REFRESH_BUFFER_MS) await refreshAccessToken();
  return /** @type {string} */ (accessToken);
}

/** Force a full JWT re-exchange (used after 401). */
export async function reAuthenticate() {
  await exchangeJwt();
}
