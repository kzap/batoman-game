import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorPlugin } from '../editor-plugin';

/**
 * The endpoint against a real Vite dev server on the repo root, so the SSR
 * load of tools/dev/editor-save.ts (with the app's path aliases) is exercised.
 * The one successful write re-saves level-3 with its own content, which
 * leaves the working tree unchanged.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
/** Away from the dev server's 5173 so a running `npm run dev` does not collide; strictPort off finds the next free one. */
const TEST_PORT = 5199;
let server: ViteDevServer;
let base: string;

beforeAll(async () => {
  server = await start([]);
  base = urlOf(server);
}, 30_000);

/** A dev server on the repo config (for the path aliases) on a free port; extra plugins on top of the config's own. */
const start = (plugins: Plugin[]) =>
  createServer({ root: ROOT, configFile: resolve(ROOT, 'vite.config.ts'), server: { port: TEST_PORT, strictPort: false, host: '127.0.0.1' }, logLevel: 'silent', plugins }).then((s) => s.listen());

const urlOf = (s: ViteDevServer): string => {
  const url = s.resolvedUrls?.local[0];
  if (!url) throw new Error('dev server has no local url');
  return url.replace(/\/$/, '');
};

afterAll(async () => {
  await server.close();
});

const put = (id: string, body: string) => fetch(`${base}/__editor/levels/${id}`, { method: 'PUT', body });

describe('editor dev endpoint', () => {
  it('answers ping', async () => {
    const r = await fetch(`${base}/__editor/ping`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('rejects an id missing from the manifest and an invalid level, without writing', async () => {
    const missing = await put('level-42', '{}');
    expect(missing.status).toBe(404);
    const invalid = await put('level-3', JSON.stringify({ version: 1, id: 'level-3' }));
    expect(invalid.status).toBe(422);
    const body = (await invalid.json()) as { ok: boolean; problems: string[] };
    expect(body.ok).toBe(false);
    expect(body.problems.length).toBeGreaterThan(0);
  });

  it('writes a valid level through the shared validator', async () => {
    const path = resolve(ROOT, 'src/content/levels/level-3.json');
    const before = readFileSync(path, 'utf8');
    const r = await put('level-3', before);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean; path: string };
    expect(body.ok).toBe(true);
    expect(body.path).toBe(path);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('swallows the hot update for a file it just wrote, but not for a later hand edit', async () => {
    const plugin = editorPlugin();
    const hook = plugin.hotUpdate as (this: unknown, ctx: { file: string; read: () => Promise<string> }) => Promise<unknown>;
    // Route a save through this instance's own middleware on a throwaway server so `written` is populated.
    // (The config file's plugin instance would answer first, so give ours a distinct name.)
    plugin.name = 'batoman-editor-test';
    const own = await start([{ ...plugin, enforce: 'pre' }]);
    const path = resolve(ROOT, 'src/content/levels/level-3.json');
    const text = readFileSync(path, 'utf8');
    try {
      const r = await fetch(`${urlOf(own)}/__editor/levels/level-3`, { method: 'PUT', body: text });
      expect(r.status).toBe(200);
      expect(await hook.call(undefined, { file: path, read: async () => text })).toEqual([]);
      expect(await hook.call(undefined, { file: path, read: async () => text })).toEqual([]); // double-fired watcher
      expect(await hook.call(undefined, { file: path, read: async () => text + '\n// edited' })).toBeUndefined();
      expect(await hook.call(undefined, { file: '/elsewhere.ts', read: async () => '' })).toBeUndefined();
    } finally {
      await own.close();
    }
  });
});
