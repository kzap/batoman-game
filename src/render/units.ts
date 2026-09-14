/**
 * Sim pixels to stage units. One 32 px tile is one unit; with the Phase 0
 * camera (FOV 30, distance 22) the view at Z=0 is about 21 x 11.8 units,
 * so the 48 px player stands 1.5 units tall, roughly 13% of the screen.
 */
export const PIXELS_PER_UNIT = 32;

export const toUnits = (px: number): number => px / PIXELS_PER_UNIT;

/**
 * Sim pixels per atlas pixel. Every atlas is packed at the 1408 px sheet
 * scale (BatoMan's sheet natively; the 2816 px sheets through `scale: 0.5`),
 * and at that scale two atlas pixels make one sim pixel: BatoMan's 120 px
 * tall idle frame becomes a 60 px sprite over his 48 px hitbox (the salakot
 * brim and the arm overhang). Props come from same-scale sheets, so one
 * constant serves all.
 */
export const SIM_PX_PER_ATLAS_PX = 0.5;

/** Atlas pixels to stage units. */
export const atlasToUnits = (px: number): number => toUnits(px * SIM_PX_PER_ATLAS_PX);

/** Centre of a sim rect in units, for placing a box mesh. */
export const rectCenter = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({
  x: toUnits(r.x + r.w / 2),
  y: toUnits(r.y + r.h / 2),
});
