import { describe, expect, it } from 'vitest';
import { defaultSave, loadSave, recordClear, SAVE_KEY, setOption, writeSave, type KeyValueStore } from '@app/shell/save';
import { clearPoints, formatScore, killPoints } from '@app/shell/score';

const levels = ['level-1', 'level-3', 'level-6'];
const memory = (): KeyValueStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

describe('save', () => {
  it('defaults unlock only the first level', () => {
    expect(loadSave(memory(), levels)).toEqual(defaultSave(levels));
    expect(defaultSave(levels).unlocked).toEqual(['level-1']);
  });

  it('round-trips through storage', () => {
    const store = memory();
    const data = setOption(recordClear(defaultSave(levels), levels, 'level-1', { ticks: 5000, score: 1200 }), 'music', false);
    writeSave(store, data);
    expect(store.map.has(SAVE_KEY)).toBe(true);
    expect(loadSave(store, levels)).toEqual(data);
  });

  it('tolerates garbage, old versions and unknown levels', () => {
    const store = memory();
    store.setItem(SAVE_KEY, '{not json');
    expect(loadSave(store, levels)).toEqual(defaultSave(levels));
    store.setItem(SAVE_KEY, JSON.stringify({ version: 0, unlocked: ['level-6'] }));
    expect(loadSave(store, levels).unlocked).toEqual(['level-1']);
    store.setItem(SAVE_KEY, JSON.stringify({ version: 1, unlocked: ['level-9', 'level-3', 7], best: { 'level-9': { ticks: 1, score: 1 }, 'level-3': { ticks: 'x' } }, options: { music: 'no' } }));
    const s = loadSave(store, levels);
    expect(s.unlocked).toEqual(['level-1', 'level-3']);
    expect(s.best).toEqual({});
    expect(s.options).toEqual({ music: true, sfx: true });
  });

  it('a clear unlocks the next level and keeps the faster result', () => {
    let s = recordClear(defaultSave(levels), levels, 'level-1', { ticks: 6000, score: 900 });
    expect(s.unlocked).toEqual(['level-1', 'level-3']);
    s = recordClear(s, levels, 'level-1', { ticks: 7000, score: 2000 });
    expect(s.best['level-1']).toEqual({ ticks: 6000, score: 900 });
    s = recordClear(s, levels, 'level-1', { ticks: 5000, score: 100 });
    expect(s.best['level-1']).toEqual({ ticks: 5000, score: 100 });
    s = recordClear(s, levels, 'level-6', { ticks: 1, score: 1 });
    expect(s.unlocked).toEqual(['level-1', 'level-3']); // nothing after the last level
  });

  it('a failed write is swallowed', () => {
    const store: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => writeSave(store, defaultSave(levels))).not.toThrow();
  });
});

describe('score', () => {
  it('formats six digits and caps', () => {
    expect(formatScore(0)).toBe('000000');
    expect(formatScore(1250)).toBe('001250');
    expect(formatScore(5_000_000)).toBe('999999');
  });

  it('values kills and clears', () => {
    expect(killPoints('aswang')).toBeGreaterThan(killPoints('patroller'));
    expect(clearPoints(3)).toBeGreaterThan(clearPoints(0));
  });
});
