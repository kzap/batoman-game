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

  it('gainHearts raises the cap and current HP, and clamps current to the new cap', () => {
    const full = new Health(3, 5);
    expect(full.gainHearts(1)).toBe(true);
    expect(full.max).toBe(4);
    expect(full.hp).toBe(4);

    const hurt = new Health(3, 5);
    hurt.hit(2);
    expect(hurt.hp).toBe(1);
    expect(hurt.gainHearts(1)).toBe(true);
    expect(hurt.max).toBe(4);
    expect(hurt.hp).toBe(2);

    const over = new Health(3, 5);
    over.hp = 10;
    expect(over.gainHearts(1)).toBe(true);
    expect(over.max).toBe(4);
    expect(over.hp).toBe(4);
  });

  it('gainHearts does nothing for a dead body or a non-positive amount', () => {
    const dead = new Health(3, 5);
    dead.kill();
    expect(dead.gainHearts(1)).toBe(false);
    expect(dead.max).toBe(3);
    expect(dead.hp).toBe(0);

    const full = new Health(3, 5);
    expect(full.gainHearts(0)).toBe(false);
    expect(full.gainHearts(-2)).toBe(false);
    expect(full.max).toBe(3);
    expect(full.hp).toBe(3);
  });

  it('reset after a heart refills to the raised cap', () => {
    const h = new Health(3, 5);
    h.gainHearts(1);
    h.hit(2);
    h.reset();
    expect(h.max).toBe(4);
    expect(h.hp).toBe(4);
    expect(h.invuln).toBe(0);
  });
});
