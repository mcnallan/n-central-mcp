// @ts-check
/** In-memory counters and gauges, rendered in Prometheus text format. */

const counters = new Map();

/**
 * Increment a counter.
 * @param {string} name
 * @param {Record<string, string | number>} [labels]
 * @param {number} [by=1]
 */
export function inc(name, labels = {}, by = 1) {
  const key = makeKey(name, labels);
  counters.set(key, (counters.get(key) || 0) + by);
}

/**
 * Set a gauge value.
 * @param {string} name
 * @param {number} value
 */
const gauges = new Map();
export function setGauge(name, value) {
  gauges.set(name, value);
}

function makeKey(name, labels) {
  const labelKeys = Object.keys(labels).sort();
  if (labelKeys.length === 0) return name;
  const parts = labelKeys.map(k => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`);
  return `${name}{${parts.join(',')}}`;
}

/** Render in Prometheus text exposition format. @returns {string} */
export function renderPrometheus() {
  const lines = [];
  const byName = new Map();
  for (const [key, value] of counters) {
    const name = key.split('{')[0];
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push([key, value]);
  }
  for (const [name, entries] of byName) {
    lines.push(`# TYPE ${name} counter`);
    for (const [key, value] of entries) {
      lines.push(`${key} ${value}`);
    }
  }
  for (const [name, value] of gauges) {
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${value}`);
  }
  return lines.join('\n') + '\n';
}
