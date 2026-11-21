import { expect, test, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestHooks } from '../../src/app/app';
import { withLockstep } from './drive';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '../../e2e-screenshots');
const hooks = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__batoman)) as TestHooks);
const ready = (page: Page) => page.waitForFunction(() => window.__batoman?.ready === true && window.__batoman.frames > 10);
const screen = (page: Page, kind: string, timeout = 15_000) => page.waitForFunction((k) => window.__batoman?.screen === k, kind, { timeout });

test.describe('level-intro cutscene', () => {
  test('title path: Level 1 dialog shows, advances, skips; simTicks stays 0 until play', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(withLockstep('/'));
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
    await page.screenshot({ path: resolve(SHOTS, 'cutscene-level-1-show.png') });

    await page.keyboard.press('Enter'); // advance to Sari-sari
    await expect(page.locator('.shell-speaker')).toHaveText('Sari-sari');
    await expect(page.locator('.shell-line')).toContainText('Anak');
    expect((await hooks(page)).simTicks).toBe(0);
    await page.screenshot({ path: resolve(SHOTS, 'cutscene-level-1-advance.png') });

    await page.keyboard.press('Shift'); // skip the rest
    await screen(page, 'playing');
    expect((await hooks(page)).simTicks).toBe(0);
    await page.waitForFunction(() => (window.__batoman?.simTicks ?? 0) > 5);
    expect((await hooks(page)).mode).toBe('play');
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('click on the overlay advances a line', async ({ page }) => {
    await page.goto(withLockstep('/'));
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

  test('?cutscene=0 skips dialog on the title path', async ({ page }) => {
    await page.goto(withLockstep('/?cutscene=0'));
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'playing');
    expect((await hooks(page)).simTicks).toBe(0);
    await page.waitForFunction(() => (window.__batoman?.simTicks ?? 0) > 5);
  });

  test('Esc from the cutscene returns to the title with the sim still paused', async ({ page }) => {
    await page.goto(withLockstep('/'));
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'cutscene');
    await page.keyboard.press('Escape');
    await screen(page, 'title');
    expect((await hooks(page)).mode).toBe('paused');
    expect((await hooks(page)).simTicks).toBe(0);
  });
});
