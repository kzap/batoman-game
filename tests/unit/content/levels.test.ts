import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEVELS, loadLevelById } from '@content/levels';

const level1 = JSON.parse(readFileSync(new URL('../../../src/content/levels/level-1.json', import.meta.url), 'utf8')) as unknown;

function okFetch(body: unknown = level1): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
}

describe('loadLevelById', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed level when the response is ok', async () => {
    vi.stubGlobal('fetch', okFetch());
    const level = await loadLevelById('level-1');
    expect(level.id).toBe('level-1');
    expect(level.name).toBe('Tondo Sublevel Docks');
  });

  it('rejects with the HTTP status when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    await expect(loadLevelById('level-1')).rejects.toThrow('HTTP 404');
  });

  it('rejects an unknown id before fetching', async () => {
    const fetch = okFetch();
    vi.stubGlobal('fetch', fetch);
    await expect(loadLevelById('no-such-level')).rejects.toThrow('unknown level "no-such-level"');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('has a URL in the files table for every manifest entry', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => level1 };
      }),
    );
    for (const entry of LEVELS) await loadLevelById(entry.id);
    expect(urls).toHaveLength(LEVELS.length);
    for (const entry of LEVELS) {
      expect(urls.filter((url) => url.includes(entry.file))).toHaveLength(1);
    }
  });
});
