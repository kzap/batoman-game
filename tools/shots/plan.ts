/**
 * Pure plan for `npm run shots`: scene list, tick schedule, CLI, and the
 * GitHub URL that makes a committed png render in a pull request body.
 *
 * Gameplay stills ask for `?lockstep=1&ticksPerFrame=0`. Current `v2` ignores
 * those flags. When `window.__batoman.advance` exists (open PR #27,
 * infra/e2e-deterministic), the capture calls it and the sim lands on the
 * exact tick. Until then the same schedule is a replay on the production
 * clock, which can run at most `MAX_TICKS_PER_FRAME - 1` ticks past the
 * target. The mid-level target stays before the first enemy shot so that
 * overshoot still shows the same moment.
 */

export const VIEWPORT = { width: 1280, height: 720 } as const;

export const SWIFTSHADER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
] as const;

/** Packed `InputFrame` bit for `right` (`INPUT_BUTTONS` order). */
export const RIGHT_BITS = 2;

/**
 * Empty ticks from a fresh spawn. The feet find the ground and the pose is
 * `idle` at x=88, camera still on the spawn clamp (viewW/2 = 336).
 */
export const SPAWN_TICKS = 8;

/**
 * Ticks of running right for the mid-level still. Tick 160 is past the spawn
 * clamp (player x ≈ 344, camera x ≈ 384) and before the first patroller shot,
 * which spawns at tick 172. A production-clock frame steps at most 8 ticks,
 * so a wait for `simTicks >= 160` lands by tick 167, still with no shot.
 * PR #27's e2e uses the same 160.
 */
export const MID_RUN_TICKS = 160;

export const DEFAULT_OUT = 'pr-shots/head';
export const DEFAULT_BASELINE_OUT = 'pr-shots/baseline';
export const DEFAULT_PORT = 4173;
export const ASSET_ROOT = 'docs/pr-assets';
export const REPO_RAW_BASE = 'https://github.com/kzap/batoman-game/raw';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;

export interface ShotScene {
  readonly id: string;
  readonly file: string;
  /** Path and query, no origin. */
  readonly path: string;
  /** Append the lockstep query. Ignored by builds that do not know it. */
  readonly lockstep: boolean;
}

export const STILLS: readonly ShotScene[] = [
  { id: 'title', file: 'title.png', path: '/', lockstep: false },
  { id: 'level-1-start', file: 'level-1-start.png', path: '/?level=level-1', lockstep: true },
  { id: 'level-1-mid', file: 'level-1-mid.png', path: '/?level=level-1', lockstep: true },
  { id: 'editor', file: 'editor.png', path: '/?edit=1', lockstep: false },
];

/** Real-time walk. No lockstep query, so the production clock keeps animating it after PR #27. */
export const CLIP: ShotScene = {
  id: 'level-1-walk',
  file: 'level-1-walk.webm',
  path: '/?level=level-1',
  lockstep: false,
};

export interface ReplaySchedule {
  readonly seed: 1;
  readonly inputs: readonly (readonly [number, number])[];
  readonly targetTicks: number;
}

export function spawnSchedule(): ReplaySchedule {
  return { seed: 1, inputs: [[0, SPAWN_TICKS]], targetTicks: SPAWN_TICKS };
}

export function midSchedule(): ReplaySchedule {
  return { seed: 1, inputs: [[RIGHT_BITS, MID_RUN_TICKS]], targetTicks: MID_RUN_TICKS };
}

/** Same run the mid still freezes, so the clip ends on that frame. */
export function clipSchedule(): ReplaySchedule {
  return midSchedule();
}

export function stillUrl(path: string, lockstep: boolean): string {
  const url = new URL(path, 'http://127.0.0.1');
  if (lockstep) {
    url.searchParams.set('lockstep', '1');
    url.searchParams.set('ticksPerFrame', '0');
  }
  return `${url.pathname}${url.search}`;
}

export function beforeName(file: string): string {
  const dot = file.lastIndexOf('.');
  if (dot <= 0) throw new Error(`asset file needs an extension: ${file}`);
  return `${file.slice(0, dot)}-before${file.slice(dot)}`;
}

/**
 * Absolute raw URL. GitHub renders this in a PR body on this public repo.
 * A relative path resolves against the default branch (`main`), not the PR
 * head, and these PRs target `v2`.
 */
export function prImageUrl(branch: string, slug: string, file: string): string {
  const segments = branch.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`branch is not a single ref path: ${branch}`);
  }
  assertSlug(slug);
  if (!/^[a-z0-9][a-z0-9.-]*\.(png|webm)$/.test(file)) {
    throw new Error(`asset file must be one png or webm name: ${file}`);
  }
  return `${REPO_RAW_BASE}/${branch}/${ASSET_ROOT}/${slug}/${file}`;
}

export interface ShotArgs {
  readonly out: string;
  readonly baseline: string | null;
  readonly baselineOut: string;
  readonly slug: string | null;
  readonly clip: boolean;
  readonly skipBuild: boolean;
  readonly port: number;
  readonly help: boolean;
}

export function parseShotArgs(argv: readonly string[]): ShotArgs {
  let out = DEFAULT_OUT;
  let baseline: string | null = null;
  let baselineOut = DEFAULT_BASELINE_OUT;
  let slug: string | null = null;
  let clip = true;
  let skipBuild = false;
  let port = DEFAULT_PORT;
  let help = false;

  const take = (flag: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--out':
        out = take(flag, i);
        i += 1;
        break;
      case '--baseline':
        baseline = take(flag, i);
        i += 1;
        break;
      case '--baseline-out':
        baselineOut = take(flag, i);
        i += 1;
        break;
      case '--slug':
        slug = take(flag, i);
        assertSlug(slug);
        i += 1;
        break;
      case '--port': {
        const raw = take(flag, i);
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('--port must be an integer from 1 to 65535');
        port = n;
        i += 1;
        break;
      }
      case '--clip':
        clip = true;
        break;
      case '--no-clip':
        clip = false;
        break;
      case '--skip-build':
        skipBuild = true;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      default:
        throw new Error(`unknown argument: ${flag ?? ''}`);
    }
  }

  if (baseline !== null && !/^[A-Za-z0-9._/-]+$/.test(baseline)) {
    throw new Error(`refusing baseline ref: ${baseline}`);
  }
  if (baseline?.split('/').includes('..')) throw new Error(`refusing baseline ref: ${baseline}`);

  return { out, baseline, baselineOut, slug, clip, skipBuild, port, help };
}

export interface ShotMeasure {
  readonly mode: 'advance' | 'replay';
  readonly targetTicks: number;
  readonly simTicks: number;
  readonly playerX: number;
  readonly cameraX: number;
  readonly pose: string;
  readonly hp: number;
}

export interface ShotManifest {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly webgl: 'swiftshader';
  readonly stills: readonly string[];
  readonly clip: string | null;
  readonly head: { readonly start: ShotMeasure; readonly mid: ShotMeasure };
  readonly baseline: { readonly start: ShotMeasure; readonly mid: ShotMeasure } | null;
}

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error('slug must be lowercase letters, digits, and hyphens (one path segment under docs/pr-assets/)');
  }
}
