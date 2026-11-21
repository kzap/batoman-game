/**
 * Sidecar written next to each backdrop (`<layer>.meta.json`). The renderer
 * uses it to crop empty rows and to pick an opaque material. Pure data: the
 * packer fills it from the encoded pixels, the loader checks the shape.
 */

export interface ContentBox {
  /** Top-left of the visible pixels, image y down. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface BackdropMeta {
  readonly v: 1;
  readonly width: number;
  readonly height: number;
  readonly opaque: boolean;
  readonly content: ContentBox;
}

const isBox = (b: unknown): b is ContentBox => {
  if (typeof b !== 'object' || b === null) return false;
  const box = b as Record<string, unknown>;
  return [box.x, box.y, box.w, box.h].every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0);
};

export function parseBackdropMeta(json: unknown): BackdropMeta {
  if (typeof json !== 'object' || json === null) throw new Error('backdrop meta must be an object');
  const j = json as Record<string, unknown>;
  if (j.v !== 1) throw new Error('backdrop meta v must be 1');
  if (typeof j.width !== 'number' || typeof j.height !== 'number' || j.width <= 0 || j.height <= 0) throw new Error('backdrop meta width and height must be positive');
  if (typeof j.opaque !== 'boolean') throw new Error('backdrop meta opaque must be a boolean');
  if (!isBox(j.content)) throw new Error('backdrop meta content must be an integer box');
  return { v: 1, width: j.width, height: j.height, opaque: j.opaque, content: j.content };
}

/**
 * Bounding box of pixels with alpha above `threshold`, padded and clamped to
 * the image. `opaque` is true only when every pixel is fully opaque, which is
 * what lets the far sky skip blending. An image with no visible pixel gets an
 * empty box so the renderer can skip the layer.
 */
export function backdropMetaFromPixels(data: Uint8Array, width: number, height: number, threshold = 8, pad = 2): BackdropMeta {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaque = data.length === width * height * 4 && width > 0 && height > 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3] ?? 0;
      if (a !== 255) opaque = false;
      if (a <= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { v: 1, width, height, opaque: false, content: { x: 0, y: 0, w: 0, h: 0 } };
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(width - 1, maxX + pad);
  const y1 = Math.min(height - 1, maxY + pad);
  return { v: 1, width, height, opaque, content: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}
