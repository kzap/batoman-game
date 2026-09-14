import { NO_INPUT, type InputFrame } from '@core/sim/input';
import type { Policy } from './harness';

/**
 * Scripted policies used to record fixtures. They read the live world, so
 * they are not deterministic scripts themselves; the recorded inputs are.
 *
 * Level 1 route: run right; jump the first pit; hop onto the one-way platform
 * and drop through it; jump the block; wait for the moving platform, ride it
 * across the second pit; jump the spikes; run into the exit.
 */
export const clearLevel1: Policy = (world, snap) => {
  const p = world.player;
  const b = p.body;
  const onFloor = p.grounded && b.y === 64;
  const rising = p.vy > 0;
  const mover = snap.movingSolids[0];
  let f: InputFrame = { ...NO_INPUT, right: true, jump: rising };
  const jumpNow = (): void => {
    f = { ...f, jump: true };
  };

  if (snap.tick === 60) f = { ...f, dash: true };
  if (snap.tick % 240 === 0) f = { ...f, fire: true };

  // First pit at 1280..1376: jump from the very edge.
  if (onFloor && b.right >= 1272 && b.right <= 1280) jumpNow();
  // One-way platform at 1600..1760, top 104: get on, then drop through.
  if (onFloor && b.x >= 1548 && b.x <= 1562) jumpNow();
  if (p.grounded && b.y === 104 && b.x >= 1690) f = { ...f, right: false, down: true, jump: true };
  // Block at 1984..2048 (top 128).
  if (onFloor && b.right >= 1940 && b.right <= 1960) jumpNow();
  // Second pit at 2400..2656, crossed on the moving platform (top 48).
  if (mover) {
    const atEdge = onFloor && b.right >= 2380 && b.right < 2400;
    if (atEdge && mover.x > 2404) f = { ...f, right: false, jump: false };
    const riding = p.grounded && b.y === 48;
    if (riding) {
      if (mover.x < 2552) f = { ...f, right: false, jump: false };
      else if (b.right >= mover.x + mover.w - 4) jumpNow();
    }
  }
  // Spikes at 3200..3264.
  if (onFloor && b.right >= 3190 && b.right <= 3200) jumpNow();
  return f;
};
