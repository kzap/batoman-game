/**
 * Playtest unlock for level select. The shipped build leaves
 * `VITE_UNLOCK_ALL_LEVELS` unset, which is on. `false` or `0` turns it off
 * at build time. `?unlockAll=1` or `0` overrides that for one page load.
 * The save's `unlocked` list is never rewritten by this switch.
 */

/** `false` and `0` are off. Unset and every other value stay on. */
export function unlockAllFromEnv(raw: string | boolean | undefined): boolean {
  return raw !== 'false' && raw !== '0' && raw !== false;
}

/** `?unlockAll=1` or `0`. Anything else, including a missing key, is not an override. */
export function unlockAllQuery(search: string): boolean | null {
  const v = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('unlockAll');
  if (v === '1') return true;
  if (v === '0') return false;
  return null;
}

/** Build flag, then the query. The query wins for that load only. */
export function resolveUnlockAll(envRaw: string | boolean | undefined, search: string): boolean {
  return unlockAllQuery(search) ?? unlockAllFromEnv(envRaw);
}

/** Shipped build value, before a query override. On when the variable is unset. */
export const UNLOCK_ALL_LEVELS = unlockAllFromEnv(import.meta.env.VITE_UNLOCK_ALL_LEVELS);

/** Level ids level select may start. Does not copy or reorder the save. */
export function selectableLevels(unlocked: readonly string[], levels: readonly string[], unlockAll: boolean): readonly string[] {
  return unlockAll ? levels : unlocked;
}
