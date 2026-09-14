import { describe, expect, it } from 'vitest';
import { add, approach, clamp, dot, equals, length, lerp, scale, sub, vec2, ZERO } from '@core/math/vec2';

describe('vec2', () => {
  it('performs component-wise arithmetic', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
    expect(sub(vec2(1, 2), vec2(3, 4))).toEqual({ x: -2, y: -2 });
    expect(scale(vec2(1, -2), 3)).toEqual({ x: 3, y: -6 });
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
    expect(length(vec2(3, 4))).toBe(5);
  });

  it('lerps between endpoints', () => {
    expect(lerp(ZERO, vec2(10, 20), 0.5)).toEqual({ x: 5, y: 10 });
    expect(lerp(ZERO, vec2(10, 20), 0)).toEqual(ZERO);
    expect(lerp(ZERO, vec2(10, 20), 1)).toEqual({ x: 10, y: 20 });
  });

  it('compares with tolerance', () => {
    expect(equals(vec2(1, 1), vec2(1 + 1e-12, 1))).toBe(true);
    expect(equals(vec2(1, 1), vec2(1.1, 1))).toBe(false);
  });

  it('does not mutate inputs', () => {
    const a = vec2(1, 1);
    add(a, vec2(5, 5));
    expect(a).toEqual({ x: 1, y: 1 });
  });

  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('approaches a target without overshoot', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 4)).toBe(6);
    expect(approach(1, 0, 4)).toBe(0);
    expect(approach(5, 5, 4)).toBe(5);
  });
});
