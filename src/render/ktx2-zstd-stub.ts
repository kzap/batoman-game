/**
 * Stand-in for `three/examples/jsm/libs/zstddec.module.js`.
 *
 * `KTX2Loader` imports that module so it can inflate raw KTX2 whose
 * supercompression scheme is Zstandard. The file is a base64 wasm blob of
 * about 40 KB, and the production budget counts it as code. Backdrop KTX2
 * from `tools/pack/ktx2.ts` is BasisLZ (scheme 1, vkFormat 0), which takes
 * the Basis transcoder and never constructs this class. `SPZLoader`, the
 * other caller, is not in the game.
 *
 * A Zstd file fails here instead of decoding. `tools/pack/__tests__/ktx2.test.ts`
 * locks the encoder to BasisLZ so that change cannot land quietly.
 */
export class ZSTDDecoder {
  init(): Promise<void> {
    return Promise.reject(new Error('Zstd KTX2 is not in this build; backdrops are BasisLZ'));
  }

  decode(): Uint8Array {
    throw new Error('Zstd KTX2 is not in this build; backdrops are BasisLZ');
  }
}
