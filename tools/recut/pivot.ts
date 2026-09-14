import type { Component, Frame, Mask } from './types.js';

export type PivotMode = 'mass' | 'contact' | 'center';

export interface PivotOptions {
  /**
   * mass: alpha-weighted centroid of the primary silhouette (default; tracks the body).
   * contact: centroid of the bottom `contactBand` of the primary (tracks the feet).
   * center: bounding-box centre (for projectiles and floating sprites).
   */
  readonly mode: PivotMode;
  /** Height of the contact band as a fraction of the primary height (contact mode). */
  readonly contactBand: number;
  /** Vertical anchor: 'bottom' for grounded actors, 'center' for flyers/projectiles. */
  readonly anchor: 'bottom' | 'center';
}

export const DEFAULT_PIVOT_OPTIONS: PivotOptions = { mode: 'mass', contactBand: 0.08, anchor: 'bottom' };

/** Pivot for one frame, in sheet pixel coordinates. */
export function computePivot(primary: Component, mask: Mask, opts: PivotOptions = DEFAULT_PIVOT_OPTIONS): { x: number; y: number } {
  const y = opts.anchor === 'bottom' ? primary.y + primary.h : primary.y + primary.h / 2;
  switch (opts.mode) {
    case 'center':
      return { x: primary.x + primary.w / 2, y };
    case 'mass':
      return { x: primary.cx, y };
    case 'contact': {
      const bandH = Math.max(2, Math.round(primary.h * opts.contactBand));
      const y0 = primary.y + primary.h - bandH;
      let sum = 0;
      let weight = 0;
      for (let py = y0; py < primary.y + primary.h; py++) {
        let i = py * mask.width + primary.x;
        for (let px = primary.x; px < primary.x + primary.w; px++, i++) {
          const a = mask.alpha[i];
          sum += px * a;
          weight += a;
        }
      }
      return { x: weight > 0 ? sum / weight + 0.5 : primary.cx, y };
    }
  }
}

/**
 * Damp horizontal pivot jitter within one animation. Each frame's pivot offset
 * from its primary bounding-box centre is replaced by the animation's median
 * offset, so a foot swinging forward does not drag the whole sprite with it.
 * Frames that deviate less than `deadband` pixels are left untouched.
 */
export function stabilizePivots(frames: readonly Frame[], deadband = 1): Frame[] {
  if (frames.length < 3) return [...frames];
  const offsets = frames.map((f) => f.pivot.x - (f.primary.x + f.primary.w / 2)).sort((a, b) => a - b);
  const mid = offsets.length >> 1;
  const medianOffset = offsets.length % 2 ? offsets[mid] : (offsets[mid - 1] + offsets[mid]) / 2;
  return frames.map((f) => {
    const centre = f.primary.x + f.primary.w / 2;
    const target = centre + medianOffset;
    if (Math.abs(target - f.pivot.x) <= deadband) return f;
    return { ...f, pivot: { x: target, y: f.pivot.y } };
  });
}
