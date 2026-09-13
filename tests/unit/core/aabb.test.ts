import { describe, expect, it } from 'vitest';
import { aabb, center, containsPoint, overlaps, right, top, translate, union } from '@core/math/aabb';

describe('aabb', () => {
  const a = aabb(0, 0, 10, 10);

  it('derives edges and center', () => {
    expect(right(a)).toBe(10);
    expect(top(a)).toBe(10);
    expect(center(a)).toEqual({ x: 5, y: 5 });
  });

  it('detects interior overlap but not edge contact', () => {
    expect(overlaps(a, aabb(5, 5, 10, 10))).toBe(true);
    expect(overlaps(a, aabb(10, 0, 5, 5))).toBe(false); // touching right edge
    expect(overlaps(a, aabb(0, 10, 5, 5))).toBe(false); // touching top edge
    expect(overlaps(a, aabb(20, 20, 1, 1))).toBe(false);
  });

  it('contains points inclusively', () => {
    expect(containsPoint(a, { x: 0, y: 0 })).toBe(true);
    expect(containsPoint(a, { x: 10, y: 10 })).toBe(true);
    expect(containsPoint(a, { x: 10.01, y: 5 })).toBe(false);
  });

  it('translates and unions', () => {
    expect(translate(a, { x: 2, y: -3 })).toEqual({ x: 2, y: -3, w: 10, h: 10 });
    expect(union(a, aabb(-5, 5, 2, 20))).toEqual({ x: -5, y: 0, w: 15, h: 25 });
  });
});
