/**
 * Sim pixels to stage units. One 32 px tile is one unit; with the Phase 0
 * camera (FOV 30, distance 22) the view at Z=0 is about 21 x 11.8 units,
 * so the 48 px player stands 1.5 units tall, roughly 13% of the screen.
 */
export const PIXELS_PER_UNIT = 32;

export const toUnits = (px: number): number => px / PIXELS_PER_UNIT;

/** Centre of a sim rect in units, for placing a box mesh. */
export const rectCenter = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({
  x: toUnits(r.x + r.w / 2),
  y: toUnits(r.y + r.h / 2),
});
