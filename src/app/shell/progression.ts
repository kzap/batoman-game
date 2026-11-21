/**
 * Playtest switch for level select.
 *
 * On, every manifest level can be started, so a playtest can jump straight to
 * any of them. The save file is not rewritten: `SaveData.unlocked` still
 * records only what `recordClear` earned. Set this to false and level select
 * follows that list again, including saves written while the flag was on.
 */
export const UNLOCK_ALL_LEVELS = true;

/**
 * Level ids level select may start. `unlockAll` defaults to {@link UNLOCK_ALL_LEVELS}
 * so the one flag above is the switch; tests pass the other value explicitly.
 */
export function selectableLevels(unlocked: readonly string[], levels: readonly string[], unlockAll: boolean = UNLOCK_ALL_LEVELS): readonly string[] {
  return unlockAll ? levels : unlocked;
}
