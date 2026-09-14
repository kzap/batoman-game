import { describe, expect, it } from 'vitest';
import { detectBackground, distanceToPalette } from '../background';
import { labelComponents } from '../components';
import { applyMask, buildMask } from '../mask';
import { BLUE, Canvas, PINK, RED, WHITE } from './fixtures';

describe('detectBackground', () => {
  it('finds a flat fill', () => {
    const img = new Canvas(64, 32, PINK).rect(10, 10, 20, 12, RED).image();
    const bg = detectBackground(img);
    expect(bg.colors).toHaveLength(1);
    expect(bg.colors[0]).toEqual(PINK);
    expect(bg.transparent).toBe(false);
  });

  it('finds both squares of a checkerboard', () => {
    const img = new Canvas(64, 64, 'checker').image();
    const bg = detectBackground(img);
    expect(bg.colors).toHaveLength(2);
    expect(distanceToPalette(250, 250, 250, bg.colors)).toBe(0);
    expect(distanceToPalette(230, 230, 230, bg.colors)).toBe(0);
  });

  it('reports a pre-keyed border', () => {
    const img = new Canvas(64, 32, PINK).rect(10, 10, 20, 12, RED).chromaKey(PINK).image();
    expect(detectBackground(img).transparent).toBe(true);
  });
});

describe('buildMask', () => {
  it('keeps enclosed background-coloured pixels that a global key would erase', () => {
    // Red ring with a pink hole; then apply a v1-style chroma key that also erased the hole.
    const canvas = new Canvas(40, 40, PINK).ring(10, 10, 20, 20, RED, PINK).chromaKey(PINK);
    const img = canvas.image();
    const bg = detectBackground(img);
    const mask = buildMask(img, bg, { tolerance: 20, softTolerance: 60, alphaThreshold: 8, enclosed: 'keep' });
    // Border is background
    expect(mask.alpha[0]).toBe(0);
    // Ring is solid
    expect(mask.alpha[10 * 40 + 10]).toBe(255);
    // Hole centre is restored to solid even though its alpha was 0 and colour is background
    expect(mask.alpha[20 * 40 + 20]).toBe(255);
    const out = applyMask(img, mask, bg);
    expect(out.data[(20 * 40 + 20) * 4 + 3]).toBe(255);
  });

  it('erases only what is reachable from the border', () => {
    const img = new Canvas(40, 20, PINK).rect(5, 5, 10, 10, RED).rect(25, 5, 10, 10, BLUE).image();
    const mask = buildMask(img, detectBackground(img));
    let fg = 0;
    for (const a of mask.alpha) if (a === 255) fg++;
    expect(fg).toBe(200);
  });

  it('gives anti-aliased rim pixels partial alpha and defringes them', () => {
    // A red block whose right edge is one column of 50/50 red-pink blend.
    const blend = { r: Math.round((RED.r + PINK.r) / 2), g: Math.round((RED.g + PINK.g) / 2), b: Math.round((RED.b + PINK.b) / 2) };
    const img = new Canvas(30, 20, PINK).rect(5, 5, 10, 10, RED).rect(15, 5, 1, 10, blend).image();
    const bg = detectBackground(img);
    const mask = buildMask(img, bg, { tolerance: 20, softTolerance: 200, alphaThreshold: 8, enclosed: 'keep' });
    const rim = mask.alpha[10 * 30 + 15];
    expect(rim).toBeGreaterThan(0);
    expect(rim).toBeLessThan(255);
    const out = applyMask(img, mask, bg);
    const p = (10 * 30 + 15) * 4;
    // Defringed colour should be pulled back toward red, away from the pink blend.
    expect(out.data[p + 2]).toBeLessThan(blend.b);
    expect(out.data[p]).toBeGreaterThanOrEqual(RED.r - 10);
  });

  it('auto mode keys enclosed pockets on a saturated chroma key but keeps them on paper white', () => {
    const pinkSheet = new Canvas(40, 40, PINK).ring(10, 10, 20, 20, RED, PINK).image();
    const pinkMask = buildMask(pinkSheet, detectBackground(pinkSheet));
    expect(pinkMask.alpha[20 * 40 + 20]).toBe(0);
    expect(pinkMask.alpha[10 * 40 + 10]).toBe(255);

    const whiteSheet = new Canvas(40, 40, WHITE).ring(10, 10, 20, 20, RED, WHITE).image();
    const whiteMask = buildMask(whiteSheet, detectBackground(whiteSheet));
    expect(whiteMask.alpha[20 * 40 + 20]).toBe(255);
  });

  it('key mode clears enclosed key-coloured pixels but leaves other enclosed colours solid', () => {
    const img = new Canvas(60, 40, PINK).ring(5, 10, 20, 20, RED, PINK).ring(30, 10, 20, 20, RED, BLUE).image();
    const mask = buildMask(img, detectBackground(img), { tolerance: 20, softTolerance: 90, alphaThreshold: 8, enclosed: 'key' });
    expect(mask.alpha[20 * 60 + 15]).toBe(0);
    expect(mask.alpha[20 * 60 + 40]).toBe(255);
  });

  it('does not open a hole when the border colour also appears inside a sprite', () => {
    // White sheet with a red sprite that has a white shoe (fully enclosed).
    const img = new Canvas(40, 40, WHITE).rect(10, 10, 20, 20, RED).rect(14, 24, 6, 4, WHITE).image();
    const mask = buildMask(img, detectBackground(img));
    expect(mask.alpha[26 * 40 + 16]).toBe(255);
  });
});

describe('labelComponents', () => {
  it('labels 8-connected blobs in scan order with correct boxes and areas', () => {
    const img = new Canvas(40, 20, PINK).rect(2, 2, 5, 5, RED).rect(20, 8, 10, 4, BLUE).image();
    const mask = buildMask(img, detectBackground(img));
    const { components, labels } = labelComponents(mask);
    expect(components.map((c) => [c.x, c.y, c.w, c.h, c.area])).toEqual([
      [2, 2, 5, 5, 25],
      [20, 8, 10, 4, 40],
    ]);
    expect(components[0].cx).toBeCloseTo(4.5);
    expect(components[0].cy).toBeCloseTo(4.5);
    expect(labels[2 * 40 + 2]).toBe(1);
    expect(labels[8 * 40 + 20]).toBe(2);
    expect(labels[0]).toBe(0);
  });

  it('joins diagonal neighbours but not pixels one apart unless bridged', () => {
    const img = new Canvas(20, 20, PINK).rect(2, 2, 3, 3, RED).rect(5, 5, 3, 3, RED).rect(12, 2, 2, 2, BLUE).rect(15, 2, 2, 2, BLUE).image();
    const mask = buildMask(img, detectBackground(img));
    expect(labelComponents(mask).components).toHaveLength(3);
    expect(labelComponents(mask, { alphaThreshold: 0, bridge: 1 }).components).toHaveLength(2);
  });
});
