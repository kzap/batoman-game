import { describe, expect, it } from 'vitest';
import { selectableLevels, UNLOCK_ALL_LEVELS } from '@app/shell/progression';
import { defaultSave, recordClear, writeSave, type KeyValueStore } from '@app/shell/save';

const levels = ['level-1', 'level-3', 'level-6'];

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

  it('follows saved progression when the flag is off', () => {
    const fresh = defaultSave(levels);
    expect(selectableLevels(fresh.unlocked, levels, false)).toEqual(['level-1']);
    const cleared = recordClear(fresh, levels, 'level-1', { ticks: 10, score: 1 });
    expect(selectableLevels(cleared.unlocked, levels, false)).toEqual(['level-1', 'level-3']);
    expect(selectableLevels(['level-6'], levels, false)).toEqual(['level-6']);
  });

  it('defaults to the playtest flag', () => {
    const unlocked = ['level-1'];
    expect(selectableLevels(unlocked, levels)).toEqual(UNLOCK_ALL_LEVELS ? levels : unlocked);
  });
});
