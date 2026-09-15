export interface Budget {
  /** Everything under dist/ that a browser would download (excludes .map files). */
  readonly totalServed: number;
  /** JS + CSS after minification (uncompressed on disk). */
  readonly code: number;
  /** Any single image file. Large backdrops must be split or compressed. */
  readonly singleImage: number;
  /** Any single audio file. */
  readonly singleAudio: number;
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
};

/** Directories the pipeline owns. Relative to repo root. */
export const PATHS = {
  dist: 'dist',
  public: 'public',
  artSource: 'art-source',
  atlases: 'public/assets/atlases',
  backdrops: 'public/assets/backdrops',
  audio: 'public/assets/audio',
  audioSource: 'art-source/audio',
  content: 'src/content',
} as const;

/** Path fragments that identify raw or source art. Never allowed in a served tree. */
const FORBIDDEN_NAME_PATTERNS: readonly RegExp[] = [/concept-art/i, /-sprites\.png$/i, /art-source/i, /\.psd$/i];

/**
 * Served-tree directories (relative to the asset root, POSIX separators) that may
 * contain raster images. Everything else is assumed to be raw art that bypassed
 * the pipeline. `assets/atlases/` and `assets/backdrops/` are written by
 * tools/pack; `assets/ui/` is for hand-made HUD graphics.
 */
const ALLOWED_IMAGE_DIRS: readonly string[] = ['assets/atlases/', 'assets/backdrops/', 'assets/ui/'];

const RASTER_EXT = /\.(png|webp|avif|jpe?g|gif|bmp|tiff?)$/i;

/**
 * Decide whether a path in a served tree (public/ or dist/) is allowed.
 * Returns a reason string when forbidden, or null when fine.
 * Shared by content validation and the post-build budget check so the two
 * cannot drift.
 */
export function forbiddenServedPathReason(rel: string): string | null {
  for (const pat of FORBIDDEN_NAME_PATTERNS) {
    if (pat.test(rel)) return `matches raw-art pattern ${pat}`;
  }
  if (RASTER_EXT.test(rel) && !ALLOWED_IMAGE_DIRS.some((d) => rel.startsWith(d))) {
    return `raster image outside ${ALLOWED_IMAGE_DIRS.join(' or ')}; images must come from the asset pipeline`;
  }
  return null;
}
