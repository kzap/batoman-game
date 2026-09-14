/**
 * Shared types for the recut pipeline. Everything here is plain data so the
 * segmenter stages stay pure and unit-testable without touching disk.
 */

/** Tightly packed RGBA, row-major, 4 bytes per pixel. */
export interface RawImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** One byte per pixel: 0 = background, 255 = solid foreground, between = anti-aliased rim. */
export interface Mask {
  readonly width: number;
  readonly height: number;
  readonly alpha: Uint8Array;
}

export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Integer pixel rectangle, inclusive of x/y, exclusive of x+w/y+h. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A connected blob of foreground pixels. */
export interface Component extends Box {
  readonly id: number;
  /** Count of pixels with alpha above the labelling threshold. */
  readonly area: number;
  /** Alpha-weighted centroid in sheet pixel coordinates. */
  readonly cx: number;
  readonly cy: number;
}

export interface Background {
  /** Distinct colours seen along the sheet border, most frequent first. */
  readonly colors: readonly RGB[];
  /** True when the border is already alpha=0 (a previous tool keyed it). */
  readonly transparent: boolean;
}

/**
 * A frame is one or more components fused into a single sprite. `primary` is the
 * component the pivot is derived from; satellites (smoke, muzzle flash) only
 * widen the bounding box.
 */
export interface Frame extends Box {
  /** Stable id derived from row and x-order of the auto segmentation. */
  readonly id: string;
  readonly row: number;
  readonly primary: Component;
  readonly satellites: readonly Component[];
  /** Pivot in sheet pixel coordinates (not frame-relative). */
  readonly pivot: { readonly x: number; readonly y: number };
}

export interface DroppedComponent {
  readonly component: Component;
  readonly reason: 'noise' | 'watermark' | 'override';
}

export interface Segmentation {
  readonly width: number;
  readonly height: number;
  readonly background: Background;
  readonly mask: Mask;
  /** Per-pixel component id (1-based), 0 = background. Used to crop a frame without its neighbours. */
  readonly labels: Int32Array;
  readonly rows: readonly (readonly Frame[])[];
  readonly dropped: readonly DroppedComponent[];
}

export function boxUnion(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

export function boxRight(b: Box): number {
  return b.x + b.w;
}

export function boxBottom(b: Box): number {
  return b.y + b.h;
}

export function boxCenterX(b: Box): number {
  return b.x + b.w / 2;
}

/** Signed horizontal gap between two boxes; negative when their x-ranges overlap. */
export function horizontalGap(a: Box, b: Box): number {
  return Math.max(a.x, b.x) - Math.min(boxRight(a), boxRight(b));
}

/** Length of the overlap of the two y-ranges; <= 0 when they do not overlap. */
export function verticalOverlap(a: Box, b: Box): number {
  return Math.min(boxBottom(a), boxBottom(b)) - Math.max(a.y, b.y);
}
