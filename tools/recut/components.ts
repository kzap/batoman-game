import type { Component, Mask } from './types.js';

export interface ComponentOptions {
  /** Mask alpha above this counts as foreground for labelling. */
  readonly alphaThreshold: number;
  /**
   * Foreground pixels up to this many pixels apart are joined. 0 = 8-connected
   * only. Sprites drawn with thin gaps (a detached hat brim) need 1-2.
   */
  readonly bridge: number;
}

export const DEFAULT_COMPONENT_OPTIONS: ComponentOptions = { alphaThreshold: 0, bridge: 0 };

/**
 * Label connected foreground blobs. 8-connectivity, plus an optional `bridge`
 * radius so near-touching pieces fuse. Returns components sorted by id, which is
 * assigned in scan order (top-left first) so ids are deterministic.
 */
export interface Labelling {
  readonly components: Component[];
  /** Per-pixel component id (1-based); 0 = background. Same layout as the mask. */
  readonly labels: Int32Array;
}

export function labelComponents(mask: Mask, opts: ComponentOptions = DEFAULT_COMPONENT_OPTIONS): Labelling {
  const { width, height, alpha } = mask;
  const n = width * height;
  const labels = new Int32Array(n); // 0 = unvisited/background
  const stack = new Int32Array(n);
  const reach = 1 + Math.max(0, Math.floor(opts.bridge));
  const components: Component[] = [];

  for (let start = 0; start < n; start++) {
    if (labels[start] !== 0 || alpha[start] <= opts.alphaThreshold) continue;
    const id = components.length + 1;
    let top = 0;
    labels[start] = id;
    stack[top++] = start;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let sumW = 0;

    while (top > 0) {
      const i = stack[--top];
      const x = i % width;
      const y = (i - x) / width;
      const a = alpha[i];
      area++;
      sumX += x * a;
      sumY += y * a;
      sumW += a;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const y0 = Math.max(0, y - reach);
      const y1 = Math.min(height - 1, y + reach);
      const x0 = Math.max(0, x - reach);
      const x1 = Math.min(width - 1, x + reach);
      for (let ny = y0; ny <= y1; ny++) {
        let j = ny * width + x0;
        for (let nx = x0; nx <= x1; nx++, j++) {
          if (labels[j] === 0 && alpha[j] > opts.alphaThreshold) {
            labels[j] = id;
            stack[top++] = j;
          }
        }
      }
    }

    components.push({
      id,
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      area,
      // +0.5: pixel (x, y) covers [x, x+1), so its centre is x + 0.5. Keeps mass
      // centroids consistent with box centres (x + w / 2).
      cx: sumW > 0 ? sumX / sumW + 0.5 : minX + (maxX - minX + 1) / 2,
      cy: sumW > 0 ? sumY / sumW + 0.5 : minY + (maxY - minY + 1) / 2,
    });
  }

  return { components, labels };
}
