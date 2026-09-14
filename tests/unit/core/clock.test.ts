import { describe, expect, it } from 'vitest';
import { FixedClock, MAX_TICKS_PER_FRAME, SIM_DT, SIM_HZ } from '@core/sim/clock';

describe('FixedClock', () => {
  it('runs SIM_HZ ticks per simulated second at a steady 60 fps', () => {
    const clock = new FixedClock();
    for (let i = 0; i < 60; i++) clock.advance(1 / 60);
    expect(clock.elapsedTicks).toBe(SIM_HZ);
  });

  it('carries sub-tick remainder across frames', () => {
    const clock = new FixedClock();
    const a = clock.advance(SIM_DT * 1.5);
    expect(a.ticks).toBe(1);
    expect(a.alpha).toBeCloseTo(0.5, 6);

    const b = clock.advance(SIM_DT * 0.5);
    expect(b.ticks).toBe(1);
    expect(b.alpha).toBeCloseTo(0, 6);
  });

  it('caps ticks per frame and reports dropped time', () => {
    const clock = new FixedClock();
    const step = clock.advance(5); // a 5 s stall
    expect(step.ticks).toBe(MAX_TICKS_PER_FRAME);
    expect(step.dropped).toBe(true);
    expect(step.alpha).toBeGreaterThanOrEqual(0);
    expect(step.alpha).toBeLessThan(1);
    // The backlog was discarded: one normal frame yields exactly one tick.
    const next = clock.advance(SIM_DT);
    expect(next.ticks).toBe(1);
    expect(next.dropped).toBe(false);
  });

  it('treats negative and NaN durations as zero', () => {
    const clock = new FixedClock();
    expect(clock.advance(-1).ticks).toBe(0);
    expect(clock.advance(Number.NaN).ticks).toBe(0);
    expect(clock.advance(Number.POSITIVE_INFINITY).ticks).toBe(0);
    expect(clock.elapsedTicks).toBe(0);
  });

  it('is deterministic for identical input sequences', () => {
    const frames = Array.from({ length: 200 }, (_, i) => 1 / 60 + (i % 7) * 0.001);
    const run = () => {
      const c = new FixedClock();
      return frames.map((f) => c.advance(f).ticks);
    };
    expect(run()).toEqual(run());
  });
});
