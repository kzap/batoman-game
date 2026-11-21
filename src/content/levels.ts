/**
 * Runtime level registry: the manifest names the levels, Vite emits each
 * level JSON as a static asset, and the app fetches one by id. Emitting them
 * as JS modules would count the level data against the code budget
 * (`tools/validate/budget.ts` sums `.js` / `.css` only). The validator checks
 * the same manifest at build time (tools/validate).
 */

import { parseLevel, type LevelJson } from './level';
import manifest from './manifest.json';

export interface ManifestEntry {
  readonly id: string;
  /** Display name for the shell (level select, intro card). */
  readonly name: string;
  /** Path relative to `src/content/`. */
  readonly file: string;
  /** Track id from `art-source/audio/music.json`, served as `assets/audio/<id>.ogg`. */
  readonly music: string;
}

interface Manifest {
  readonly titleMusic: string;
  readonly levels: ManifestEntry[];
}

export const MANIFEST = manifest as Manifest;
export const LEVELS: readonly ManifestEntry[] = MANIFEST.levels;

export function manifestEntry(id: string): ManifestEntry {
  const e = LEVELS.find((l) => l.id === id);
  if (!e) throw new Error(`unknown level "${id}"`);
  return e;
}

export const DEFAULT_LEVEL_ID = LEVELS[0]?.id ?? 'level-1';

// Eager URL table, not a JS module per level. `no-inline` keeps files under
// Vite's 4 KB asset limit as .json too; inlined they become base64 inside a
// JS module and the code budget counts them. The bytes that ship are the
// JSON assets, which the budget does not treat as code.
const files = import.meta.glob<string>('./levels/*.json', { query: '?url&no-inline', import: 'default', eager: true });

export function levelIds(): readonly string[] {
  return LEVELS.map((l) => l.id);
}

/** The level id named by `?level=`, or the manifest's first level. Unknown ids throw so a typo is not silently Level 1. */
export function levelIdFromQuery(search: string): string {
  const id = new URLSearchParams(search).get('level') ?? DEFAULT_LEVEL_ID;
  if (!LEVELS.some((l) => l.id === id)) throw new Error(`unknown level "${id}" (known: ${levelIds().join(', ')})`);
  return id;
}

export async function loadLevelById(id: string): Promise<LevelJson> {
  const entry = LEVELS.find((l) => l.id === id);
  if (!entry) throw new Error(`unknown level "${id}"`);
  const url = files[`./${entry.file}`];
  if (!url) throw new Error(`level ${id}: ${entry.file} is not bundled`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`level ${id}: HTTP ${res.status}`);
  return parseLevel(await res.json(), id);
}
