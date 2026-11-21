import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';
import type { ReplayInputs } from '../../src/core/sim/replay';
import { advanceUntilDone, withLockstep } from './drive';
import { expectResultsCard } from './results';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '../../e2e-screenshots');
const fixture = (id: string): ReplayInputs => JSON.parse(readFileSync(resolve(HERE, `../replay/fixtures/${id}-clear.json`), 'utf8')) as ReplayInputs;
const hooks = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__batoman)) as TestHooks);
const ready = (page: Page) => page.waitForFunction(() => window.__batoman?.ready === true && window.__batoman.frames > 10);
const screen = (page: Page, kind: string, timeout = 10_000) => page.waitForFunction((k) => window.__batoman?.screen === k, kind, { timeout });

test.describe('shell', () => {
  test('title menu: ?unlockAll=1 starts any level, credits open and close', async ({ page }) => {
    await page.goto('/?unlockAll=1');
    await ready(page);
    await expect(page.locator('.shell-card[data-screen="title"]')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'levelSelect');
    const items = page.locator('.shell-menu li');
    await expect(items).toHaveCount(5);
    for (let i = 0; i < 5; i++) await expect(items.nth(i)).not.toHaveClass(/shell-locked/);
    await page.screenshot({ path: resolve(SHOTS, 'shell-level-select.png') });
    // The playtest flag does not write the unlocked list. Nothing has been saved yet.
    expect(await page.evaluate(() => localStorage.getItem('batoman.v2.save'))).toBeNull();
    // The second level starts even though the save has never unlocked it.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await expect(page.locator('#overlay')).toContainText('Quiapo Underground Chapel');
    expect(await page.evaluate(() => localStorage.getItem('batoman.v2.save'))).toBeNull();
    // Back to the title without racing the intro card's timer while the level loads.
    await page.goto('/');
    await ready(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'credits');
    await expect(page.locator('#overlay')).toContainText('Salamat');
    await page.keyboard.press('Enter');
    await screen(page, 'title');
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('?unlockAll=0 restores saved progression: only the first level starts', async ({ page }) => {
    await page.goto('/?unlockAll=0');
    await ready(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'levelSelect');
    const items = page.locator('.shell-menu li');
    await expect(items).toHaveCount(5);
    await expect(items.nth(0)).not.toHaveClass(/shell-locked/);
    await expect(items.nth(1)).toHaveClass(/shell-locked/);
    await expect(items.nth(2)).toHaveClass(/shell-locked/);
    await expect(items.nth(3)).toHaveClass(/shell-locked/);
    await expect(items.nth(4)).toHaveClass(/shell-locked/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect((await hooks(page)).screen).toBe('levelSelect');
    expect(await page.evaluate(() => localStorage.getItem('batoman.v2.save'))).toBeNull();
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('intro card, pause freezes the sim, resume continues, quit returns to the title', async ({ page }) => {
    await page.goto(withLockstep('/'));
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
    test.setTimeout(30_000);
    await page.goto(withLockstep('/?level=level-1'));
    await ready(page);
    // Holding right walks into the first patroller's fire and then the first pit, over and over.
    // Pumped by sim ticks (1601 to game over at seed 1), not by how fast frames render.
    // The frame loop is blocked during evaluate, so only advance() steps until the world freezes.
    await page.keyboard.down('ArrowRight');
    const status = await page.evaluate(() => {
      const h = window.__batoman!;
      for (let i = 0; i < 40 && h.status === 'playing'; i++) h.advance!(100);
      return h.status;
    });
    expect(status).toBe('gameover');
    await page.keyboard.up('ArrowRight');
    await screen(page, 'gameover', 10_000);
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

  test('full loop: title -> levels 1/3/4/6 -> level-5 intro, unlocking as it goes', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(withLockstep('/'));
    await ready(page);
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'playing');
    // level-5-clear waits on #67; clear the four pinned levels, then confirm the finale unlocks.
    const order = ['level-1', 'level-3', 'level-4', 'level-6'] as const;
    for (const [i, id] of order.entries()) {
      const next = order[i + 1] ?? 'level-5';
      expect((await hooks(page)).level).toBe(id);
      await page.evaluate((f) => window.__batoman!.replay!(f), fixture(id));
      await advanceUntilDone(page);
      await screen(page, 'complete', 10_000);
      await expectResultsCard(page, i === 0 ? { kills: 1750, clear: 500, hearts: 300, total: 2550 } : undefined);
      if (i === 0) await page.screenshot({ path: resolve(SHOTS, 'shell-results.png') });
      if (id === 'level-1') {
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('batoman.v2.save') ?? '{}') as { unlocked?: string[] });
        expect(saved.unlocked).toEqual(['level-1', 'level-3']);
      }
      await page.keyboard.press('Enter');
      await screen(page, 'intro', 20_000);
      await expect(page.locator('#overlay')).toContainText(`LEVEL ${i + 2}`);
      if (next !== 'level-5') {
        await page.keyboard.press('Enter');
        await screen(page, 'playing');
      }
    }
    await expect(page.locator('#overlay')).toContainText('Destroyed City Block');
    const h = await hooks(page);
    expect(h.score).toBeGreaterThan(3000);
    expect(h.errors).toEqual([]);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('batoman.v2.save') ?? '{}') as { unlocked?: string[] });
    expect(saved.unlocked).toEqual(['level-1', 'level-3', 'level-4', 'level-6', 'level-5']);
    // Credits still open from the title; the finale clear fixture is pending #67.
    await page.goto(withLockstep('/'));
    await ready(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'credits');
    await page.screenshot({ path: resolve(SHOTS, 'shell-credits.png') });
    // Flag off, so the menu is the save and not the playtest switch.
    await page.goto(withLockstep('/?unlockAll=0'));
    await ready(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'levelSelect');
    await expect(page.locator('.shell-menu li.shell-locked')).toHaveCount(0);
    await expect(page.locator('.shell-best').first()).toContainText('best');
  });

  test('controls: rebind jump, persist across reload, reset to defaults', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await ready(page);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await screen(page, 'controls');

    const selected = () => page.locator('.shell-menu li.shell-selected');
    const select = async (action: string): Promise<void> => {
      for (let i = 0; i < 8; i++) {
        if ((await selected().getAttribute('data-action')) === action) return;
        await page.keyboard.press('ArrowDown');
      }
      throw new Error(`controls row ${action} not reached`);
    };
    const toggle = async (key: string): Promise<void> => {
      await page.keyboard.press('Enter');
      await expect(page.locator('.shell-card[data-listening="1"]')).toBeVisible();
      await page.keyboard.press(key);
      await expect(page.locator('.shell-card[data-listening="0"]')).toBeVisible();
    };
    const jumpKeys = () => page.evaluate(() => (JSON.parse(localStorage.getItem('batoman.v2.save') ?? '{}') as { bindings: { jump: string[] } }).bindings.jump);

    await expect(page.locator('li[data-action="jump"] .shell-keys')).toHaveText('Space  W  Up');
    await select('jump');
    await toggle('KeyQ');
    await toggle('Space');
    await toggle('KeyW');
    await toggle('ArrowUp');
    await expect(page.locator('li[data-action="jump"] .shell-keys')).toHaveText('Q');
    expect(await jumpKeys()).toEqual(['KeyQ']);

    await page.reload();
    await ready(page);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await screen(page, 'controls');
    await expect(page.locator('li[data-action="jump"] .shell-keys')).toHaveText('Q');

    await page.keyboard.press('Escape');
    await screen(page, 'title');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'intro');
    await page.keyboard.press('Enter');
    await screen(page, 'playing');
    await page.waitForFunction(() => (window.__batoman?.simTicks ?? 0) > 5);

    const y = (await hooks(page)).player.y;
    const frames = (await hooks(page)).frames;
    await page.keyboard.press('Space');
    await page.waitForFunction((n) => (window.__batoman?.frames ?? 0) > n + 20, frames);
    expect((await hooks(page)).player.y).toBeLessThanOrEqual(y + 1);

    await page.keyboard.press('KeyQ');
    await page.waitForFunction((baseline) => (window.__batoman?.player.y ?? 0) > baseline + 1, y);
    await page.waitForFunction(() => {
      const pose = window.__batoman?.player.pose;
      return pose === 'idle' || pose === 'run';
    });

    await page.keyboard.press('Escape');
    await screen(page, 'paused');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await screen(page, 'controls');
    await select('reset');
    await page.keyboard.press('Enter');
    await expect(page.locator('li[data-action="jump"] .shell-keys')).toHaveText('Space  W  Up');
    expect(await jumpKeys()).toEqual(['Space', 'KeyW', 'ArrowUp']);

    await page.keyboard.press('Escape');
    await screen(page, 'paused');
    await page.keyboard.press('Escape');
    await screen(page, 'playing');
    const grounded = (await hooks(page)).player.y;
    await page.keyboard.press('Space');
    await page.waitForFunction((baseline) => (window.__batoman?.player.y ?? 0) > baseline + 1, grounded);

    await page.reload();
    await ready(page);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await screen(page, 'controls');
    await expect(page.locator('li[data-action="jump"] .shell-keys')).toHaveText('Space  W  Up');
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('a saved reduce-motion flag snaps the results tally', async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      localStorage.setItem(
        'batoman.v2.save',
        JSON.stringify({ version: 1, unlocked: ['level-1'], best: {}, options: { music: false, sfx: false, reduceMotion: true } }),
      );
    });
    await page.goto(withLockstep('/?level=level-1'));
    await ready(page);
    expect((await hooks(page)).reduceMotion).toBe(true);
    await page.evaluate((f) => window.__batoman!.replay!(f), fixture('level-1'));
    await advanceUntilDone(page);
    const first = await page.waitForFunction(() => {
      if (window.__batoman?.screen !== 'complete') return '';
      return document.getElementById('overlay')?.dataset['tally'] ?? '';
    });
    // The first paint is already the finished card. An animated count would still be `running`.
    expect(await first.jsonValue()).toBe('done');
    await expectResultsCard(page, { kills: 1750, clear: 500, hearts: 300, total: 2550 });
  });

  test('explicit reduce-motion off still counts when the OS prefers it, and R snaps', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      localStorage.setItem(
        'batoman.v2.save',
        JSON.stringify({ version: 1, unlocked: ['level-1'], best: {}, options: { music: false, sfx: false, reduceMotion: false } }),
      );
    });
    await page.goto(withLockstep('/?level=level-1'));
    await ready(page);
    expect((await hooks(page)).reduceMotion).toBe(false);
    await page.evaluate((f) => window.__batoman!.replay!(f), fixture('level-1'));
    await advanceUntilDone(page);
    const first = await page.waitForFunction(() => {
      if (window.__batoman?.screen !== 'complete') return '';
      return document.getElementById('overlay')?.dataset['tally'] ?? '';
    });
    expect(await first.jsonValue()).toBe('running');
    await expect(page.locator('[data-line="kills"] .shell-tally-num')).not.toHaveText('001750');
    await page.keyboard.press('KeyR');
    // One read, no retry. A count that is only animating is still `running` here and finishes about 1.2 s later.
    const snapped = await page.evaluate(() => ({
      tally: document.getElementById('overlay')?.dataset['tally'] ?? '',
      kills: document.querySelector('[data-line="kills"] .shell-tally-num')?.textContent ?? '',
    }));
    expect(snapped.tally).toBe('done');
    expect(snapped.kills).toBe('001750');
    await expectResultsCard(page, { kills: 1750, clear: 500, hearts: 300, total: 2550 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('batoman.v2.save') ?? '{}') as { options?: { reduceMotion?: boolean } });
    expect(saved.options?.reduceMotion).toBe(true);
  });
});
