import type { Component, Mask, RawImage, RGB } from '../types';

/** Build a synthetic RGBA sheet by painting rectangles on a background. */
export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, bg: RGB | 'checker' = { r: 255, g: 0, b: 255 }) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = bg === 'checker' ? ((x >> 3) + (y >> 3)) % 2 === 0 ? { r: 250, g: 250, b: 250 } : { r: 230, g: 230, b: 230 } : bg;
        this.set(x, y, c, 255);
      }
    }
  }

  set(x: number, y: number, c: RGB, a = 255): void {
    const i = (y * this.width + x) * 4;
    this.data[i] = c.r;
    this.data[i + 1] = c.g;
    this.data[i + 2] = c.b;
    this.data[i + 3] = a;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a);
    return this;
  }

  /** A filled rect with a hollow centre painted in background colour (tests enclosed regions). */
  ring(x: number, y: number, w: number, h: number, c: RGB, hole: RGB): this {
    this.rect(x, y, w, h, c);
    this.rect(x + 2, y + 2, w - 4, h - 4, hole);
    return this;
  }

  /** Set alpha to 0 wherever the colour is near `bg` (mimics v1's global chroma key). */
  chromaKey(bg: RGB, tolerance = 10): this {
    for (let i = 0; i < this.data.length; i += 4) {
      const d = Math.max(Math.abs(this.data[i] - bg.r), Math.abs(this.data[i + 1] - bg.g), Math.abs(this.data[i + 2] - bg.b));
      if (d <= tolerance) this.data[i + 3] = 0;
    }
    return this;
  }

  image(): RawImage {
    return { width: this.width, height: this.height, data: this.data };
  }
}

export const RED: RGB = { r: 200, g: 30, b: 30 };
export const BLUE: RGB = { r: 30, g: 30, b: 200 };
export const WHITE: RGB = { r: 255, g: 255, b: 255 };
export const PINK: RGB = { r: 255, g: 0, b: 255 };

export function maskFromRects(width: number, height: number, rects: readonly { x: number; y: number; w: number; h: number }[]): Mask {
  const alpha = new Uint8Array(width * height);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) alpha[y * width + x] = 255;
  return { width, height, alpha };
}

let nextId = 1;
/** A component with a rectangular footprint and centroid at the box centre. */
export function comp(x: number, y: number, w: number, h: number): Component {
  return { id: nextId++, x, y, w, h, area: w * h, cx: x + w / 2, cy: y + h / 2 };
}
