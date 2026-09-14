import { describe, expect, it } from 'vitest';
import { parseBackdrops } from '../backdrops.js';
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
  });
});
