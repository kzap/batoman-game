/**
 * Whether a backdrop should be fetched as KTX2/ETC1S instead of WebP.
 * Block compression cuts GPU memory for the full-screen layers on a real
 * desktop GPU. Software renderers (SwiftShader, llvmpipe) advertise the same
 * extensions and then decompress on the CPU, which is slower than WebP, so
 * they stay on the uncompressed path. Atlases stay WebP either way: their
 * alpha-tested edges do not survive a lossy block encode.
 */
export interface GpuTextureSupport {
  readonly software: boolean;
  readonly s3tc: boolean;
  readonly bptc: boolean;
}

export function isSoftwareRenderer(unmaskedRenderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|lavapipe|software/i.test(unmaskedRenderer);
}

/** S3TC or BC7 is what a mid-laptop samples in hardware. ETC2/ASTC on desktop Linux are often emulated, so they do not count. */
export function useCompressedBackdrops(gpu: GpuTextureSupport): boolean {
  return !gpu.software && (gpu.bptc || gpu.s3tc);
}
