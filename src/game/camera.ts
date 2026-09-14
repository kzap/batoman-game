import type { Rng } from '@core/sim/rng';
import { clamp } from '@core/math/vec2';
import { CAMERA } from './tuning';

export interface CameraTarget {
  /** Player centre x and feet y, in sim pixels. */
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly moving: boolean;
  readonly grounded: boolean;
}

export interface CameraSnapshot {
  /** Centre of the view in sim pixels, without shake. */
  readonly x: number;
  readonly y: number;
  /** Shake offset for this tick; the renderer adds it without interpolation. */
  readonly shakeX: number;
  readonly shakeY: number;
}

/**
 * Deterministic follow camera: deadzone, eased look-ahead, per-tick fractional
 * smoothing, level bounds, and a decaying random shake driven by the world's
 * seeded RNG. Lives in game/ so replays reproduce the framing exactly.
 */
/** Range of camera centres that keep the view inside a level; a level smaller than the view is centred. */
export function cameraBounds(levelW: number, levelH: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const halfW = CAMERA.viewW / 2;
  const halfH = CAMERA.viewH / 2;
  return {
    minX: levelW <= CAMERA.viewW ? levelW / 2 : halfW,
    maxX: levelW <= CAMERA.viewW ? levelW / 2 : levelW - halfW,
    minY: levelH <= CAMERA.viewH ? levelH / 2 : halfH,
    maxY: levelH <= CAMERA.viewH ? levelH / 2 : levelH - halfH,
  };
}

export class CameraController {
  x: number;
  y: number;
  private lookAhead = 0;
  private shakeLeft = 0;
  private shakeTotal = 0;
  private shakeAmp = 0;
  private shakeX = 0;
  private shakeY = 0;

  constructor(
    private readonly levelW: number,
    private readonly levelH: number,
    start: { x: number; y: number },
  ) {
    const c = this.clampToBounds(start.x, start.y + CAMERA.focusAboveFeet);
    this.x = c.x;
    this.y = c.y;
  }

  /** Jump straight to the target (level start, respawn). */
  snapTo(target: CameraTarget): void {
    this.lookAhead = 0;
    const c = this.clampToBounds(target.x, target.y + CAMERA.focusAboveFeet);
    this.x = c.x;
    this.y = c.y;
  }

  shake(amplitude: number, ticks: number): void {
    if (amplitude * ticks <= this.shakeAmp * this.shakeLeft) return; // keep the stronger one
    this.shakeAmp = amplitude;
    this.shakeTotal = ticks;
    this.shakeLeft = ticks;
  }

  update(target: CameraTarget, rng: Rng): void {
    // Look-ahead eases toward the facing direction while running, back to zero when still.
    const wantLook = target.moving ? target.facing * CAMERA.lookAhead : 0;
    this.lookAhead += (wantLook - this.lookAhead) * CAMERA.lookAheadEase;

    const tx = target.x + this.lookAhead;
    const ty = target.y + CAMERA.focusAboveFeet;

    // Deadzone: only the part of the offset outside the box pulls the camera.
    const dx = tx - this.x;
    const pullX = Math.abs(dx) > CAMERA.deadzoneX ? dx - Math.sign(dx) * CAMERA.deadzoneX : 0;
    const dy = ty - this.y;
    const up = target.grounded ? CAMERA.deadzoneY : CAMERA.airDeadzoneUp;
    let pullY = 0;
    if (dy > up) pullY = dy - up;
    else if (dy < -CAMERA.deadzoneY) pullY = dy + CAMERA.deadzoneY;

    const c = this.clampToBounds(this.x + pullX * CAMERA.followX, this.y + pullY * CAMERA.followY);
    this.x = c.x;
    this.y = c.y;

    if (this.shakeLeft > 0) {
      const amp = this.shakeAmp * (this.shakeLeft / this.shakeTotal);
      this.shakeX = rng.range(-amp, amp);
      this.shakeY = rng.range(-amp, amp);
      this.shakeLeft--;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  private clampToBounds(x: number, y: number): { x: number; y: number } {
    const b = cameraBounds(this.levelW, this.levelH);
    return { x: clamp(x, b.minX, b.maxX), y: clamp(y, b.minY, b.maxY) };
  }

  snapshot(): CameraSnapshot {
    return { x: this.x, y: this.y, shakeX: this.shakeX, shakeY: this.shakeY };
  }
}
