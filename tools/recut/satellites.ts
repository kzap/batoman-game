import type { Component } from './types.js';
import { horizontalGap } from './types.js';

export interface SatelliteOptions {
  /** Components with area below ratio * (row median area) are satellites. */
  readonly ratio: number;
  /** Max horizontal gap for attaching a satellite, as a fraction of the median primary width. */
  readonly maxGap: number;
  /** Two primaries whose x-ranges overlap by at least this fraction of the narrower one are fused. */
  readonly overlapMerge: number;
}

export const DEFAULT_SATELLITE_OPTIONS: SatelliteOptions = { ratio: 0.2, maxGap: 0.35, overlapMerge: 0.5 };

export interface FrameGroup {
  readonly primary: Component;
  readonly satellites: Component[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Group a row of components into frames.
 *
 * 1. Split into primaries (big) and satellites (small) using the row's median area,
 *    so a row of bullets is all primaries while a smoke puff next to a horse is not.
 * 2. Fuse primaries whose x-ranges substantially overlap (a sprite cut in two by
 *    a thin gap). The larger piece stays primary.
 * 3. Attach each satellite to the nearest primary within reach; otherwise it is
 *    promoted to its own frame so nothing is silently lost.
 */
export function groupFrames(row: readonly Component[], opts: SatelliteOptions = DEFAULT_SATELLITE_OPTIONS): FrameGroup[] {
  if (row.length === 0) return [];
  const medArea = median(row.map((c) => c.area));
  const threshold = medArea * opts.ratio;
  const primaries = row.filter((c) => c.area >= threshold);
  const small = row.filter((c) => c.area < threshold);

  const groups: FrameGroup[] = primaries.map((p) => ({ primary: p, satellites: [] }));

  // Step 2: fuse overlapping primaries until stable.
  let fused = true;
  while (fused) {
    fused = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i].primary;
        const b = groups[j].primary;
        const overlap = -horizontalGap(a, b);
        if (overlap >= opts.overlapMerge * Math.min(a.w, b.w)) {
          const [keep, drop] = a.area >= b.area ? [groups[i], groups[j]] : [groups[j], groups[i]];
          keep.satellites.push(drop.primary, ...drop.satellites);
          groups.splice(groups.indexOf(drop), 1);
          fused = true;
          break outer;
        }
      }
    }
  }

  // Step 3: attach satellites.
  const medWidth = median(groups.map((g) => g.primary.w));
  const reach = medWidth * opts.maxGap;
  for (const s of small) {
    let best: FrameGroup | null = null;
    let bestDist = Infinity;
    for (const g of groups) {
      if (horizontalGap(s, g.primary) > reach) continue;
      const d = Math.abs(s.cx - g.primary.cx) + Math.abs(s.cy - g.primary.cy) * 0.25;
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    if (best) best.satellites.push(s);
    else groups.push({ primary: s, satellites: [] });
  }

  groups.sort((a, b) => a.primary.x - b.primary.x);
  return groups;
}

export interface CatalogueGroups {
  readonly groups: FrameGroup[];
  /** Fragments that lie inside no prop; reported as noise. */
  readonly stray: Component[];
}

/**
 * Group a catalogue row. Props are never fused with each other; a fragment
 * (area below `minPrimaryArea`) joins the prop whose box contains its centroid,
 * and one inside no prop is stray dust.
 */
export function groupCatalogue(row: readonly Component[], minPrimaryArea: number): CatalogueGroups {
  const groups: FrameGroup[] = row.filter((c) => c.area >= minPrimaryArea).map((p) => ({ primary: p, satellites: [] }));
  const stray: Component[] = [];
  for (const c of row) {
    if (c.area >= minPrimaryArea) continue;
    const host = groups.find((g) => c.cx >= g.primary.x && c.cx < g.primary.x + g.primary.w && c.cy >= g.primary.y && c.cy < g.primary.y + g.primary.h);
    if (host) host.satellites.push(c);
    else stray.push(c);
  }
  groups.sort((a, b) => a.primary.x - b.primary.x);
  return { groups, stray };
}
