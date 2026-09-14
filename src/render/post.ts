import { BlendFunction, BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, VignetteEffect } from 'postprocessing';
import { HalfFloatType, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { LENS } from './stage';

/**
 * Screen-space finish from docs/ART.md: bloom on the neon and plasma (only
 * pixels above the luminance threshold glow, so the painted art stays crisp),
 * a vignette to pull the eye to the centre, a little film grain against the
 * flat digital look, and optional depth of field focused on the gameplay
 * plane, off by default because it costs a full-resolution blur.
 */
export interface PostOptions {
  readonly bloom?: boolean;
  readonly dof?: boolean;
  readonly grain?: boolean;
  readonly vignette?: boolean;
}

export const POST_DEFAULTS: Required<PostOptions> = { bloom: true, dof: false, grain: true, vignette: true };

/** Effect settings, tuned by eye on the Level 1 screenshots (tests/e2e/level.spec.ts). */
export const POST_TUNING = {
  /** Scene luminance above which pixels bloom: neon cores and the plasma orb, not painted signage. */
  bloom: { luminanceThreshold: 0.7, luminanceSmoothing: 0.2, intensity: 1.0, mipmapBlur: true, radius: 0.7 },
  vignette: { offset: 0.32, darkness: 0.55 },
  grainOpacity: 0.35,
  /** Focus on the gameplay plane; range in world units either side stays sharp. */
  dof: { focusRange: 6, bokehScale: 3 },
} as const;

export class PostStack {
  private readonly composer: EffectComposer;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, opts: PostOptions = {}) {
    const o = { ...POST_DEFAULTS, ...opts };
    // Half-float keeps bloom from banding; MSAA is dropped in favour of the composer's own pass chain.
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));

    const effects = [];
    if (o.dof) {
      // Focus distance is in world units: the gameplay plane, with the near props and player sharp.
      effects.push(new DepthOfFieldEffect(camera, { focusDistance: LENS.distance, ...POST_TUNING.dof }));
    }
    if (o.bloom) {
      effects.push(new BloomEffect({ ...POST_TUNING.bloom }));
    }
    if (o.vignette) effects.push(new VignetteEffect({ ...POST_TUNING.vignette }));
    if (o.grain) {
      const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true });
      noise.blendMode.opacity.value = POST_TUNING.grainOpacity;
      effects.push(noise);
    }
    if (effects.length) this.composer.addPass(new EffectPass(camera, ...effects));
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(deltaSeconds: number): void {
    this.composer.render(deltaSeconds);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
