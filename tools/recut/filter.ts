import type { Component, DroppedComponent } from './types.js';

export interface FilterOptions {
  /** Components with fewer pixels than this are specks. */
  readonly minArea: number;
  /**
   * Watermark corner as fractions of sheet width/height measured from the
   * bottom-right. Components fully inside that corner whose area is below
   * `watermarkMaxArea` (fraction of sheet area) are dropped. null disables.
   */
  readonly watermark: { readonly corner: readonly [number, number]; readonly maxArea: number } | null;
}

export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  minArea: 6,
  watermark: { corner: [0.08, 0.12], maxArea: 0.002 },
};

export interface FilterResult {
  readonly kept: Component[];
  readonly dropped: DroppedComponent[];
}

/**
 * Remove specks and the generator's sparkle watermark.
 *
 * A speck whose centre lies inside a larger component's box is not noise: it
 * is a fragment of that sprite isolated by keyed pixels (a rotor blade seen
 * through pink, a highlight on a visor). Those are kept so the frame grouper
 * can attach them. The sparkle sits in the bottom-right corner of every AI
 * sheet; it is only dropped when small, so a legitimate sprite that happens to
 * be last in the last row survives.
 */
export function filterComponents(
  components: readonly Component[],
  sheetWidth: number,
  sheetHeight: number,
  opts: FilterOptions = DEFAULT_FILTER_OPTIONS,
): FilterResult {
  const kept: Component[] = [];
  const dropped: DroppedComponent[] = [];
  const wm = opts.watermark;
  const cornerX = wm ? sheetWidth * (1 - wm.corner[0]) : Infinity;
  const cornerY = wm ? sheetHeight * (1 - wm.corner[1]) : Infinity;
  const maxArea = wm ? wm.maxArea * sheetWidth * sheetHeight : 0;
  // Only sizeable components can host fragments; a cluster of specks is still noise.
  const hosts = components.filter((c) => c.area >= opts.minArea * 20);
  const insideHost = (c: Component): boolean =>
    hosts.some((h) => h !== c && c.cx >= h.x && c.cx < h.x + h.w && c.cy >= h.y && c.cy < h.y + h.h);

  for (const c of components) {
    if (c.area < opts.minArea && !insideHost(c)) {
      dropped.push({ component: c, reason: 'noise' });
      continue;
    }
    if (wm && c.x >= cornerX && c.y >= cornerY && c.area <= maxArea) {
      dropped.push({ component: c, reason: 'watermark' });
      continue;
    }
    kept.push(c);
  }
  return { kept, dropped };
}
