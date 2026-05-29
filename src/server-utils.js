/**
 * HTTP-server utility helpers. Pure functions only — no I/O, no module-level state.
 */

import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Constant-time string comparison via SHA-256 hashing.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Convert a tool's JSON-Schema property descriptor to a Zod schema.
 * Unknown types fall through to `z.string()`.
 *
 * @param {{ type?: string, items?: {type?: string}, enum?: string[], description?: string }} prop
 * @returns {z.ZodTypeAny}
 */
export function jsonSchemaToZod(prop) {
  let schema;
  switch (prop.type) {
    case 'number':
    case 'integer':
      schema = z.number();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'array': {
      const itemType = prop.items?.type;
      if (itemType === 'number' || itemType === 'integer') schema = z.array(z.number());
      else if (itemType === 'boolean') schema = z.array(z.boolean());
      else if (itemType === 'object') schema = z.array(z.object({}).passthrough());
      else schema = z.array(z.string());
      break;
    }
    case 'object':
      schema = z.object({}).passthrough();
      break;
    case 'string':
      schema = (prop.enum?.length) ? z.enum(prop.enum) : z.string();
      break;
    default:
      schema = z.string();
  }
  if (prop.description) schema = schema.describe(prop.description);
  return schema;
}

/**
 * Parse an Authorization header into a token, accepting both
 * `Bearer <token>` and raw `<token>` forms.
 *
 * @param {string | undefined} header
 * @returns {string | null} token, or null if the header is absent/malformed
 */
export function parseAuthorizationHeader(header) {
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') return parts[1];
  return header;
}

/**
 * Validate and normalize a client-supplied N-central server FQDN.
 *
 * Enforces https, rejects embedded credentials / path / query / fragment, and
 * (when an allowlist is provided) requires the hostname to match an entry by
 * exact or DNS-suffix match — NOT substring, so `allowedXcom` and
 * `allowed.com.evil.com` are rejected against an allowlist of `allowed.com`.
 *
 * @param {unknown} value Raw FQDN, e.g. "https://ncentral.example.com".
 * @param {string[]} [allowlist] Permitted host suffixes (empty = any https host).
 * @returns {string} Normalized origin (scheme + host [+ explicit port], no trailing slash).
 * @throws {Error} If the value is invalid or not allowed.
 */
export function validateNcFqdn(value, allowlist = []) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('FQDN is required');

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('FQDN must be a valid URL');
  }

  if (url.protocol !== 'https:') throw new Error('FQDN must use https');
  if (url.username || url.password) throw new Error('FQDN must not contain credentials');
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('FQDN must not contain a path, query, or fragment');
  }

  const host = url.hostname.toLowerCase();
  if (!host) throw new Error('FQDN must have a host');

  if (allowlist.length) {
    const allowed = allowlist.some((entry) => {
      const a = entry.trim().toLowerCase();
      return a !== '' && (host === a || host.endsWith(`.${a}`));
    });
    if (!allowed) throw new Error('FQDN host is not in the allowlist');
  }

  // url.origin drops any path and preserves an explicit non-default port.
  return url.origin;
}

/**
 * Heuristic: does the value look like a JWT (three non-empty base64url segments)?
 * Does not verify the signature — just shape, to reject obviously-bad input early.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function looksLikeJwt(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}
