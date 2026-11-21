/**
 * Results-card presentation, pure so it can be unit-tested without DOM or
 * WebGL. The sim still knows nothing about score: the shell passes the HUD
 * total, this level's share of it, and the hearts left at the exit. The
 * spotlight is the same perspective frustum the stage draws (`LENS`), so the
 * hole sits on Ando at whatever aspect the canvas has.
 */

import { PLAYER } from '@game/tuning';
import { LENS } from '@render/stage';
import { PIXELS_PER_UNIT } from '@render/units';
import { SCORE } from './score';

export const RESULTS = {
  /** How long one non-zero tally line spends counting, in milliseconds. A zero-point line finishes at once. */
  lineMs: 400,
  /** Clear pool of light around the player's body centre, in sim pixels. Covers the 48px body and the salakot. */
  clearPx: 96,
  /** Sim pixels the dim takes to reach full strength past the clear pool. */
  featherPx: 80,
} as const;

export interface TallyLine {
  readonly id: 'kills' | 'clear' | 'hearts';
  readonly label: string;
  readonly points: number;
}

export interface TallyPlan {
  /** Score already on the HUD from earlier levels in this run. The count starts here. */
  readonly base: number;
  readonly lines: readonly TallyLine[];
  /** HUD score the count lands on. */
  readonly total: number;
}

export interface TallyFrame {
  readonly lines: readonly { readonly id: TallyLine['id']; readonly label: string; readonly shown: number }[];
  /** Running total, `base` plus whatever the lines have counted so far. */
  readonly shown: number;
  readonly done: boolean;
}

export interface Spotlight {
  /** CSS pixels, origin at the top-left of the viewport. */
  readonly x: number;
  readonly y: number;
  /** Radius that stays clear, and the radius where the dim is fully opaque. */
  readonly clear: number;
  readonly edge: number;
}

/**
 * Break the HUD score into the three lines the card counts.
 * Kills are whatever this level scored beyond the clear bonus and the heart
 * bonus. The lines always sum to this level's points, and `base` plus that
 * sum is the HUD total, so a short or empty level still lands on the number
 * the HUD is already showing.
 */
export function tallyPlan(score: number, levelScore: number, hp: number): TallyPlan {
  const safeScore = Math.max(0, Math.floor(score));
  const safeLevel = Math.max(0, Math.min(Math.floor(levelScore), safeScore));
  const hearts = Math.min(Math.max(0, Math.floor(hp)) * SCORE.perHeart, safeLevel);
  const clear = Math.min(SCORE.levelClear, safeLevel - hearts);
  const kills = safeLevel - hearts - clear;
  return {
    base: safeScore - safeLevel,
    lines: [
      { id: 'kills', label: 'kills', points: kills },
      { id: 'clear', label: 'clear bonus', points: clear },
      { id: 'hearts', label: 'heart bonus', points: hearts },
    ],
    total: safeScore,
  };
}

const lineShown = (points: number, elapsed: number): number => {
  if (points <= 0) return 0;
  if (elapsed >= RESULTS.lineMs) return points;
  if (elapsed <= 0) return 0;
  return Math.floor((points * elapsed) / RESULTS.lineMs);
};

/** The card's numbers at `elapsedMs` after it appears. `Infinity` is the finished card (reduced motion). */
export function tallyAt(plan: TallyPlan, elapsedMs: number): TallyFrame {
  let left = elapsedMs === Infinity ? Infinity : Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  let added = 0;
  let done = true;
  const lines = plan.lines.map((line) => {
    const dur = line.points > 0 ? RESULTS.lineMs : 0;
    const shown = lineShown(line.points, left);
    if (left >= dur) left -= dur;
    else {
      left = 0;
      done = false;
    }
    added += shown;
    return { id: line.id, label: line.label, shown };
  });
  return { lines, shown: plan.base + added, done };
}

/** Sim-pixel size of the gameplay plane visible at the canvas aspect. Height comes from the lens; width follows the aspect. */
export function gameplayViewPx(viewport: { readonly w: number; readonly h: number }): { readonly w: number; readonly h: number } {
  const w = viewport.w > 0 ? viewport.w : 1;
  const h = viewport.h > 0 ? viewport.h : 1;
  const tanHalf = Math.tan(((LENS.fovDeg / 2) * Math.PI) / 180);
  const viewH = 2 * LENS.distance * tanHalf * PIXELS_PER_UNIT;
  return { w: viewH * (w / h), h: viewH };
}

/** Project a sim point (Y up) to CSS pixels (Y down) through the play lens. The camera looks straight at the gameplay plane. */
export function projectGameplay(
  simX: number,
  simY: number,
  camera: { readonly x: number; readonly y: number },
  viewport: { readonly w: number; readonly h: number },
): { readonly x: number; readonly y: number } {
  const view = gameplayViewPx(viewport);
  const vw = viewport.w > 0 ? viewport.w : 1;
  const vh = viewport.h > 0 ? viewport.h : 1;
  return {
    x: vw * (0.5 + (simX - camera.x) / view.w),
    y: vh * (0.5 - (simY - camera.y) / view.h),
  };
}

const bodyHeight = (pose: string): number => (pose === 'crouch' || pose === 'slide' ? PLAYER.crouchHeight : PLAYER.height);

/** Spotlight centred on the player's body, sized in CSS pixels so it tracks the canvas. */
export function resultsSpotlight(
  player: { readonly x: number; readonly y: number; readonly pose: string },
  camera: { readonly x: number; readonly y: number },
  viewport: { readonly w: number; readonly h: number },
): Spotlight {
  const height = bodyHeight(player.pose);
  const center = projectGameplay(player.x + PLAYER.width / 2, player.y + height / 2, camera, viewport);
  const view = gameplayViewPx(viewport);
  const vh = viewport.h > 0 ? viewport.h : 1;
  const scale = vh / view.h;
  return {
    x: center.x,
    y: center.y,
    clear: RESULTS.clearPx * scale,
    edge: (RESULTS.clearPx + RESULTS.featherPx) * scale,
  };
}
