/**
 * Level JSON layout for files under src/content/levels: two-space indent, but
 * any object or array made only of primitives sits on one line. Rects, points
 * and decor entries then diff line by line instead of five lines each.
 */

const isPrimitive = (v: unknown): boolean => v === null || typeof v !== 'object';

function allPrimitive(v: object): boolean {
  return Object.values(v).every(isPrimitive);
}

function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    return `{ ${Object.entries(v)
      .map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`)
      .join(', ')} }`;
  }
  return JSON.stringify(v);
}

/** Arrays of primitives, or of points (objects with at most two primitive fields), stay on one line up to this length. */
const INLINE_MAX = 100;
const POINT_MAX_KEYS = 2;

const isPoint = (x: unknown): boolean => typeof x === 'object' && x !== null && !Array.isArray(x) && Object.keys(x).length <= POINT_MAX_KEYS && allPrimitive(x);

function fits(v: object): boolean {
  if (Array.isArray(v)) {
    if (v.length === 0) return true;
    const flat = v.every((x) => isPrimitive(x) || isPoint(x));
    return flat && inline(v).length <= INLINE_MAX;
  }
  return allPrimitive(v);
}

function format(v: unknown, indent: string): string {
  if (isPrimitive(v)) return JSON.stringify(v);
  const obj = v as object;
  if (fits(obj)) return inline(obj);
  const inner = indent + '  ';
  if (Array.isArray(obj)) return `[\n${obj.map((x) => inner + format(x, inner)).join(',\n')}\n${indent}]`;
  const entries = Object.entries(obj).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${format(x, inner)}`);
  return `{\n${entries.join(',\n')}\n${indent}}`;
}

export function formatLevel(level: unknown): string {
  return format(level, '') + '\n';
}
