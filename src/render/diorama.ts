import type { BackdropSlot } from '@content/level-art';
import { cameraBounds } from '@game/camera';
import { CAMERA } from '@game/tuning';
import { LAYER_Z, LENS } from './stage';
import { toUnits } from './units';

/**
 * Where a backdrop plane goes so that, at its depth, it fills the view for
 * every camera position the level allows. Pure: the renderer turns the result
 * into a mesh; tests check the coverage arithmetic.
 */
export interface BackdropPlacement {
  readonly z: number;
  /** Centre, stage units. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Horizontal texture repeats so the image is not stretched to the plane's aspect. */
  readonly repeatX: number;
  /** Mirror alternate repeats to hide the seam (only where mirrored text is unreadable anyway). */
  readonly mirrored: boolean;
}

interface LevelDims {
  readonly width: number;
  readonly height: number;
  /** Y of the floor the mid layer appears to stand on (sim px). Defaults to the spawn floor; a level may set art.midFloorY. */
  readonly floorY: number;
}

/** Depth of each slot; `mid` is the near town layer standing behind the props, `far` the skyline. */
export const SLOT_Z: Readonly<Record<BackdropSlot, number>> = {
  far: LAYER_Z.farStructures,
  mid: LAYER_Z.nearStructures,
};

/** How far below the floor line the mid layer's bottom appears (stage units at Z=0). */
const MID_GROUND_SINK = 0.8;
/** Extra coverage past the exact requirement, for aspect changes and camera shake. */
const MARGIN = 1.15;

/** The CameraController's range of centres (`cameraBounds`), in stage units. */
export function cameraRange(level: LevelDims): { minX: number; maxX: number; minY: number; maxY: number } {
  const b = cameraBounds(level.width, level.height);
  return { minX: toUnits(b.minX), maxX: toUnits(b.maxX), minY: toUnits(b.minY), maxY: toUnits(b.maxY) };
}

export function backdropPlacement(slot: BackdropSlot, level: LevelDims, imageAspect: number): BackdropPlacement {
  const z = SLOT_Z[slot];
  const depth = LENS.distance - z;
  // The view grows linearly with distance from the camera.
  const grow = depth / LENS.distance;
  const halfW = (toUnits(CAMERA.viewW) / 2) * grow;
  const halfH = (toUnits(CAMERA.viewH) / 2) * grow;
  const range = cameraRange(level);
  const w = (range.maxX - range.minX + 2 * halfW) * MARGIN;
  const x = (range.minX + range.maxX) / 2;

  if (slot === 'far') {
    const h = (range.maxY - range.minY + 2 * halfH) * MARGIN;
    return { z, x, y: (range.minY + range.maxY) / 2, w, h, repeatX: w / (h * imageAspect), mirrored: true };
  }

  // Mid: a band standing on the floor; the sky shows through its transparent
  // upper part. Sized so it appears one view tall at Z=0, and aligned to the
  // floor when the camera rests on its lower bound (the usual ground framing).
  const h = toUnits(CAMERA.viewH) * grow;
  const apparentBottom = toUnits(level.floorY) - MID_GROUND_SINK;
  const bottom = range.minY + (apparentBottom - range.minY) * grow;
  return { z, x, y: bottom + h / 2, w, h, repeatX: w / (h * imageAspect), mirrored: false };
}

/** How wide the view is at a backdrop plane, in stage units. One tile of a split backdrop. */
export function layerViewWidth(z: number): number {
  return toUnits(CAMERA.viewW) * ((LENS.distance - z) / LENS.distance);
}

/**
 * Vertical slice of a backdrop that actually has pixels. `contentY`/`contentH`
 * are image rows, y down. The mesh shrinks to that band and the UVs follow, so
 * a keyed skyline does not rasterise the empty sky above the roofs.
 */
export interface BackdropBand {
  readonly y: number;
  readonly h: number;
  /** Bottom of the band in texture V (V is bottom-up). */
  readonly offsetY: number;
  readonly repeatY: number;
}

export function backdropContentBand(p: BackdropPlacement, imageH: number, contentY: number, contentH: number): BackdropBand {
  if (imageH <= 0 || contentH <= 0) return { y: p.y, h: 0, offsetY: 0, repeatY: 0 };
  const frac = contentH / imageH;
  const bottomUnused = (imageH - contentY - contentH) / imageH;
  const h = p.h * frac;
  const bottom = p.y - p.h / 2 + p.h * bottomUnused;
  return { y: bottom + h / 2, h, offsetY: bottomUnused, repeatY: frac };
}

/** One horizontal slice of a backdrop plane. UVs run past 1 where the texture repeats; the mesh itself is only `w` wide so the rest of the level can be frustum-culled. */
export interface BackdropTile {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly repeatX: number;
  readonly repeatY: number;
}

export function backdropTiles(p: BackdropPlacement, tileW: number, band: BackdropBand): BackdropTile[] {
  if (band.h <= 0 || p.w <= 0) return [];
  const span = Math.min(Math.max(tileW, 1), p.w);
  const n = Math.max(1, Math.ceil(p.w / span - 1e-9));
  const w = p.w / n;
  const tiles: BackdropTile[] = [];
  for (let i = 0; i < n; i++) {
    const repeatX = (w / p.w) * p.repeatX;
    tiles.push({
      x: p.x - p.w / 2 + w / 2 + i * w,
      y: band.y,
      w,
      h: band.h,
      offsetX: (i * w / p.w) * p.repeatX,
      offsetY: band.offsetY,
      repeatX,
      repeatY: band.repeatY,
    });
  }
  return tiles;
}
