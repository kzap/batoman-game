import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUDGET, PATHS } from '../config';
import { AUDIO_EXT, CODE_EXT, IMAGE_EXT, SOURCEMAP_EXT, fmtBytes, walk, type FileEntry } from './lib';

/**
 * Print the served tree the way `npm run budget` judges it, plus the bytes one
 * level actually downloads. The caps stay in tools/config.ts. This does not
 * pass or fail the build.
 *
 * A desktop GPU fetches KTX2 backdrops and the Basis transcoder. Software GL
 * fetches the WebP instead, and skips the transcoder. Either way the player
 * fetches the current level only. dist/ still counts both formats for every
 * level, which is what `checkBudget` sums.
 */

const BASIS_WASM = /basis_transcoder.*\.wasm$/i;
const TOP_N = 15;

/** Same atlas names as `ENEMY_LOOK` in src/render/assets.ts. An unknown type throws so a new enemy cannot hide from the report. */
const ENEMY_ATLAS: Readonly<Record<string, string>> = {
  patroller: 'patroller',
  stealth: 'patroller',
  aswang: 'patroller',
  sigbin: 'patroller',
  drone: 'drone',
  tikbalang: 'tikbalang',
};

export type Category =
  | 'code'
  | 'ktx2'
  | 'webpAtlases'
  | 'webpBackdrops'
  | 'basisWasm'
  | 'audio'
  | 'levelJson'
  | 'html'
  | 'other';

const CATEGORY_LABEL: Record<Category, string> = {
  code: 'code (js, css)',
  ktx2: 'KTX2 textures',
  webpAtlases: 'WebP atlases',
  webpBackdrops: 'WebP backdrops',
  basisWasm: 'basis transcoder wasm',
  audio: 'audio',
  levelJson: 'level JSON',
  html: 'HTML',
  other: 'other',
};

export function categoryOf(rel: string): Category | 'sourcemap' {
  if (SOURCEMAP_EXT.test(rel)) return 'sourcemap';
  if (BASIS_WASM.test(rel)) return 'basisWasm';
  if (/\.ktx2$/i.test(rel)) return 'ktx2';
  if (/atlases\/[^/]+\.webp$/i.test(rel)) return 'webpAtlases';
  if (/backdrops\/.+\.webp$/i.test(rel)) return 'webpBackdrops';
  if (IMAGE_EXT.test(rel)) return 'other';
  if (AUDIO_EXT.test(rel)) return 'audio';
  if (CODE_EXT.test(rel)) return 'code';
  if (/\.html$/i.test(rel)) return 'html';
  if (/^assets\/level-\d[^/]*\.json$/i.test(rel)) return 'levelJson';
  return 'other';
}

export interface Summary {
  served: number;
  sourcemaps: number;
  categories: { category: Category; label: string; bytes: number }[];
  top: FileEntry[];
  code: number;
  largestImage: FileEntry | null;
  largestAudio: FileEntry | null;
}

export function summarize(files: FileEntry[]): Summary {
  const served = files.filter((f) => categoryOf(f.rel) !== 'sourcemap');
  const buckets = new Map<Category, number>();
  for (const f of served) {
    const cat = categoryOf(f.rel) as Category;
    buckets.set(cat, (buckets.get(cat) ?? 0) + f.size);
  }
  const categories = (Object.keys(CATEGORY_LABEL) as Category[]).map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    bytes: buckets.get(category) ?? 0,
  }));
  const images = served.filter((f) => IMAGE_EXT.test(f.rel));
  const audio = served.filter((f) => AUDIO_EXT.test(f.rel));
  const largest = (list: FileEntry[]): FileEntry | null => list.reduce<FileEntry | null>((best, f) => (!best || f.size > best.size ? f : best), null);
  return {
    served: served.reduce((n, f) => n + f.size, 0),
    sourcemaps: files.filter((f) => categoryOf(f.rel) === 'sourcemap').reduce((n, f) => n + f.size, 0),
    categories,
    top: [...served].sort((a, b) => b.size - a.size || a.rel.localeCompare(b.rel)).slice(0, TOP_N),
    code: buckets.get('code') ?? 0,
    largestImage: largest(images),
    largestAudio: largest(audio),
  };
}

export interface LevelArt {
  id: string;
  music: string;
  enemies: readonly { type: string }[];
  props?: string;
  backdrops: readonly string[];
}

/** Batoman, the prop sheet, and every enemy sheet the level spawns. An aswang also needs the drone sheet it summons. */
export function atlasesForLevel(level: LevelArt): string[] {
  const names = new Set<string>(['batoman']);
  if (level.props) names.add(level.props);
  for (const enemy of level.enemies) {
    const atlas = ENEMY_ATLAS[enemy.type];
    if (!atlas) throw new Error(`level ${level.id}: no atlas for enemy "${enemy.type}"`);
    names.add(atlas);
    if (enemy.type === 'aswang') names.add('drone');
  }
  return [...names].sort();
}

export type BackdropFormat = 'ktx2' | 'webp';

export interface SessionPart {
  label: string;
  bytes: number;
}

export interface SessionSum {
  bytes: number;
  parts: SessionPart[];
  missing: string[];
}

function sumMatching(files: FileEntry[], match: (rel: string) => boolean): number {
  return files.filter((f) => match(f.rel)).reduce((n, f) => n + f.size, 0);
}

function take(files: FileEntry[], rel: string, missing: string[]): number {
  const hits = files.filter((f) => f.rel === rel);
  if (hits.length === 0) {
    missing.push(rel);
    return 0;
  }
  return hits.reduce((n, f) => n + f.size, 0);
}

const isEditor = (rel: string): boolean => /(^|\/)editor-/.test(rel);
const isKtxRuntime = (rel: string): boolean => /KTX2Loader-/.test(rel) || /basis_transcoder/.test(rel);
const isShellCode = (rel: string): boolean => rel === 'index.html' || /(^|\/)index-.+\.(js|css)$/.test(rel) || /(^|\/)three-.+\.js$/.test(rel);

/**
 * Bytes a player downloads to boot and play one level.
 * `ktx2` is the desktop path (compressed backdrops plus the transcoder).
 * `webp` is the software-GL path. Shared files (shell, atlases, music, level JSON) are in both.
 */
export function sessionBytes(files: FileEntry[], level: LevelArt, format: BackdropFormat): SessionSum {
  const live = files.filter((f) => !SOURCEMAP_EXT.test(f.rel));
  const missing: string[] = [];
  const parts: SessionPart[] = [];
  const add = (label: string, bytes: number): void => {
    parts.push({ label, bytes });
  };

  add('shell', sumMatching(live, (rel) => isShellCode(rel) && !isEditor(rel) && !isKtxRuntime(rel)));
  if (format === 'ktx2') add('basis runtime', sumMatching(live, isKtxRuntime));

  for (const name of atlasesForLevel(level)) {
    const image = take(live, `assets/atlases/${name}.webp`, missing);
    const json = take(live, `assets/atlases/${name}.json`, missing);
    add(`atlas ${name}`, image + json);
  }
  for (const stem of level.backdrops) {
    const image = take(live, `assets/backdrops/${level.id}/${stem}.${format}`, missing);
    const meta = take(live, `assets/backdrops/${level.id}/${stem}.meta.json`, missing);
    add(`backdrop ${stem}`, image + meta);
  }
  const levelNumber = level.id.replace(/^level-/, '');
  add('level JSON', sumMatching(live, (rel) => new RegExp(`^assets/level-${levelNumber}(?:-[^/]+)?\\.json$`).test(rel)));
  add('music', take(live, `assets/audio/${level.music}.ogg`, missing));

  return { bytes: parts.reduce((n, p) => n + p.bytes, 0), parts, missing };
}

/** Code files the session splitter did not claim. A new Vite chunk shows up here. */
export function unclassifiedCode(files: FileEntry[]): FileEntry[] {
  return files.filter((f) => categoryOf(f.rel) === 'code' && !isShellCode(f.rel) && !isEditor(f.rel) && !isKtxRuntime(f.rel));
}

function printSummary(summary: Summary): void {
  console.log(`\n== payload report ==`);
  console.log(`served ${fmtBytes(summary.served)} (${summary.served} bytes) / ${fmtBytes(BUDGET.totalServed)}`);
  console.log(`headroom served ${fmtBytes(BUDGET.totalServed - summary.served)} (${BUDGET.totalServed - summary.served} bytes)`);
  console.log(`code ${fmtBytes(summary.code)} (${summary.code} bytes) / ${fmtBytes(BUDGET.code)}`);
  console.log(`headroom code ${fmtBytes(BUDGET.code - summary.code)} (${BUDGET.code - summary.code} bytes)`);
  console.log(`single image cap ${fmtBytes(BUDGET.singleImage)}; largest ${summary.largestImage ? `${summary.largestImage.rel} ${summary.largestImage.size}` : 'none'}`);
  console.log(`single audio cap ${fmtBytes(BUDGET.singleAudio)}; largest ${summary.largestAudio ? `${summary.largestAudio.rel} ${summary.largestAudio.size}` : 'none'}`);
  console.log(`sourcemaps excluded ${fmtBytes(summary.sourcemaps)}`);
  console.log('\ncategory bytes');
  for (const cat of summary.categories) console.log(`${cat.label}\t${cat.bytes}`);
  const check = summary.categories.reduce((n, c) => n + c.bytes, 0);
  console.log(`categories sum ${check}${check === summary.served ? '' : ' MISMATCH'}`);
  console.log(`\ntop ${TOP_N}`);
  for (const f of summary.top) console.log(`${f.size}\t${f.rel}`);
}

interface ManifestEntry {
  id: string;
  file: string;
  music: string;
}

function levelArt(entry: ManifestEntry): LevelArt {
  const json = JSON.parse(readFileSync(join(PATHS.content, entry.file), 'utf8')) as {
    enemies?: { type: string }[];
    art?: { props?: string; backdrops?: Record<string, string> };
  };
  return {
    id: entry.id,
    music: entry.music,
    enemies: json.enemies ?? [],
    ...(json.art?.props ? { props: json.art.props } : {}),
    backdrops: Object.values(json.art?.backdrops ?? {}),
  };
}

function printSessions(files: FileEntry[]): void {
  const manifest = JSON.parse(readFileSync(join(PATHS.content, 'manifest.json'), 'utf8')) as { levels: ManifestEntry[] };
  console.log('\nper-level download (one format, this level only)');
  for (const entry of manifest.levels) {
    const level = levelArt(entry);
    for (const format of ['ktx2', 'webp'] as const) {
      const session = sessionBytes(files, level, format);
      console.log(`${level.id} ${format} ${session.bytes}${session.missing.length ? ` MISSING ${session.missing.join(' ')}` : ''}`);
      for (const part of session.parts) console.log(`  ${part.bytes}\t${part.label}`);
    }
  }
  const stray = unclassifiedCode(files);
  if (stray.length) console.log(`unclassified code: ${stray.map((f) => f.rel).join(' ')}`);
}

const isMain = process.argv[1]?.endsWith('budget-report.ts') ?? false;
if (isMain) {
  if (!existsSync(PATHS.dist)) {
    console.error(`X  ${PATHS.dist}/ not found; run \`vite build\` first`);
    process.exit(1);
  }
  const files = walk(PATHS.dist);
  printSummary(summarize(files));
  printSessions(files);
}
