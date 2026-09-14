import { describe, expect, it } from 'vitest';
import { Health } from '@game/health';

describe('Health', () => {
  it('takes damage once per invulnerability window', () => {
    const h = new Health(3, 5);
    expect(h.hit(1)).toBe(true);
    expect(h.hp).toBe(2);
    expect(h.hit(1)).toBe(false);
    for (let i = 0; i < 5; i++) h.tick();
    expect(h.invulnerable).toBe(false);
    expect(h.hit(5)).toBe(true);
    expect(h.hp).toBe(0);
    expect(h.alive).toBe(false);
    expect(h.hit(1)).toBe(false);
  });

  it('kill ignores i-frames and reset restores everything', () => {
    const h = new Health(3, 5);
    h.hit(1);
    h.kill();
    expect(h.hp).toBe(0);
    expect(h.invulnerable).toBe(false);
    h.reset();
    expect(h.hp).toBe(3);
    expect(h.hit(0)).toBe(false);
  });
});
