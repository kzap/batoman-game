import { describe, expect, it } from 'vitest';
import { blockSize, encodeBackdropKtx2, padToBlocks } from '../ktx2';

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
});