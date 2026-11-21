import { expect, test, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestHooks } from '../../src/app/app';
import { advance, withLockstep } from './drive';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '../../e2e-screenshots');
const hooks = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__batoman)) as TestHooks);
const ready = (page: Page) => page.waitForFunction(() => window.__batoman?.ready === true && window.__batoman.frames > 10);
const screen = (page: Page, kind: string, timeout = 15_000) => page.waitForFunction((k) => window.__batoman?.screen === k, kind, { timeout });

/** Level 1 dialog lines in order — used to step without racing holdMs. */
const LEVEL_1_LINES = [
  'Golden hour on the piers',
  'Anak',
  'Then one unit can fall',
  'Quiapo',
  'Salamat',
] as const;

/**
 * Manual lockstep with holdMs off so Enter/Esc assertions cannot race the
 * wall-clock auto-advance on slow hosted runners. `extra` merges more params
 * (e.g. reduceMotion=1 for a snapped camera pan).
 */
function withHoldOff(path = '/', extra: Record<string, string> = {}): string {
  const url = new URL(withLockstep(path, true), 'http://localhost');
  url.searchParams.set('cutsceneHold', '0');
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return `${url.pathname}${url.search}`;
}

test.describe('level-intro cutscene', () => {
  test('title path: Level 1 dialog shows, Enter skip-ahead, Esc skip-all; simTicks stays 0 until play', async ({ page }) => {
    test.setTimeout(60_000);
    // reduceMotion snaps the beat camera so the ASWANG look is ready without a 1600 ms ease.
    await page.goto(withHoldOff('/', { reduceMotion: '1' }));
    await ready(page);
    await page.keyboard.press('Enter'); // Start game
    await screen(page, 'intro');
    await expect(page.locator('#overlay')).toContainText('Tondo Sublevel Docks');
    expect((await hooks(page)).simTicks).toBe(0);

    await page.keyboard.press('Enter'); // leave intro card → cutscene
    await screen(page, 'cutscene');
    await expect(page.locator('.shell-card[data-screen="cutscene"]')).toBeVisible();
    await expect(page.locator('.shell-speaker')).toHaveText('Ando');
    await expect(page.locator('.shell-line')).toContainText(LEVEL_1_LINES[0]);
    expect((await hooks(page)).simTicks).toBe(0);
    expect((await hooks(page)).mode).toBe('paused');
    await expect.poll(async () => (await hooks(page)).camera.x).toBeGreaterThan(5000);
    await expect(page.locator('.shell-speaker')).toHaveText('Ando');
    await page.screenshot({ path: resolve(SHOTS, 'cutscene-level-1-show.png') });

    await page.keyboard.press('Enter'); // skip-ahead to Sari-sari
    await expect(page.locator('.shell-speaker')).toHaveText('Sari-sari');
    await expect(page.locator('.shell-line')).toContainText(LEVEL_1_LINES[1]);
    await expect(page.locator('.shell-portrait')).toBeVisible();
    expect((await hooks(page)).simTicks).toBe(0);
    await page.screenshot({ path: resolve(SHOTS, 'cutscene-level-1-advance.png') });

    await page.keyboard.press('Escape'); // skip all remaining lines → play
    await screen(page, 'playing');
    expect((await hooks(page)).simTicks).toBe(0);
    await page.screenshot({ path: resolve(SHOTS, 'cutscene-level-1-skip.png') });
    await advance(page, 12);
    expect((await hooks(page)).simTicks).toBeGreaterThan(5);
    expect((await hooks(page)).mode).toBe('play');
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('click on the overlay skips ahead a line', async ({ page }) => {
    await page.goto(withHoldOff());
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'cutscene');
    await expect(page.locator('.shell-speaker')).toHaveText('Ando');
    await page.locator('#overlay').click({ position: { x: 40, y: 40 } });
    await expect(page.locator('.shell-speaker')).toHaveText('Sari-sari');
    expect((await hooks(page)).simTicks).toBe(0);
  });

  test('lines auto-advance on the hold timer while the sim stays at tick 0', async ({ page }) => {
    test.setTimeout(30_000);
    // Hold stays on: this is the one test that waits for the wall-clock timer.
    await page.goto(withLockstep('/', true));
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'cutscene');
    await expect(page.locator('.shell-speaker')).toHaveText('Ando');
    // First beat holdMs is 3200; wait for the shell timeout without pressing Enter.
    await expect(page.locator('.shell-speaker')).toHaveText('Sari-sari', { timeout: 6_000 });
    expect((await hooks(page)).simTicks).toBe(0);
    expect((await hooks(page)).mode).toBe('paused');
    expect((await hooks(page)).screen).toBe('cutscene');
  });

  test('?cutscene=0 skips dialog on the title path', async ({ page }) => {
    // Manual lockstep so the first playing frame is still tick 0 until we advance.
    await page.goto(withLockstep('/?cutscene=0', true));
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'playing');
    expect((await hooks(page)).simTicks).toBe(0);
    await advance(page, 12);
    expect((await hooks(page)).simTicks).toBeGreaterThan(5);
  });

  test('Esc on the last line starts play once; a second Enter does not stick or restart', async ({ page }) => {
    await page.goto(withHoldOff());
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'cutscene');
    for (let i = 0; i < LEVEL_1_LINES.length - 1; i++) {
      await expect(page.locator('.shell-line')).toContainText(LEVEL_1_LINES[i]!);
      await page.keyboard.press('Enter');
    }
    await expect(page.locator('.shell-speaker')).toHaveText('Ando');
    await expect(page.locator('.shell-line')).toContainText(LEVEL_1_LINES[4]);
    await page.keyboard.press('Escape');
    await screen(page, 'playing');
    expect((await hooks(page)).simTicks).toBe(0);
    expect((await hooks(page)).mode).toBe('play');
    await page.keyboard.press('Enter');
    expect((await hooks(page)).screen).toBe('playing');
    expect((await hooks(page)).mode).toBe('play');
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('Esc then Enter does not double-start; Enter on the last line then Enter stays playing', async ({ page }) => {
    await page.goto(withHoldOff());
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'cutscene');
    await page.keyboard.press('Escape');
    await screen(page, 'playing');
    expect((await hooks(page)).simTicks).toBe(0);
    await page.keyboard.press('Enter');
    expect((await hooks(page)).screen).toBe('playing');
    expect((await hooks(page)).mode).toBe('play');

    // Fresh load: walk every line with Enter, including the last, then Enter again.
    await page.goto(withHoldOff());
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'cutscene');
    for (let i = 0; i < LEVEL_1_LINES.length; i++) {
      await expect(page.locator('.shell-line')).toContainText(LEVEL_1_LINES[i]!);
      await page.keyboard.press('Enter');
    }
    await screen(page, 'playing');
    expect((await hooks(page)).simTicks).toBe(0);
    await page.keyboard.press('Enter');
    expect((await hooks(page)).screen).toBe('playing');
    expect((await hooks(page)).mode).toBe('play');
    expect((await hooks(page)).errors).toEqual([]);
  });
});
