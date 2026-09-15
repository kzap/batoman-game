/**
 * Runtime level registry: the manifest names the levels, Vite bundles each
 * level JSON as its own chunk, and the app picks one by id. The validator
 * checks the same manifest at build time (tools/validate).
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

const files = import.meta.glob<{ default: unknown }>('./levels/*.json');

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
  const load = files[`./${entry.file}`];
  if (!load) throw new Error(`level ${id}: ${entry.file} is not bundled`);
  const mod = await load();
  return parseLevel(mod.default, id);
}
