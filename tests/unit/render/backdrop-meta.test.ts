import { describe, expect, it } from 'vitest';
import { backdropMetaFromPixels, parseBackdropMeta } from '@render/backdrop-meta';

const rgba = (width: number, height: number, paint: (x: number, y: number) => number): Uint8Array => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = 10;
      data[i + 1] = 20;
      data[i + 2] = 30;
      data[i + 3] = paint(x, y);
    }
  }
  return data;
};

describe('backdrop meta', () => {
  it('an opaque image is the full box and is marked opaque', () => {
    const meta = backdropMetaFromPixels(rgba(8, 6, () => 255), 8, 6, 8, 0);
    expect(meta).toEqual({ v: 1, width: 8, height: 6, opaque: true, content: { x: 0, y: 0, w: 8, h: 6 } });
    expect(parseBackdropMeta(meta)).toEqual(meta);
  });

  it('crops to the visible rows and pads them, and a keyed sky is not opaque', () => {
    const meta = backdropMetaFromPixels(
      rgba(10, 8, (x, y) => (y >= 5 && x >= 2 && x <= 6 ? 255 : 0)),
      10,
      8,
      8,
      1,
    );
    expect(meta.opaque).toBe(false);
    expect(meta.content).toEqual({ x: 1, y: 4, w: 7, h: 4 });
  });

  it('an empty image has an empty box', () => {
    const meta = backdropMetaFromPixels(rgba(4, 4, () => 0), 4, 4);
    expect(meta.content).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(meta.opaque).toBe(false);
  });

  it('rejects a meta file that is not the sidecar shape', () => {
    expect(() => parseBackdropMeta(null)).toThrow(/object/);
    expect(() => parseBackdropMeta({ v: 2, width: 1, height: 1, opaque: true, content: { x: 0, y: 0, w: 1, h: 1 } })).toThrow(/v/);
    expect(() => parseBackdropMeta({ v: 1, width: 1, height: 1, opaque: 'yes', content: { x: 0, y: 0, w: 1, h: 1 } })).toThrow(/opaque/);
  });
});
