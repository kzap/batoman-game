import type { Vec2 } from './vec2';

/**
 * Axis-aligned bounding box in world units. `x`/`y` is the min corner.
 * Y axis points up (world space), matching the Three.js stage.
 */
export interface AABB {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const aabb = (x: number, y: number, w: number, h: number): AABB => ({ x, y, w, h });

export const right = (b: AABB): number => b.x + b.w;
export const top = (b: AABB): number => b.y + b.h;
export const center = (b: AABB): Vec2 => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export const translate = (b: AABB, d: Vec2): AABB => ({ x: b.x + d.x, y: b.y + d.y, w: b.w, h: b.h });

/** True when the boxes share interior area. Touching edges do not count. */
export const overlaps = (a: AABB, b: AABB): boolean =>
  a.x < right(b) && right(a) > b.x && a.y < top(b) && top(a) > b.y;

export const containsPoint = (b: AABB, p: Vec2): boolean =>
  p.x >= b.x && p.x <= right(b) && p.y >= b.y && p.y <= top(b);

/** Smallest box enclosing both inputs. */
export const union = (a: AABB, b: AABB): AABB => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(right(a), right(b)) - x, h: Math.max(top(a), top(b)) - y };
};
