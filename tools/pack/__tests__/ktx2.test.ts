import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockSize, encodeBackdropKtx2, padToBlocks } from '../ktx2';

/** RGBA32 from the same Basis transcoder Three's KTX2Loader uses. First row is what WebGL samples at V=0. */
async function transcodeRgba(ktx2: Uint8Array): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const require = createRequire(import.meta.url);
  const jsPath = require.resolve('three/examples/jsm/libs/basis/basis_transcoder.js');
  const source = readFileSync(jsPath, 'utf8');
  const nodeRequire = createRequire(jsPath);
  const factory = Function('require', 'module', 'exports', '__dirname', '__filename', `${source}\nreturn BASIS;`)(nodeRequire, {}, {}, dirname(jsPath), jsPath) as (opts: { wasmBinary: ArrayBuffer }) => Promise<Record<string, unknown>>;
  const wasm = readFileSync(join(dirname(jsPath), 'basis_transcoder.wasm'));
  const wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer;
  const basis = await factory({ wasmBinary });
  (basis.initializeBasis as () => void)();
  const file = new (basis.KTX2File as new (data: Uint8Array) => {
    isValid(): boolean;
    startTranscoding(): boolean;
    getWidth(): number;
    getHeight(): number;
    getImageTranscodedSizeInBytes(level: number, layer: number, face: number, format: number): number;
    transcodeImage(dst: Uint8Array, level: number, layer: number, face: number, format: number, decodeFlags: number, rowPitch: number, rows: number): boolean;
    close(): void;
    delete(): void;
  })(ktx2);
  if (!file.isValid() || !file.startTranscoding()) throw new Error('ktx2 transcoder rejected the file');
  const width = file.getWidth();
  const height = file.getHeight();
  // three.js KTX2Loader.TranscoderFormat.RGBA32. Output row 0 is the bottom of the texture.
  const format = 13;
  const dst = new Uint8Array(file.getImageTranscodedSizeInBytes(0, 0, 0, format));
  if (!file.transcodeImage(dst, 0, 0, 0, format, 0, -1, -1)) throw new Error('transcodeImage failed');
  file.close();
  file.delete();
  return { rgba: dst, width, height };
}

describe('ktx2 backdrop encode', () => {
  it('rounds sizes up to the 4-pixel block and pads the buffer with transparent pixels', () => {
    expect(blockSize(8)).toBe(8);
    expect(blockSize(7)).toBe(8);
    expect(() => blockSize(0)).toThrow(/positive/);
    const src = new Uint8Array(5 * 3 * 4).fill(9);
    const padded = padToBlocks(src, 5, 3);
    expect(padded.width).toBe(8);
    expect(padded.height).toBe(4);
    expect(padded.data[(0 * 8 + 0) * 4]).toBe(9);
    expect(padded.data[(0 * 8 + 5) * 4 + 3]).toBe(0);
  });

  it('writes a KTX2 file with the Basis identifier', async () => {
    const data = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200;
      data[i + 1] = 80;
      data[i + 2] = 40;
      data[i + 3] = i % 32 === 0 ? 0 : 255;
    }
    const encoded = await encodeBackdropKtx2(data, 8, 8);
    expect(Buffer.from(encoded.subarray(0, 12)).toString('hex')).toBe('ab4b5458203230bb0d0a1a0a');
    expect(encoded.byteLength).toBeGreaterThan(12);
    await expect(encodeBackdropKtx2(data, 6, 8)).rejects.toThrow(/multiple of 4/);
  });

  it('stores the bottom source row first so a KTX2 backdrop is right-side up', async () => {
    const width = 8;
    const height = 8;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const topHalf = y < height / 2;
        data[i] = topHalf ? 255 : 0;
        data[i + 1] = topHalf ? 0 : 255;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    const encoded = await encodeBackdropKtx2(data, width, height);
    const { rgba } = await transcodeRgba(encoded);
    // Row 0 of the transcode is V=0, the bottom of the plane. That must be the
    // green bottom half of the source, not the red top half. ETC1S is lossy,
    // so compare channels instead of expecting 0 and 255.
    const last = (height - 1) * width * 4;
    expect(rgba[1], `bottom texel rgb ${rgba[0]},${rgba[1]},${rgba[2]}`).toBeGreaterThan(rgba[0]);
    expect(rgba[last], `top texel rgb ${rgba[last]},${rgba[last + 1]},${rgba[last + 2]}`).toBeGreaterThan(rgba[last + 1]);
  });
});