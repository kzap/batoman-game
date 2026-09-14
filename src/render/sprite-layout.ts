import type { AtlasFrame } from '@content/atlas';

/**
 * Pure geometry for placing an atlas frame on a unit quad. Kept free of Three
 * so the maths (texture Y flip, pivot anchoring, horizontal mirroring) can be
 * unit-tested exactly.
 */

export interface FrameUv {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/**
 * Texture coordinates of a frame. Three uploads images with `flipY`, so V runs
 * bottom-up while atlas Y runs top-down: v0 is the frame's bottom edge.
 */
export function frameUv(frame: AtlasFrame, atlasWidth: number, atlasHeight: number): FrameUv {
  return {
    u0: frame.x / atlasWidth,
    u1: (frame.x + frame.w) / atlasWidth,
    v0: 1 - (frame.y + frame.h) / atlasHeight,
    v1: 1 - frame.y / atlasHeight,
  };
}

export interface QuadPlacement {
  /** Centre of the quad, same units as the anchor. */
  readonly cx: number;
  readonly cy: number;
  /** Signed width: negative mirrors the quad about its vertical axis. */
  readonly sx: number;
  readonly sy: number;
}

/**
 * Where a unit quad (centred at the origin, 1 x 1) must be placed and scaled
 * so the frame's pivot lands on `anchor`. `scale` converts atlas pixels to
 * output units (a pair stretches the two axes independently); the anchor is in output units with Y up. `flip` mirrors the
 * frame horizontally around the pivot, which is how a right-facing sheet faces
 * left: the pivot stays under the feet, the overhang swaps sides.
 */
export function placeFrame(frame: AtlasFrame, scale: number | { x: number; y: number }, anchor: { x: number; y: number }, flip = false): QuadPlacement {
  const sx = typeof scale === 'number' ? scale : scale.x;
  const sy = typeof scale === 'number' ? scale : scale.y;
  const w = frame.w * sx;
  const h = frame.h * sy;
  // Offset from the pivot to the frame's centre, in an unflipped frame.
  const dx = (frame.w / 2 - frame.pivot.x) * sx;
  const dy = (frame.pivot.y - frame.h / 2) * sy;
  return {
    cx: anchor.x + (flip ? -dx : dx),
    cy: anchor.y + dy,
    sx: flip ? -w : w,
    sy: h,
  };
}
