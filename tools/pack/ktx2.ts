import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { KTX2Encoder } from '@babylonjs/ktx2encoder';

/**
 * ETC1S KTX2 for backdrop layers. The Basis encoder ships as a classic script
 * plus a wasm binary, so it is loaded by hand instead of imported. Atlases are
 * not encoded: alpha-tested sprite edges pick up block artefacts, and the
 * full-screen backdrops are the textures that dominate GPU memory.
 *
 * Quality 192 / effort 1 is the pack default: high enough that a keyed
 * skyline does not band, fast enough that `npm run assets` stays a build step.
 * The output is BasisLZ (supercompression scheme 1). The production build
 * omits three's Zstd decoder on that fact; see `ktx2-zstd-stub.ts`.
 */
const ETC1S_QUALITY = 192;
const ETC1S_EFFORT = 1;

let encoder: KTX2Encoder | null = null;

function basisFactory(): KTX2Encoder {
  const require = createRequire(import.meta.url);
  const jsPath = require.resolve('@babylonjs/ktx2encoder/wasm/basis_encoder.js');
  const source = readFileSync(jsPath, 'utf8');
  const nodeRequire = createRequire(jsPath);
  // The encoder distribution is an Emscripten script that assigns `BASIS`, not an ES module.
  const factory = Function('require', '__dirname', '__filename', `${source}\nreturn BASIS;`)(nodeRequire, dirname(jsPath), jsPath) as (opts: { wasmBinary: ArrayBuffer }) => Promise<unknown>;
  const wasm = readFileSync(join(dirname(jsPath), 'basis_encoder.wasm'));
  const wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer;
  KTX2Encoder.JSModule = factory;
  KTX2Encoder.WasmBinary = wasmBinary;
  return new KTX2Encoder();
}

/** Next multiple of 4. Basis rejects any other size; the caller pads the pixels to match. */
export function blockSize(n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`ktx2 size must be a positive integer, got ${n}`);
  return Math.ceil(n / 4) * 4;
}

/** Copy an RGBA image into a buffer whose sides are multiples of 4, leaving the padding transparent. */
export function padToBlocks(rgba: Uint8Array, width: number, height: number): { data: Uint8Array; width: number; height: number } {
  const w = blockSize(width);
  const h = blockSize(height);
  if (rgba.byteLength !== width * height * 4) throw new Error(`rgba length ${rgba.byteLength} is not ${width}x${height}`);
  if (w === width && h === height) return { data: rgba, width, height };
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < height; y++) data.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * w * 4);
  return { data, width: w, height: h };
}

export async function encodeBackdropKtx2(rgba: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  if (blockSize(width) !== width || blockSize(height) !== height) throw new Error(`ktx2 size ${width}x${height} must be a multiple of 4`);
  encoder ??= basisFactory();
  const encoded = await encoder.encode(rgba, width, height, {
    usage: 'color',
    generateMipmaps: false,
    // Source rows are top-down. A compressed upload cannot flip on the way to
    // the GPU (WebGL rejects UNPACK_FLIP_Y, so CompressedTexture leaves flipY
    // false) and the backdrop plane samples V=0 at its bottom edge, which is
    // where TextureLoader's flip lands the bottom row of the WebP. Basis has
    // to store that row first or every KTX2 backdrop draws upside down.
    flipY: true,
    etc1sQualityLevel: ETC1S_QUALITY,
    etc1sCompressionLevel: ETC1S_EFFORT,
  });
  if (encoded.byteLength < 12 || encoded[0] !== 0xab || encoded[1] !== 0x4b) throw new Error('basis encoder did not return a KTX2 file');
  return encoded;
}
