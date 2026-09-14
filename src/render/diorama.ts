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
  /** Y of the floor the mid layer appears to stand on (sim px); the level's spawn floor. */
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
