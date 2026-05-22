/**
 * Audit logging. Structured JSON to stderr; redacts sensitive keys.
 *
 * MCP_AUDIT_LEVEL: off | sensitive (default) | all
 */

const SENSITIVE_KEYS = /token|password|secret|jwt|credential|authoriz|api[_-]?key|bearer|cookie|x-api/i;

const LEVEL = (process.env.MCP_AUDIT_LEVEL || 'sensitive').toLowerCase();

const ROUTINE_EVENTS = new Set(['tool_call']);

export function auditLog(event, data = {}) {
  if (LEVEL === 'off') return;
  if (LEVEL === 'sensitive' && ROUTINE_EVENTS.has(event)) return;

  const entry = { timestamp: new Date().toISOString(), event, ...data };
  if (entry.args) entry.args = redact(entry.args);
  try {
    console.error(`[audit] ${safeStringify(entry)}`);
  } catch {
    console.error(`[audit] {"event":"${event}","error":"serialization failed"}`);
  }
}

function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
}

function redact(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  if (typeof obj !== 'object') return obj;

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : (typeof v === 'object' && v !== null ? redact(v) : v);
  }
  return out;
}
