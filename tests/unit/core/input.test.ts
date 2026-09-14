import { describe, expect, it } from 'vitest';
import { INPUT_BUTTONS, InputEdges, NO_INPUT, inputAxis, packInput, unpackInput } from '@core/sim/input';
import { Rng } from '@core/sim/rng';

describe('InputFrame packing', () => {
  it('round-trips every button combination', () => {
    for (let bits = 0; bits < 1 << INPUT_BUTTONS.length; bits++) expect(packInput(unpackInput(bits))).toBe(bits);
    expect(packInput(NO_INPUT)).toBe(0);
  });

  it('axis cancels when both directions are held', () => {
    expect(inputAxis({ ...NO_INPUT, left: true })).toBe(-1);
    expect(inputAxis({ ...NO_INPUT, right: true })).toBe(1);
    expect(inputAxis({ ...NO_INPUT, left: true, right: true })).toBe(0);
  });
});

describe('InputEdges', () => {
  it('reports presses and releases only on the transition tick', () => {
    const e = new InputEdges();
    e.update({ ...NO_INPUT, jump: true });
    expect(e.pressed('jump')).toBe(true);
    expect(e.held('jump')).toBe(true);
    e.update({ ...NO_INPUT, jump: true });
    expect(e.pressed('jump')).toBe(false);
    e.update(NO_INPUT);
    expect(e.released('jump')).toBe(true);
    e.update(NO_INPUT);
    expect(e.released('jump')).toBe(false);
  });
});

describe('Rng', () => {
  it('is deterministic per seed and stays in range', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seq = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seq);
    expect(new Rng(43).next()).not.toBe(seq[0]);
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      const f = r.range(-1, 1);
      expect(f).toBeGreaterThanOrEqual(-1);
      expect(f).toBeLessThan(1);
    }
    expect(new Rng(1).chance(1)).toBe(true);
    expect(new Rng(1).chance(0)).toBe(false);
  });
});
