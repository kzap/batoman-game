import { describe, expect, it } from 'vitest';
import { World } from '@game/world';

/**
 * Replay tests drive the headless sim with a fixed input script and assert the
 * final state. Phase 0 has no input yet; this establishes the harness and the
 * determinism guarantee that later replays depend on.
 */
describe('World replay', () => {
  const run = (ticks: number) => {
    const w = new World();
    for (let i = 0; i < ticks; i++) w.step();
    return w.snapshot();
  };

  it('produces identical snapshots for identical tick counts', () => {
    expect(run(1000)).toEqual(run(1000));
  });

  it('advances exactly one tick per step', () => {
    expect(run(37).tick).toBe(37);
  });

  it('emits a tick event per step', () => {
    const w = new World();
    let seen = 0;
    w.events.on('tick', () => (seen += 1));
    for (let i = 0; i < 10; i++) w.step();
    expect(seen).toBe(10);
  });
});
