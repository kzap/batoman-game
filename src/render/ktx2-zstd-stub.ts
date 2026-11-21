/**
 * Stand-in for `three/examples/jsm/libs/zstddec.module.js`.
 *
 * `KTX2Loader` imports that module so it can inflate raw KTX2 whose
 * supercompression scheme is Zstandard. The file is a base64 wasm blob of
 * about 40 KB, which the code budget counts when the production build ships
 * it. The alias in `vite.config.ts` is the shared resolve table, so the dev
 * server, Vitest, and the production build all get this stub. Backdrop KTX2
 * from `tools/pack/ktx2.ts` is BasisLZ (scheme 1, vkFormat 0), which takes
 * the Basis transcoder and never constructs this class. `SPZLoader`, the
 * other caller, is not in the game.
 *
 * A Zstd file fails here instead of decoding. The encoder test locks scheme 1,
 * and `npm run validate` rejects a shipped `.ktx2` that is not BasisLZ.
 */
export class ZSTDDecoder {
  init(): Promise<void> {
    return Promise.reject(new Error('Zstd KTX2 is not in this build; backdrops are BasisLZ'));
  }

  decode(): Uint8Array {
    throw new Error('Zstd KTX2 is not in this build; backdrops are BasisLZ');
  }
}
