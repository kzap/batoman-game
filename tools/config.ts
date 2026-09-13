export interface Budget {
  /** Everything under dist/ that a browser would download (excludes .map files). */
  readonly totalServed: number;
  /** JS + CSS after minification (uncompressed on disk). */
  readonly code: number;
  /** Any single image file. Large backdrops must be split or compressed. */
  readonly singleImage: number;
  /** Any single audio file. */
  readonly singleAudio: number;
  /** Files in public/ that must never ship: raw art, concept art, source sheets. */
  readonly forbiddenPathPatterns: readonly RegExp[];
}

/**
 * Payload budgets, in bytes. The build fails when any is exceeded.
 * Numbers are deliberate ceilings, not targets - raise them in a PR with a reason.
 */
export const BUDGET: Budget = {
  totalServed: 12 * 1024 * 1024,
  code: 900 * 1024,
  singleImage: 1.5 * 1024 * 1024,
  singleAudio: 6 * 1024 * 1024,
  forbiddenPathPatterns: [/concept-art/i, /-sprites\.png$/i, /art-source/i, /\.psd$/i],
};

/** Directories the pipeline owns. Relative to repo root. */
export const PATHS = {
  dist: 'dist',
  public: 'public',
  artSource: 'art-source',
  atlases: 'public/assets/atlases',
  content: 'src/content',
} as const;
