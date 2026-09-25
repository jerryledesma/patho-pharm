// Per-entry "latest timestamp wins" merge for progress records. Shared by server and tests
// (the browser has an identical copy in app.js).
export const empty = () => ({ v: 1, items: {}, sessions: {} });

export function merge(a, b) {
  const out = empty();
  for (const part of ['items', 'sessions']) {
    const A = a?.[part] || {}, B = b?.[part] || {};
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const x = A[k], y = B[k];
      out[part][k] = !x ? y : !y ? x : (y.t || 0) > (x.t || 0) ? y : x;
    }
  }
  return out;
}

const ITEM = /^(p-\d{3}|c\d{2}-q\d{2}|fc-\d{3})$/;
const SESSION = /^[a-z]+(:[a-z0-9-]+)?$/;

// Returns an error string, or null if the payload is acceptable.
export function invalid(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return 'body must be an object';
  for (const [part, re] of [['items', ITEM], ['sessions', SESSION]]) {
    const m = rec[part] ?? {};
    if (typeof m !== 'object' || Array.isArray(m)) return `${part} must be an object`;
    for (const [k, v] of Object.entries(m)) {
      if (!re.test(k)) return `bad ${part} key ${k}`;
      if (!v || typeof v !== 'object' || typeof v.t !== 'number') return `${part}.${k} needs a numeric t`;
    }
  }
  return null;
}
