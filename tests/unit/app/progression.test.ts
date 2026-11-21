import { describe, expect, it } from 'vitest';
import { resolveUnlockAll, selectableLevels, UNLOCK_ALL_LEVELS, unlockAllFromEnv, unlockAllQuery } from '@app/shell/progression';
import { defaultSave, recordClear, writeSave, type KeyValueStore } from '@app/shell/save';

const levels = ['level-1', 'level-3', 'level-6'];

describe('unlock all flag', () => {
  it('ships on when VITE_UNLOCK_ALL_LEVELS is unset', () => {
    expect(UNLOCK_ALL_LEVELS).toBe(true);
    expect(unlockAllFromEnv(undefined)).toBe(true);
  });

  it('turns off only for false or 0', () => {
    expect(unlockAllFromEnv('false')).toBe(false);
    expect(unlockAllFromEnv('0')).toBe(false);
    expect(unlockAllFromEnv(false)).toBe(false);
    expect(unlockAllFromEnv('true')).toBe(true);
    expect(unlockAllFromEnv('1')).toBe(true);
    expect(unlockAllFromEnv('')).toBe(true);
  });

  it('lets ?unlockAll=0|1 override the build for one load', () => {
    expect(unlockAllQuery('')).toBeNull();
    expect(unlockAllQuery('?unlockAll=1')).toBe(true);
    expect(unlockAllQuery('unlockAll=0')).toBe(false);
    expect(unlockAllQuery('?unlockAll=false')).toBeNull();
    expect(resolveUnlockAll(undefined, '')).toBe(true);
    expect(resolveUnlockAll('false', '')).toBe(false);
    expect(resolveUnlockAll('0', '?unlockAll=1')).toBe(true);
    expect(resolveUnlockAll(undefined, '?unlockAll=0')).toBe(false);
    expect(resolveUnlockAll('false', '?unlockAll=no')).toBe(false);
  });
});

describe('selectableLevels', () => {
  it('offers every level when the flag is on and leaves the save list alone', () => {
    const save = defaultSave(levels);
    expect(selectableLevels(save.unlocked, levels, true)).toEqual(['level-1', 'level-3', 'level-6']);
    expect(save.unlocked).toEqual(['level-1']);
    const store: KeyValueStore & { raw: string | null } = {
      raw: null,
      getItem: () => null,
      setItem: (_k, v) => {
        store.raw = v;
      },
    };
    writeSave(store, save);
    expect(JSON.parse(store.raw ?? '{}').unlocked).toEqual(['level-1']);
  });

  it('follows saved progression when the flag is off, and a clear adds only the next id', () => {
    const fresh = defaultSave(levels);
    expect(selectableLevels(fresh.unlocked, levels, false)).toEqual(['level-1']);
    const once = recordClear(fresh, levels, 'level-1', { ticks: 10, score: 1 });
    expect(once.unlocked).toEqual(['level-1', 'level-3']);
    expect(selectableLevels(once.unlocked, levels, false)).toEqual(['level-1', 'level-3']);
    const twice = recordClear(once, levels, 'level-3', { ticks: 10, score: 1 });
    expect(twice.unlocked).toEqual(['level-1', 'level-3', 'level-6']);
    expect(recordClear(twice, levels, 'level-6', { ticks: 1, score: 1 }).unlocked).toEqual(['level-1', 'level-3', 'level-6']);
  });
});
