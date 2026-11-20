import { toUnits } from './units';

/**
 * Far-layer texture LOD. The backdrop at Z=-60 is fogged and low frequency, so
 * it is packed so a texel covers about `pixelsPerTexel` framebuffer pixels at
 * `referenceHeight` (the 720p the frame budget is measured at). The mid layer
 * stays full resolution. Never upscales.
 *
 * The numbers match the camera (`LENS`, `CAMERA`, the diorama margin). A unit
 * test locks them to `backdropPlacement` so the two cannot drift.
 */
export const FAR_LOD = {
  referenceHeight: 720,
  pixelsPerTexel: 2,
  viewW: 672,
  viewH: 378,
  lensDistance: 22,
  farZ: -60,
  margin: 1.15,
} as const;

/** Fraction of the far plane on screen at once, on each axis. */
export function farVisibleFraction(levelW: number, levelH: number, ref = FAR_LOD): { x: number; y: number } {
  const grow = (ref.lensDistance - ref.farZ) / ref.lensDistance;
  const axis = (levelPx: number, viewPx: number): number => {
    const half = (toUnits(viewPx) / 2) * grow;
    const min = toUnits(levelPx <= viewPx ? levelPx / 2 : viewPx / 2);
    const max = toUnits(levelPx <= viewPx ? levelPx / 2 : levelPx - viewPx / 2);
    const plane = (max - min + 2 * half) * ref.margin;
    return (2 * half) / plane;
  };
  return { x: axis(levelW, ref.viewW), y: axis(levelH, ref.viewH) };
}

/** Packed size of a far backdrop. The sharper axis is brought down to `pixelsPerTexel`; the other follows so the aspect holds. Sides stay multiples of 4 for KTX2. */
export function farLodDimensions(imageW: number, imageH: number, levelW: number, levelH: number, ref = FAR_LOD): { width: number; height: number } {
  if (imageW <= 0 || imageH <= 0) throw new Error('far LOD image size must be positive');
  const visible = farVisibleFraction(levelW, levelH, ref);
  const referenceWidth = ref.referenceHeight * (16 / 9);
  const pxX = referenceWidth / (imageW * visible.x);
  const pxY = ref.referenceHeight / (imageH * visible.y);
  const pxPerTexel = Math.min(pxX, pxY);
  if (!(pxPerTexel > 0) || pxPerTexel >= ref.pixelsPerTexel) return block(imageW, imageH);
  const scale = pxPerTexel / ref.pixelsPerTexel;
  return block(Math.max(4, Math.round(imageW * scale)), Math.max(4, Math.round(imageH * scale)));
}

function block(width: number, height: number): { width: number; height: number } {
  const w = Math.max(4, width - (width % 4));
  const h = Math.max(4, height - (height % 4));
  return { width: w, height: h };
}
