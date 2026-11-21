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

test.describe('level-intro cutscene', () => {
  test('title path: Level 1 dialog shows, Enter skip-ahead, Esc skip-all; simTicks stays 0 until play', async ({ page }) => {
    test.setTimeout(60_000);
    // Manual lockstep: the frame loop presents only, so simTicks stays 0 until play + advance.
    await page.goto(withLockstep('/', true));
    await ready(page);
    await page.keyboard.press('Enter'); // Start game
    await screen(page, 'intro');
    await expect(page.locator('#overlay')).toContainText('Tondo Sublevel Docks');
    expect((await hooks(page)).simTicks).toBe(0);

    await page.keyboard.press('Enter'); // leave intro card → cutscene
    await screen(page, 'cutscene');
    await expect(page.locator('.shell-card[data-screen="cutscene"]')).toBeVisible();
    await expect(page.locator('.shell-speaker')).toHaveText('Ando');
    await expect(page.locator('.shell-line')).toContainText('Golden hour on the piers');
    expect((await hooks(page)).simTicks).toBe(0);
    expect((await hooks(page)).mode).toBe('paused');
    // First beat pans to the ASWANG at x≈6150; wait so the PR still shows the look.
    await page.waitForFunction(() => (window.__batoman?.camera.x ?? 0) > 5000, undefined, { timeout: 5_000 });
    await page.screenshot({ path: resolve(SHOTS, 'cutscene-level-1-show.png') });

    await page.keyboard.press('Enter'); // skip-ahead to Sari-sari
    await expect(page.locator('.shell-speaker')).toHaveText('Sari-sari');
    await expect(page.locator('.shell-line')).toContainText('Anak');
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
    await page.goto(withLockstep('/', true));
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
});
