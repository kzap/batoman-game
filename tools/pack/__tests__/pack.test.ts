import sharp from 'sharp';
import type { Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';
import { eraseRects, fadeEdges, keyOut, parseBackdrops } from '../backdrops.js';
import { packAtlas, type PackInput, type Placement } from '../packer.js';

function overlaps(a: Placement, b: Placement, padding: number): boolean {
  return a.x < b.x + b.w + padding && b.x < a.x + a.w + padding && a.y < b.y + b.h + padding && b.y < a.y + a.h + padding;
}

describe('packAtlas', () => {
  const items: PackInput[] = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, w: 20 + ((i * 37) % 90), h: 15 + ((i * 53) % 70) }));

  it('places every item inside a power-of-two texture without overlap, padding included', () => {
    const padding = 2;
    const { width, height, placements } = packAtlas(items, padding);
    expect(Math.log2(width) % 1).toBe(0);
    expect([width, width / 2]).toContain(height);
    expect(placements.map((p) => p.id).sort()).toEqual(items.map((i) => i.id).sort());
    for (const p of placements) {
      expect(p.x + p.w + padding).toBeLessThanOrEqual(width);
      expect(p.y + p.h + padding).toBeLessThanOrEqual(height);
    }
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) expect(overlaps(placements[i]!, placements[j]!, padding)).toBe(false);
    }
  });

  it('is deterministic for the same input', () => {
    expect(packAtlas(items)).toEqual(packAtlas(items));
  });

  it('picks the smallest texture that fits and refuses impossible input', () => {
    expect(packAtlas([{ id: 'a', w: 30, h: 30 }])).toMatchObject({ width: 64, height: 32 });
    expect(packAtlas([])).toEqual({ width: 1, height: 1, placements: [] });
    expect(() => packAtlas([{ id: 'huge', w: 5000, h: 10 }], 2, 4096)).toThrow(/cannot pack/);
  });
});

describe('parseBackdrops', () => {
  const good = { version: 1, level: 'level-1', layers: { background: { source: 'background.png' }, foreground: { source: 'fg.png', lossless: false, quality: 90, scale: 0.5 } } };

  it('accepts a well-formed spec', () => {
    expect(parseBackdrops(good, 'spec')).toBe(good);
  });

  it('rejects bad version, names, and layer options', () => {
    expect(() => parseBackdrops({ ...good, version: 2 }, 'spec')).toThrow(/version/);
    expect(() => parseBackdrops({ ...good, level: 'Level 1' }, 'spec')).toThrow(/level/);
    expect(() => parseBackdrops({ ...good, layers: { 'Bad Name': { source: 'x.png' } } }, 'spec')).toThrow(/key "Bad Name"/);
    expect(() => parseBackdrops({ ...good, layers: { bg: {} } }, 'spec')).toThrow(/source is required/);
    expect(() => parseBackdrops({ ...good, layers: { bg: { source: 'x.png', quality: 0 } } }, 'spec')).toThrow(/quality/);
    expect(() => parseBackdrops({ ...good, layers: { bg: { source: 'x.png', scale: 1.5 } } }, 'spec')).toThrow(/scale/);
    expect(() => parseBackdrops({ ...good, layers: { bg: { source: 'x.png', edgeFade: 0.6 } } }, 'spec')).toThrow(/edgeFade/);
    expect(() => parseBackdrops({ ...good, layers: { bg: { source: 'x.png', erase: [{ x: 0, y: 0, w: 0, h: 4, mode: 'fill' }] } } }, 'spec')).toThrow(/erase\[0\]/);
    expect(() => parseBackdrops({ ...good, layers: { bg: { source: 'x.png', erase: [{ x: 0, y: 0, w: 4, h: 4, mode: 'blur' }] } } }, 'spec')).toThrow(/mode/);
    expect(() => parseBackdrops({ ...good, layers: { bg: { source: 'x.png', key: { color: 'magenta', tolerance: 10 } } } }, 'spec')).toThrow(/key\.color/);
    expect(() => parseBackdrops({ ...good, layers: { bg: { source: 'x.png', key: { color: '#ff00ff', tolerance: 300 } } } }, 'spec')).toThrow(/key\.tolerance/);
  });

  it('accepts edgeFade and erase', () => {
    const spec = { ...good, layers: { bg: { source: 'x.png', edgeFade: 0.05, erase: [{ x: 1, y: 2, w: 3, h: 4, mode: 'clear' }] } } };
    expect(parseBackdrops(spec, 'spec')).toBe(spec);
  });
});

/** Raw RGBA of a small image for pixel assertions. */
const pixels = async (img: Sharp): Promise<{ at: (x: number, y: number) => number[]; width: number }> => {
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, at: (x, y) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)) };
};

describe('keyOut', () => {
  it('clears pixels within tolerance of the key colour and keeps the rest opaque', async () => {
    // Magenta sheet with a dark 2 x 2 block at (3, 1) and a near-magenta pixel at (0, 0).
    const img = sharp({ create: { width: 8, height: 4, channels: 4, background: { r: 253, g: 108, b: 247, alpha: 1 } } }).composite([
      { input: { create: { width: 2, height: 2, channels: 4, background: { r: 40, g: 40, b: 50, alpha: 1 } } }, left: 3, top: 1 },
      { input: { create: { width: 1, height: 1, channels: 4, background: { r: 240, g: 120, b: 240, alpha: 1 } } }, left: 0, top: 0 },
    ]);
    const p = await pixels(await keyOut(img, { color: '#fd6cf7', tolerance: 24 }));
    expect(p.at(6, 3)[3]).toBe(0);
    expect(p.at(0, 0)[3]).toBe(0); // within tolerance
    expect(p.at(3, 1)).toEqual([40, 40, 50, 255]);
    expect(p.at(4, 2)).toEqual([40, 40, 50, 255]);
  });
});

describe('eraseRects', () => {
  // 8 x 4 opaque red with a white 2 x 2 "watermark" at (3, 1).
  const source = (): Sharp =>
    sharp({ create: { width: 8, height: 4, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).composite([
      { input: { create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }, left: 3, top: 1 },
    ]);

  it('clear makes the rect transparent and leaves the rest alone', async () => {
    const p = await pixels(await eraseRects(source(), [{ x: 3, y: 1, w: 2, h: 2, mode: 'clear' }]));
    expect(p.at(3, 1)[3]).toBe(0);
    expect(p.at(4, 2)[3]).toBe(0);
    expect(p.at(2, 1)).toEqual([200, 0, 0, 255]);
    expect(p.at(5, 2)).toEqual([200, 0, 0, 255]);
  });

  it('fill recolours the rect with the mean colour of its border', async () => {
    const p = await pixels(await eraseRects(source(), [{ x: 3, y: 1, w: 2, h: 2, mode: 'fill' }]));
    expect(p.at(3, 1)).toEqual([200, 0, 0, 255]);
    expect(p.at(4, 2)).toEqual([200, 0, 0, 255]);
  });

  it('fill ignores transparent border pixels and keeps the alpha of what it recolours', async () => {
    // Left half transparent, right half red; white mark straddling the boundary.
    const img = sharp({ create: { width: 8, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
      { input: { create: { width: 4, height: 4, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }, left: 4, top: 0 },
      { input: { create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }, left: 3, top: 1 },
    ]);
    const p = await pixels(await eraseRects(img, [{ x: 3, y: 1, w: 2, h: 2, mode: 'fill' }]));
    expect(p.at(3, 1)).toEqual([200, 0, 0, 255]); // the mark is now wall-coloured, still opaque
    expect(p.at(4, 1)).toEqual([200, 0, 0, 255]);
    expect(p.at(2, 1)[3]).toBe(0); // untouched transparent neighbour
  });

  it('clips rects to the image', async () => {
    const p = await pixels(await eraseRects(source(), [{ x: 6, y: 3, w: 10, h: 10, mode: 'clear' }]));
    expect(p.at(7, 3)[3]).toBe(0);
    expect(p.width).toBe(8);
  });
});

describe('fadeEdges', () => {
  it('ramps alpha from 0 at the edges to full past the fade width, symmetrically', async () => {
    const img = sharp({ create: { width: 20, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } });
    const p = await pixels(await fadeEdges(img, 0.25)); // 5 px ramp each side
    expect(p.at(0, 0)[3]).toBe(0);
    expect(p.at(19, 0)[3]).toBe(0);
    expect(p.at(2, 1)[3]).toBe(102); // 2/5 of 255
    expect(p.at(17, 1)[3]).toBe(102);
    expect(p.at(5, 0)[3]).toBe(255);
    expect(p.at(10, 0)).toEqual([10, 20, 30, 255]);
  });
});
