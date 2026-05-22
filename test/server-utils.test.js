/**
 * Tests for server-utils.js — safeCompare timing/correctness,
 * jsonSchemaToZod type mapping, and parseAuthorizationHeader parsing rules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeCompare, jsonSchemaToZod, parseAuthorizationHeader } from '../src/server-utils.js';

// ---------------------------------------------------------------------------
// safeCompare
// ---------------------------------------------------------------------------
describe('safeCompare', () => {
  it('returns true for equal strings', () => {
    assert.equal(safeCompare('hello', 'hello'), true);
    assert.equal(safeCompare('a', 'a'), true);
  });

  it('returns false for different equal-length strings', () => {
    assert.equal(safeCompare('hello', 'world'), false);
  });

  it('returns false for different-length strings (no length leak)', () => {
    assert.equal(safeCompare('short', 'verymuchlongersecret'), false);
    assert.equal(safeCompare('', 'x'), false);
  });

  it('returns false for non-string inputs', () => {
    assert.equal(safeCompare(null, 'x'), false);
    assert.equal(safeCompare('x', null), false);
    assert.equal(safeCompare(undefined, undefined), false);
    assert.equal(safeCompare(123, '123'), false);
    assert.equal(safeCompare(['x'], 'x'), false);
    assert.equal(safeCompare({}, 'x'), false);
  });

  it('handles empty strings', () => {
    assert.equal(safeCompare('', ''), true);
  });

  it('is case-sensitive', () => {
    assert.equal(safeCompare('Token', 'token'), false);
  });

  it('handles unicode correctly', () => {
    assert.equal(safeCompare('héllo', 'héllo'), true);
    assert.equal(safeCompare('héllo', 'hello'), false);
  });
});

// ---------------------------------------------------------------------------
// jsonSchemaToZod
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod', () => {
  it('maps "number" and "integer" to z.number()', () => {
    assert.equal(jsonSchemaToZod({ type: 'number' }).safeParse(42).success, true);
    assert.equal(jsonSchemaToZod({ type: 'integer' }).safeParse(42).success, true);
    assert.equal(jsonSchemaToZod({ type: 'number' }).safeParse('x').success, false);
  });

  it('maps "boolean" to z.boolean()', () => {
    assert.equal(jsonSchemaToZod({ type: 'boolean' }).safeParse(true).success, true);
    assert.equal(jsonSchemaToZod({ type: 'boolean' }).safeParse('true').success, false);
  });

  it('maps "string" without enum to z.string()', () => {
    assert.equal(jsonSchemaToZod({ type: 'string' }).safeParse('hi').success, true);
    assert.equal(jsonSchemaToZod({ type: 'string' }).safeParse(42).success, false);
  });

  it('maps "string" with enum to z.enum()', () => {
    const schema = jsonSchemaToZod({ type: 'string', enum: ['a', 'b'] });
    assert.equal(schema.safeParse('a').success, true);
    assert.equal(schema.safeParse('c').success, false);
  });

  it('maps "array" with number items to z.array(z.number())', () => {
    const schema = jsonSchemaToZod({ type: 'array', items: { type: 'number' } });
    assert.equal(schema.safeParse([1, 2, 3]).success, true);
    assert.equal(schema.safeParse(['x']).success, false);
  });

  it('maps "array" without items.type to z.array(z.string())', () => {
    const schema = jsonSchemaToZod({ type: 'array' });
    assert.equal(schema.safeParse(['x', 'y']).success, true);
  });

  it('maps "array" with object items to z.array(z.object(...))', () => {
    const schema = jsonSchemaToZod({ type: 'array', items: { type: 'object' } });
    assert.equal(schema.safeParse([{ a: 1 }, { b: 2 }]).success, true);
  });

  it('maps "object" to z.object({}).passthrough()', () => {
    const schema = jsonSchemaToZod({ type: 'object' });
    assert.equal(schema.safeParse({ foo: 'bar' }).success, true);
    assert.equal(schema.safeParse('x').success, false);
  });

  it('falls back to z.string() for unknown types', () => {
    const schema = jsonSchemaToZod({ type: 'banana' });
    assert.equal(schema.safeParse('x').success, true);
    assert.equal(schema.safeParse(42).success, false);
  });

  it('preserves the description on the schema', () => {
    const schema = jsonSchemaToZod({ type: 'string', description: 'A name' });
    // _def.description survives across Zod 3/4
    const desc = schema._def?.description ?? schema.description;
    assert.equal(desc, 'A name');
  });
});

// ---------------------------------------------------------------------------
// parseAuthorizationHeader
// ---------------------------------------------------------------------------
describe('parseAuthorizationHeader', () => {
  it('extracts the token from a Bearer header', () => {
    assert.equal(parseAuthorizationHeader('Bearer abc123'), 'abc123');
    assert.equal(parseAuthorizationHeader('bearer abc123'), 'abc123');
    assert.equal(parseAuthorizationHeader('BEARER abc123'), 'abc123');
  });

  it('returns the raw value when no "Bearer" prefix', () => {
    assert.equal(parseAuthorizationHeader('rawtoken'), 'rawtoken');
  });

  it('returns null for missing or non-string headers', () => {
    assert.equal(parseAuthorizationHeader(undefined), null);
    assert.equal(parseAuthorizationHeader(''), null);
    assert.equal(parseAuthorizationHeader(null), null);
    assert.equal(parseAuthorizationHeader(['Bearer x']), null);
  });

  it('handles "Bearer " with extra spaces by returning the raw form', () => {
    // "Bearer  x" splits to ['Bearer', '', 'x'] — three parts, not two — so raw return.
    const out = parseAuthorizationHeader('Bearer  x');
    assert.equal(out, 'Bearer  x');
  });
});
