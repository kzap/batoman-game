import type { Background, RGB, RawImage } from './types.js';

export interface BackgroundOptions {
  /** Border ring thickness sampled, in pixels. */
  readonly ring: number;
  /** Colour bucket width in bits dropped per channel (3 => 32 buckets/channel). */
  readonly quantizeBits: number;
  /** A bucket must hold at least this share of border samples to count as background. */
  readonly minShare: number;
  /** Alpha at or below this is treated as already transparent. */
  readonly alphaThreshold: number;
}

export const DEFAULT_BACKGROUND_OPTIONS: BackgroundOptions = {
  ring: 2,
  quantizeBits: 3,
  minShare: 0.02,
  alphaThreshold: 8,
};

/**
 * Find the background palette by sampling the sheet border.
 *
 * Border pixels are quantized and bucketed; every bucket above `minShare` is a
 * background colour. This yields one colour for a flat fill and two for a
 * checkerboard. Each returned colour is the exact mean of its bucket so
 * distance tests downstream are tight.
 */
export function detectBackground(img: RawImage, opts: BackgroundOptions = DEFAULT_BACKGROUND_OPTIONS): Background {
  const { width, height, data } = img;
  const shift = opts.quantizeBits;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let samples = 0;
  let transparent = 0;

  const sample = (x: number, y: number): void => {
    const i = (y * width + x) * 4;
    samples++;
    if (data[i + 3] <= opts.alphaThreshold) transparent++;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> shift) << 16) | ((g >> shift) << 8) | (b >> shift);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  };

  const ring = Math.max(1, Math.min(opts.ring, Math.floor(Math.min(width, height) / 2)));
  for (let y = 0; y < height; y++) {
    const edgeRow = y < ring || y >= height - ring;
    if (edgeRow) {
      for (let x = 0; x < width; x++) sample(x, y);
    } else {
      for (let x = 0; x < ring; x++) sample(x, y);
      for (let x = width - ring; x < width; x++) sample(x, y);
    }
  }

  const colors: RGB[] = [...buckets.values()]
    .filter((b) => b.n / samples >= opts.minShare)
    .sort((a, b) => b.n - a.n)
    .map((b) => ({ r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n) }));

  if (colors.length === 0) {
    // Degenerate border (every colour rare). Fall back to the single most common bucket.
    const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
    if (top) colors.push({ r: Math.round(top.r / top.n), g: Math.round(top.g / top.n), b: Math.round(top.b / top.n) });
  }

  return { colors, transparent: samples > 0 && transparent / samples > 0.5 };
}

/** Chebyshev distance to the nearest palette colour. */
export function distanceToPalette(r: number, g: number, b: number, palette: readonly RGB[]): number {
  let best = Infinity;
  for (const c of palette) {
    const d = Math.max(Math.abs(r - c.r), Math.abs(g - c.g), Math.abs(b - c.b));
    if (d < best) best = d;
  }
  return best;
}

/** Nearest palette colour, used for defringing. */
export function nearestPaletteColor(r: number, g: number, b: number, palette: readonly RGB[]): RGB {
  let best = palette[0];
  let bestD = Infinity;
  for (const c of palette) {
    const d = Math.max(Math.abs(r - c.r), Math.abs(g - c.g), Math.abs(b - c.b));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
