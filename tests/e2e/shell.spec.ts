import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';
import type { ReplayInputs } from '../../src/core/sim/replay';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '../../e2e-screenshots');
const fixture = (id: string): ReplayInputs => JSON.parse(readFileSync(resolve(HERE, `../replay/fixtures/${id}-clear.json`), 'utf8')) as ReplayInputs;
const hooks = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__batoman)) as TestHooks);
const ready = (page: Page) => page.waitForFunction(() => window.__batoman?.ready === true && window.__batoman.frames > 10);
const screen = (page: Page, kind: string, timeout = 10_000) => page.waitForFunction((k) => window.__batoman?.screen === k, kind, { timeout });

test.describe('shell', () => {
  test('title menu: level select shows only the first level unlocked, credits open and close', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.locator('.shell-card[data-screen="title"]')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'levelSelect');
    const items = page.locator('.shell-menu li');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).not.toHaveClass(/shell-locked/);
    await expect(items.nth(1)).toHaveClass(/shell-locked/);
    await expect(items.nth(2)).toHaveClass(/shell-locked/);
    await page.screenshot({ path: resolve(SHOTS, 'shell-level-select.png') });
    // A locked level does not start.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect((await hooks(page)).screen).toBe('levelSelect');
    await page.keyboard.press('Escape');
    await screen(page, 'title'); // back lands on "Level select"; one down is "Credits"
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'credits');
    await expect(page.locator('#overlay')).toContainText('Salamat');
    await page.keyboard.press('Enter');
    await screen(page, 'title');
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('intro card, pause freezes the sim, resume continues, quit returns to the title', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.keyboard.press('Enter'); // Start game
    await screen(page, 'intro');
    await expect(page.locator('#overlay')).toContainText('Tondo Sublevel Docks');
    expect((await hooks(page)).simTicks).toBe(0);
    await page.keyboard.press('Enter');
    await screen(page, 'playing');
    await page.waitForFunction(() => (window.__batoman?.simTicks ?? 0) > 20);
    await page.keyboard.press('Escape');
    await screen(page, 'paused');
    const t1 = (await hooks(page)).simTicks;
    // Two hook reads a frame apart: the tick count does not move while paused.
    await page.waitForFunction(() => (window.__batoman?.frames ?? 0) > 0);
    const f = (await hooks(page)).frames;
    await page.waitForFunction((n) => (window.__batoman?.frames ?? 0) > n + 10, f);
    expect((await hooks(page)).simTicks).toBe(t1);
    expect((await hooks(page)).mode).toBe('paused');
    await page.screenshot({ path: resolve(SHOTS, 'shell-paused.png') });
    await page.keyboard.press('Escape');
    await screen(page, 'playing');
    await page.waitForFunction((t) => (window.__batoman?.simTicks ?? 0) > t + 10, t1);
    await page.keyboard.press('KeyP');
    await screen(page, 'paused');
    await page.keyboard.press('ArrowUp'); // wraps to Quit to title
    await page.keyboard.press('Enter');
    await screen(page, 'title');
    expect((await hooks(page)).mode).toBe('paused');
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('game over: all lives lost shows the card; retry restarts the level with three lives', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?level=level-1');
    await ready(page);
    // Holding right walks into the first patroller's fire and then the first pit, over and over.
    await page.keyboard.down('ArrowRight');
    await screen(page, 'gameover', 90_000);
    await page.keyboard.up('ArrowRight');
    const over = await hooks(page);
    expect(over.status).toBe('gameover');
    expect(over.mode).toBe('play'); // the world froze itself; the shell did not need to pause it
    await expect(page.locator('#overlay')).toContainText('GAME OVER');
    await page.screenshot({ path: resolve(SHOTS, 'shell-gameover.png') });
    await page.keyboard.press('Enter'); // Retry level
    await screen(page, 'playing');
    await page.waitForFunction(() => (window.__batoman?.simTicks ?? 0) > 5 && (window.__batoman?.simTicks ?? 0) < 400);
    await expect(page.locator('#hud')).toContainText('lives 3');
    expect((await hooks(page)).player.hp).toBe(3);
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('audio: music plays after the first key, M mutes and the choice is saved', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __media: HTMLMediaElement[] };
      w.__media = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (!w.__media.includes(this)) w.__media.push(this);
        return play.call(this);
      };
    });
    await page.goto('/');
    await ready(page);
    expect((await hooks(page)).audio).toBe(false);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => window.__batoman?.audio === true);
    expect((await hooks(page)).music).toBe('level-1');
    await page.waitForFunction(() => {
      const m = (window as unknown as { __media: HTMLMediaElement[] }).__media;
      return m.length > 0 && !m[0]!.paused && m[0]!.currentTime > 0.2;
    });
    const src = await page.evaluate(() => (window as unknown as { __media: HTMLMediaElement[] }).__media[0]!.src);
    expect(src).toMatch(/assets\/audio\/level-1\.ogg$/);
    await page.keyboard.press('KeyM');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('batoman.v2.save') ?? '{}') as { options: { music: boolean } });
    expect(save.options.music).toBe(false);
  });

  test('full loop: title -> three levels -> credits, unlocking as it goes', async ({ page }) => {
    test.setTimeout(420_000);
    await page.goto('/');
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'playing');
    for (const [id, next] of [
      ['level-1', 'level-3'],
      ['level-3', 'level-6'],
      ['level-6', null],
    ] as const) {
      expect((await hooks(page)).level).toBe(id);
      await page.evaluate((f) => window.__batoman!.replay!(f), fixture(id));
      await screen(page, 'complete', 150_000);
      await expect(page.locator('#overlay')).toContainText('LEVEL CLEAR');
      await page.keyboard.press('Enter');
      if (next) {
        await screen(page, 'intro', 20_000);
        await expect(page.locator('#overlay')).toContainText(`LEVEL ${next === 'level-3' ? 2 : 3}`);
        await page.keyboard.press('Enter');
        await screen(page, 'playing');
      }
    }
    await screen(page, 'credits');
    await page.screenshot({ path: resolve(SHOTS, 'shell-credits.png') });
    const h = await hooks(page);
    expect(h.score).toBeGreaterThan(3000);
    expect(h.errors).toEqual([]);
    // Progress persisted: every level is now unlocked.
    await page.reload();
    await ready(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'levelSelect');
    await expect(page.locator('.shell-menu li.shell-locked')).toHaveCount(0);
    await expect(page.locator('.shell-best').first()).toContainText('best');
  });
});
