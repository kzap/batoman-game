import { describe, expect, it } from 'vitest';
import type { AtlasFrame } from '@content/atlas';
import { frameUv, placeFrame } from '@render/sprite-layout';

// A 90 x 120 frame at (100, 200) in a 1024 x 1024 atlas, pivot at the feet, slightly right of centre.
const frame: AtlasFrame = { x: 100, y: 200, w: 90, h: 120, pivot: { x: 50, y: 120 } };

describe('frameUv', () => {
  it('maps the frame rect to texture space with V flipped (atlas Y is top-down, texture V is bottom-up)', () => {
    const uv = frameUv(frame, 1024, 1024);
    expect(uv.u0).toBeCloseTo(100 / 1024);
    expect(uv.u1).toBeCloseTo(190 / 1024);
    expect(uv.v1).toBeCloseTo(1 - 200 / 1024); // top edge of the frame
    expect(uv.v0).toBeCloseTo(1 - 320 / 1024); // bottom edge
    expect(uv.v1).toBeGreaterThan(uv.v0);
  });
});

describe('placeFrame', () => {
  it('scales the frame and puts the pivot exactly on the anchor', () => {
    const p = placeFrame(frame, 0.5, { x: 10, y: 4 });
    expect(p.sx).toBe(45);
    expect(p.sy).toBe(60);
    // Pivot is 50 px from the left of a 90 px frame: the centre is 5 px (2.5 scaled) left of the pivot.
    expect(p.cx).toBeCloseTo(10 - 2.5);
    // Pivot at the bottom: the centre is half the height above the anchor.
    expect(p.cy).toBeCloseTo(4 + 30);
  });

  it('flipping mirrors the overhang about the pivot and negates the width', () => {
    const right = placeFrame(frame, 0.5, { x: 10, y: 4 });
    const left = placeFrame(frame, 0.5, { x: 10, y: 4 }, true);
    expect(left.sx).toBe(-right.sx);
    expect(left.sy).toBe(right.sy);
    expect(left.cy).toBe(right.cy);
    expect(left.cx - 10).toBeCloseTo(-(right.cx - 10));
  });

  it('accepts independent axis scales for stretched props', () => {
    const p = placeFrame(frame, { x: 2, y: 0.5 }, { x: 0, y: 0 });
    expect(p.sx).toBe(180);
    expect(p.sy).toBe(60);
    expect(p.cx).toBeCloseTo(-10); // (45 - 50) * 2
    expect(p.cy).toBeCloseTo(30);
  });

  it('a centre pivot (flyers, orbs) places the quad centred on the anchor', () => {
    const orb: AtlasFrame = { x: 0, y: 0, w: 40, h: 40, pivot: { x: 20, y: 20 } };
    const p = placeFrame(orb, 1, { x: 7, y: 9 }, true);
    expect(p.cx).toBe(7);
    expect(p.cy).toBe(9);
  });
});
