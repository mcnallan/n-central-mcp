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
