import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer, useCompressedBackdrops } from '@render/compression';

describe('compressed backdrops', () => {
  it('uses KTX2 on a desktop GPU that can sample S3TC or BC7', () => {
    expect(useCompressedBackdrops({ software: false, s3tc: true, bptc: false })).toBe(true);
    expect(useCompressedBackdrops({ software: false, s3tc: false, bptc: true })).toBe(true);
  });

  it('stays on WebP for software renderers and for GPUs with neither desktop format', () => {
    expect(useCompressedBackdrops({ software: true, s3tc: true, bptc: true })).toBe(false);
    expect(useCompressedBackdrops({ software: false, s3tc: false, bptc: false })).toBe(false);
  });

  it('recognises the software GL names CI and headless machines report', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)')).toBe(false);
  });
});
