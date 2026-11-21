/**
 * Progress, options and keyboard bindings in localStorage. Pure functions over
 * a `SaveData` value plus a tiny storage interface, so tests use a Map and a
 * corrupt or outdated blob degrades to defaults instead of breaking boot.
 */

import { DEFAULT_BINDINGS, parseBindings, type Bindings } from '../bindings';

export interface LevelResult {
  readonly ticks: number;
  readonly score: number;
}

export interface SaveData {
  readonly version: 1;
  /** Level ids that may be started from level select. */
  readonly unlocked: readonly string[];
  /** Best (fewest ticks) clear per level. */
  readonly best: Readonly<Record<string, LevelResult>>;
  readonly options: GameOptions;
  /** Gameplay key table. Missing or invalid on disk becomes {@link DEFAULT_BINDINGS}. */
  readonly bindings: Bindings;
}

export interface GameOptions {
  readonly music: boolean;
  readonly sfx: boolean;
  /**
   * Explicit reduce-motion choice. `null` follows `prefers-reduced-motion`
   * until the player toggles it.
   */
  readonly reduceMotion: boolean | null;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVE_KEY = 'batoman.v2.save';

export function defaultSave(levels: readonly string[]): SaveData {
  return {
    version: 1,
    unlocked: levels.length ? [levels[0]!] : [],
    best: {},
    options: { music: true, sfx: true, reduceMotion: null },
    bindings: DEFAULT_BINDINGS,
  };
}

/**
 * `saved` wins when the player has chosen. Otherwise follow the OS preference.
 * `session` is a `?reduceMotion=` override that has not been written yet.
 */
export function resolveReduceMotion(saved: boolean | null, systemPrefersReduced: boolean, session: boolean | null = null): boolean {
  if (session !== null) return session;
  return saved ?? systemPrefersReduced;
}

/** `?reduceMotion=1` or `0`. Anything else, including a missing key, is not an override. */
export function reduceMotionQuery(search: string): boolean | null {
  const v = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('reduceMotion');
  if (v === '1') return true;
  if (v === '0') return false;
  return null;
}

/** Read and validate; anything unexpected yields the defaults (the first level unlocked). */
export function loadSave(store: KeyValueStore, levels: readonly string[]): SaveData {
  const base = defaultSave(levels);
  let raw: unknown;
  try {
    const text = store.getItem(SAVE_KEY);
    if (!text) return base;
    raw = JSON.parse(text);
  } catch {
    return base;
  }
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) return base;
  const o = raw as Record<string, unknown>;
  const unlocked = Array.isArray(o['unlocked']) ? o['unlocked'].filter((id): id is string => typeof id === 'string' && levels.includes(id)) : [];
  const best: Record<string, LevelResult> = {};
  if (typeof o['best'] === 'object' && o['best'] !== null) {
    for (const [id, r] of Object.entries(o['best'] as Record<string, unknown>)) {
      const rr = r as Record<string, unknown>;
      if (levels.includes(id) && typeof rr['ticks'] === 'number' && typeof rr['score'] === 'number') best[id] = { ticks: rr['ticks'], score: rr['score'] };
    }
  }
  const opts = (o['options'] ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    unlocked: [...new Set([...base.unlocked, ...unlocked])],
    best,
    options: {
      music: opts['music'] !== false,
      sfx: opts['sfx'] !== false,
      reduceMotion: typeof opts['reduceMotion'] === 'boolean' ? opts['reduceMotion'] : null,
    },
    bindings: parseBindings(o['bindings']) ?? DEFAULT_BINDINGS,
  };
}

export function writeSave(store: KeyValueStore, data: SaveData): void {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or disabled: progress simply does not persist this session.
  }
}

/** A clear unlocks the next level and keeps the better (fewer ticks) result. */
export function recordClear(data: SaveData, levels: readonly string[], levelId: string, result: LevelResult): SaveData {
  const i = levels.indexOf(levelId);
  const next = i >= 0 && i + 1 < levels.length ? levels[i + 1]! : null;
  const unlocked = next && !data.unlocked.includes(next) ? [...data.unlocked, next] : data.unlocked;
  const prev = data.best[levelId];
  const best = prev && prev.ticks <= result.ticks ? data.best : { ...data.best, [levelId]: result };
  return { ...data, unlocked, best };
}

export function setOption<K extends keyof GameOptions>(data: SaveData, key: K, value: GameOptions[K]): SaveData {
  return { ...data, options: { ...data.options, [key]: value } };
}

export function setBindings(data: SaveData, bindings: Bindings): SaveData {
  return { ...data, bindings };
}

export function resetBindings(data: SaveData): SaveData {
  return setBindings(data, DEFAULT_BINDINGS);
}
