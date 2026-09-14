import type { Frame, RawImage, Segmentation } from './types.js';

/**
 * Cut one frame out of the keyed sheet. Frame boxes may overlap their
 * neighbours (a long gun barrel under the next sprite's hat), so pixels that
 * belong to a component outside this frame are cleared rather than copied.
 */
export function extractFrame(keyed: RawImage, seg: Segmentation, frame: Frame): RawImage {
  const own = new Set<number>([frame.primary.id, ...frame.satellites.map((s) => s.id)]);
  const out = new Uint8ClampedArray(frame.w * frame.h * 4);
  for (let row = 0; row < frame.h; row++) {
    const sy = frame.y + row;
    let si = sy * keyed.width + frame.x;
    let di = row * frame.w;
    for (let col = 0; col < frame.w; col++, si++, di++) {
      const label = seg.labels[si];
      if (label === 0 || !own.has(label)) continue;
      const s4 = si * 4;
      const d4 = di * 4;
      out[d4] = keyed.data[s4];
      out[d4 + 1] = keyed.data[s4 + 1];
      out[d4 + 2] = keyed.data[s4 + 2];
      out[d4 + 3] = keyed.data[s4 + 3];
    }
  }
  return { width: frame.w, height: frame.h, data: out };
}
