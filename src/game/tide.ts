/**
 * Pasig tide surface from `world.tick`. Pure function of tick and `TIDE` so
 * replays stay exact and #67 can retune without rewriting tests.
 */

import type { Rect } from '@content/level';
import { TIDE, TIDE_PERIOD_TICKS } from './tuning';

/** Water surface y at `tick` (1-based world tick, or 0 before the first step). */
export function tideTop(tick: number): number {
  const { riseTicks, holdTicks, fallTicks, lowTop, highTop } = TIDE;
  const phase = ((tick % TIDE_PERIOD_TICKS) + TIDE_PERIOD_TICKS) % TIDE_PERIOD_TICKS;
  const span = highTop - lowTop;
  if (phase < riseTicks) {
    // Tick 0 and the first rise tick both sit at lowTop; the climb finishes on the last rise tick.
    if (riseTicks <= 1) return highTop;
    return lowTop + Math.round((span * phase) / (riseTicks - 1));
  }
  if (phase < riseTicks + holdTicks) return highTop;
  const fallPhase = phase - riseTicks - holdTicks;
  if (fallTicks <= 1) return lowTop;
  return highTop - Math.round((span * fallPhase) / (fallTicks - 1));
}

/** Live death volume for one authored column: floor at y=0 up to the current surface. */
export function tideRect(volume: Rect, tick: number): Rect {
  const top = tideTop(tick);
  const h = Math.max(0, Math.min(top, volume.y + volume.h) - volume.y);
  return { x: volume.x, y: volume.y, w: volume.w, h };
}

/** Every tide volume grown to the current surface. Empty when the level has none. */
export function tideRects(volumes: readonly Rect[] | undefined, tick: number): readonly Rect[] {
  if (!volumes || volumes.length === 0) return [];
  return volumes.map((v) => tideRect(v, tick));
}
