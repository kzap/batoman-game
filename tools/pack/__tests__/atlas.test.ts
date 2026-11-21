import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp, { type Sharp, type WebpOptions } from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATLAS_WEBP_QUALITY, writeAtlas, type BuiltAtlas } from '../atlas.js';

/** 32×32 sheet: a clear pixel at (4, 4) and an opaque block from (16, 16). */
function probe(): BuiltAtlas {
  const width = 32;
  const height = 32;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 16; y < 32; y++) {
    for (let x = 16; x < 32; x++) {
      const i = (y * width + x) * 4;
      data[i] = 20;
      data[i + 1] = 180;
      data[i + 2] = 40;
      data[i + 3] = 255;
    }
  }
  return {
    image: { width, height, data },
    json: {
      version: 1,
      image: 'probe.webp',
      width,
      height,
      scale: 1,
      frames: { mark: { x: 16, y: 16, w: 16, h: 16, pivot: { x: 0, y: 0 } } },
      animations: {},
    },
  };
}

describe('writeAtlas', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('encodes at quality 90 with alphaQuality 100 and keeps a clear pixel clear', async () => {
    const seen: WebpOptions[] = [];
    const orig = sharp.prototype.webp;
    vi.spyOn(sharp.prototype, 'webp').mockImplementation(function (this: Sharp, ...args: unknown[]) {
      const options = (args[0] as WebpOptions | undefined) ?? {};
      seen.push(options);
      return orig.apply(this, args);
    });

    const dir = await mkdtemp(path.join(tmpdir(), 'atlas-q90-'));
    dirs.push(dir);
    await writeAtlas(probe(), dir);

    expect(ATLAS_WEBP_QUALITY).toBe(90);
    expect(seen).toEqual([{ quality: 90, alphaQuality: 100, effort: 6 }]);
    const opts = seen[0]!;
    expect(opts.lossless).toBeUndefined();
    expect(opts).not.toHaveProperty('smartSubsample');
    expect(opts).not.toHaveProperty('sharpYuv');

    const { data, info } = await sharp(path.join(dir, 'probe.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number): number => data[(y * info.width + x) * 4 + 3]!;
    expect(alpha(4, 4)).toBe(0);
    expect(alpha(24, 24)).toBe(255);
  });
});
