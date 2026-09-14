import type { Box, Component } from './types.js';

export interface RowOptions {
  /** Vertical gaps in the coverage profile shorter than this do not split rows. */
  readonly gap: number;
  /**
   * A run of scanlines covered by at most this many components splits a band when
   * the neighbouring runs on both sides are covered by at least `strong`. Catches
   * one tall sprite (a big projectile, a jump pose) that bridges two rows.
   */
  readonly thin: number;
  readonly strong: number;
}

export const DEFAULT_ROW_OPTIONS: RowOptions = { gap: 6, thin: 1, strong: 3 };

export interface RowBand {
  readonly y0: number;
  readonly y1: number; // exclusive
}

function coverageProfile(components: readonly Box[], sheetHeight: number): Uint16Array {
  const coverage = new Uint16Array(sheetHeight);
  for (const c of components) {
    const end = Math.min(sheetHeight, c.y + c.h);
    for (let y = Math.max(0, c.y); y < end; y++) coverage[y]++;
  }
  return coverage;
}

/** Maximal runs of covered scanlines, tolerating empty gaps up to `gap`. */
function coveredRuns(coverage: Uint16Array, gap: number): RowBand[] {
  const bands: RowBand[] = [];
  let y = 0;
  while (y < coverage.length) {
    if (coverage[y] === 0) {
      y++;
      continue;
    }
    const y0 = y;
    let lastCovered = y;
    while (y < coverage.length) {
      if (coverage[y] > 0) {
        lastCovered = y;
        y++;
      } else if (y - lastCovered <= gap) {
        y++;
      } else {
        break;
      }
    }
    bands.push({ y0, y1: lastCovered + 1 });
  }
  return bands;
}

/**
 * Split one band at thin runs (coverage <= thin) whose flanking segments both
 * reach `strong` coverage. The thin run is attached to the segment that follows
 * it; components are later assigned by centroid so the exact cut line does not matter.
 */
function splitThin(band: RowBand, coverage: Uint16Array, opts: RowOptions): RowBand[] {
  // Segment the band into alternating thin/dense runs.
  const runs: { y0: number; y1: number; thin: boolean; peak: number }[] = [];
  for (let y = band.y0; y < band.y1; y++) {
    const isThin = coverage[y] <= opts.thin;
    const last = runs[runs.length - 1];
    if (last && last.thin === isThin) {
      last.y1 = y + 1;
      last.peak = Math.max(last.peak, coverage[y]);
    } else {
      runs.push({ y0: y, y1: y + 1, thin: isThin, peak: coverage[y] });
    }
  }
  const out: RowBand[] = [];
  let start = band.y0;
  for (let i = 1; i < runs.length - 1; i++) {
    const run = runs[i];
    if (!run.thin) continue;
    // Find the nearest dense peaks on each side (skipping other thin runs).
    let left = -1;
    for (let j = i - 1; j >= 0; j--) if (!runs[j].thin) { left = j; break; }
    let right = -1;
    for (let j = i + 1; j < runs.length; j++) if (!runs[j].thin) { right = j; break; }
    if (left < 0 || right < 0) continue;
    if (runs[left].peak >= opts.strong && runs[right].peak >= opts.strong && run.y0 > start) {
      out.push({ y0: start, y1: run.y0 });
      start = run.y0;
    }
  }
  out.push({ y0: start, y1: band.y1 });
  return out;
}

/** Components too small to define a row on their own (fragments, debris, specks). */
/** Components at least 2% of the largest one's area; everything smaller is a fragment. */
function substantial<T extends Component>(components: readonly T[]): T[] {
  // Relative to the largest component, not the median: on a keyed AI sheet the
  // fragments outnumber the sprites and would drag a median down to speck size.
  const largest = components.reduce((m, c) => Math.max(m, c.area), 0);
  const floor = largest * 0.02;
  return components.filter((c) => c.area >= floor);
}

/**
 * Find row bands from the vertical coverage profile: a row is a maximal run of
 * scanlines covered by at least one substantial component, tolerating short
 * empty gaps, and split wherever a lone component is the only thing bridging
 * two dense regions. Fragments do not create rows; they join the nearest one.
 */
export function findRowBands(components: readonly Component[], sheetHeight: number, opts: RowOptions = DEFAULT_ROW_OPTIONS): RowBand[] {
  const coverage = coverageProfile(substantial(components), sheetHeight);
  return coveredRuns(coverage, opts.gap).flatMap((band) => splitThin(band, coverage, opts));
}

/**
 * Assign each component to the band containing its centroid, then order rows
 * top-to-bottom and components left-to-right. A centroid in a gap goes to the
 * nearest band.
 */
export function clusterRows(components: readonly Component[], sheetHeight: number, opts: RowOptions = DEFAULT_ROW_OPTIONS): Component[][] {
  const bands = findRowBands(components, sheetHeight, opts);
  const rows: Component[][] = bands.map(() => []);
  for (const c of components) {
    let idx = bands.findIndex((b) => c.cy >= b.y0 && c.cy < b.y1);
    if (idx < 0) {
      let best = Infinity;
      bands.forEach((b, i) => {
        const d = c.cy < b.y0 ? b.y0 - c.cy : c.cy - b.y1;
        if (d < best) {
          best = d;
          idx = i;
        }
      });
    }
    if (idx >= 0) rows[idx].push(c);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x || a.y - b.y);
  return rows.filter((r) => r.length > 0);
}
