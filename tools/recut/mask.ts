import { distanceToPalette, nearestPaletteColor } from './background.js';
import type { Background, Mask, RawImage } from './types.js';

export interface MaskOptions {
  /** Pixels within this Chebyshev distance of a background colour are background. */
  readonly tolerance: number;
  /**
   * Pixels touching the flood region within this (larger) distance are treated as
   * anti-aliased rim and get partial alpha. Must be > tolerance.
   */
  readonly softTolerance: number;
  /** Source alpha at or below this counts as background regardless of colour. */
  readonly alphaThreshold: number;
  /**
   * What to do with background-coloured pixels the border flood cannot reach.
   * keep: they are part of the sprite (white shoes on a white sheet).
   * key:  they are background showing through a gap (pink between an arm and a torso);
   *       every pixel within tolerance of the key is cleared, reachable or not.
   * auto: key when the background is saturated (a deliberate chroma key), else keep.
   */
  readonly enclosed: 'auto' | 'keep' | 'key';
}

export const DEFAULT_MASK_OPTIONS: MaskOptions = {
  tolerance: 28,
  softTolerance: 90,
  alphaThreshold: 8,
  enclosed: 'auto',
};

/** Chroma-key colours are chosen to be saturated; sheet paper is not. */
export function isSaturated(bg: Background): boolean {
  return bg.colors.some((c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 60);
}

/**
 * Build a foreground mask by flood-filling background from the sheet border.
 *
 * Only pixels reachable from the border through background-like pixels become
 * transparent. Anything enclosed by foreground (white shoes on a white sheet,
 * eye highlights) is kept even if its colour matches the background - this is
 * exactly the failure mode of the v1 global chroma key, and it is reversible
 * because that tool left the RGB under alpha=0 intact.
 *
 * After the hard fill, one ring of pixels adjacent to the fill whose colour is
 * between `tolerance` and `softTolerance` from the background gets partial
 * alpha proportional to that distance, so anti-aliased edges do not turn into
 * a halo of background-tinted fringe.
 */
export function buildMask(img: RawImage, bg: Background, opts: MaskOptions = DEFAULT_MASK_OPTIONS): Mask {
  const { width, height, data } = img;
  const n = width * height;
  const alpha = new Uint8Array(n).fill(255);
  const palette = bg.colors;

  const isBackgroundLike = (i: number): boolean => {
    const p = i * 4;
    if (data[p + 3] <= opts.alphaThreshold) return true;
    return distanceToPalette(data[p], data[p + 1], data[p + 2], palette) <= opts.tolerance;
  };

  // Iterative flood with an explicit stack; 4-connected so a 1px diagonal line
  // of foreground still fences off the interior.
  const stack = new Int32Array(n);
  let top = 0;
  const seed = (i: number): void => {
    if (alpha[i] === 255 && isBackgroundLike(i)) {
      alpha[i] = 0;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (top > 0) {
    const i = stack[--top];
    const x = i % width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i + width < n) seed(i + width);
  }

  const span = opts.softTolerance - opts.tolerance;
  const keyEnclosed = opts.enclosed === 'key' || (opts.enclosed === 'auto' && isSaturated(bg));

  if (keyEnclosed) {
    // Hard-key every unreached pixel within tolerance of the key colour. No
    // soft keying here: rust and skin tones are closer to pink than one might
    // think, and un-mixing them would tint the whole sprite. Feathering is
    // handled by the adjacency rim below, which now also runs along pockets.
    for (let i = 0; i < n; i++) {
      if (alpha[i] !== 255) continue;
      const p = i * 4;
      if (distanceToPalette(data[p], data[p + 1], data[p + 2], palette) <= opts.tolerance) alpha[i] = 0;
    }
  }

  // Soft rim: foreground pixels 4-adjacent to the fill, colour within softTolerance.
  if (span > 0) {
    const rim: number[] = [];
    for (let i = 0; i < n; i++) {
      if (alpha[i] !== 255) continue;
      const x = i % width;
      const touches =
        (x > 0 && alpha[i - 1] === 0) ||
        (x < width - 1 && alpha[i + 1] === 0) ||
        (i >= width && alpha[i - width] === 0) ||
        (i + width < n && alpha[i + width] === 0);
      if (!touches) continue;
      const p = i * 4;
      if (data[p + 3] <= opts.alphaThreshold) continue; // enclosed-then-erased pixels stay solid
      const d = distanceToPalette(data[p], data[p + 1], data[p + 2], palette);
      if (d < opts.softTolerance) rim.push(i, d);
    }
    for (let k = 0; k < rim.length; k += 2) {
      const d = rim[k + 1];
      const t = Math.max(0, d - opts.tolerance) / span;
      alpha[rim[k]] = Math.max(1, Math.round(255 * t));
    }
  }

  return { width, height, alpha };
}

/**
 * Compose the final RGBA sheet: mask alpha, with rim pixels defringed by
 * un-mixing the nearest background colour (c = fg*a + bg*(1-a) solved for fg).
 * Pixels the previous tool erased but the flood kept are restored opaque.
 */
export function applyMask(img: RawImage, mask: Mask, bg: Background): RawImage {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const palette = bg.colors;
  for (let i = 0, p = 0; i < mask.alpha.length; i++, p += 4) {
    const a = mask.alpha[i];
    if (a === 0) {
      // Leave RGB zeroed for better compression.
      continue;
    }
    let r = data[p];
    let g = data[p + 1];
    let b = data[p + 2];
    if (a < 255 && a >= 26) {
      // Un-mix against the key colour. Below ~10% alpha the division amplifies
      // noise into garbage colours, and the pixel is nearly invisible anyway.
      const c = nearestPaletteColor(r, g, b, palette);
      const t = a / 255;
      r = (r - c.r * (1 - t)) / t;
      g = (g - c.g * (1 - t)) / t;
      b = (b - c.b * (1 - t)) / t;
    }
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = a;
  }
  return { width, height, data: out };
}
