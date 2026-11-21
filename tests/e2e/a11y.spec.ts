import { expect, test, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';

const hooks = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__batoman)) as TestHooks);
const ready = (page: Page) => page.waitForFunction(() => window.__batoman?.ready === true && window.__batoman.frames > 10);
/** Computed animation of a freshly gained heart. Reduce-motion sets it to `none`. */
const heartWobble = (page: Page) =>
  page.evaluate(() => {
    const el = document.createElement('span');
    el.className = 'hud-heart hud-heart-gained';
    document.body.append(el);
    const name = getComputedStyle(el).animationName;
    el.remove();
    return name;
  });

const saveOptions = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('batoman.v2.save');
    return raw ? (JSON.parse(raw) as { options?: { reduceMotion?: boolean | null } }).options : null;
  });

test.describe('accessibility', () => {
  test('prefers-reduced-motion starts reduce-motion, R stores an explicit choice that wins afterwards', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await ready(page);
    const on = await hooks(page);
    expect(on.reduceMotion).toBe(true);
    expect(on.grain).toBe(false);
    expect(await heartWobble(page)).toBe('none');
    expect(on.errors).toEqual([]);
    await expect(page.locator('#overlay')).toHaveAttribute('data-reduce-motion', 'on');
    await expect(page.locator('.shell-hint')).toContainText('R motion on');
    // Following the OS does not write a choice.
    expect(await saveOptions(page)).toBeNull();

    await page.keyboard.press('KeyR');
    const off = await hooks(page);
    expect(off.reduceMotion).toBe(false);
    expect(off.grain).toBe(true);
    expect(await heartWobble(page)).toBe('hud-heart-wobble');
    expect((await saveOptions(page))?.reduceMotion).toBe(false);
    await expect(page.locator('.shell-hint')).toContainText('R motion off');

    // The stored false wins over the OS preference on the next boot.
    await page.goto('/');
    await ready(page);
    expect((await hooks(page)).reduceMotion).toBe(false);
    expect((await hooks(page)).grain).toBe(true);
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('?reduceMotion=1 forces the session on without writing until R', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'batoman.v2.save',
        JSON.stringify({ version: 1, unlocked: ['level-1'], best: {}, options: { music: true, sfx: true, reduceMotion: false } }),
      );
    });
    await page.goto('/?reduceMotion=1');
    await ready(page);
    expect((await hooks(page)).reduceMotion).toBe(true);
    expect((await hooks(page)).grain).toBe(false);
    expect((await saveOptions(page))?.reduceMotion).toBe(false);

    await page.keyboard.press('KeyR');
    // The query had it on, so R stores the opposite and drops the override.
    expect((await hooks(page)).reduceMotion).toBe(false);
    expect((await saveOptions(page))?.reduceMotion).toBe(false);
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('R still toggles reduce-motion when gameplay keys are rebound', async ({ page }) => {
    const bindings = {
      left: ['KeyA'],
      right: ['KeyD'],
      up: ['ArrowUp'],
      down: ['KeyS'],
      jump: ['KeyQ'],
      fire: ['KeyZ'],
      dash: ['KeyX'],
    };
    await page.addInitScript((table) => {
      localStorage.setItem(
        'batoman.v2.save',
        JSON.stringify({
          version: 1,
          unlocked: ['level-1'],
          best: {},
          options: { music: true, sfx: true, reduceMotion: false },
          bindings: table,
        }),
      );
    }, bindings);
    await page.goto('/');
    await ready(page);
    expect((await hooks(page)).reduceMotion).toBe(false);
    await page.keyboard.press('KeyR');
    expect((await hooks(page)).reduceMotion).toBe(true);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('batoman.v2.save') ?? '{}') as { options?: { reduceMotion?: boolean }; bindings?: { jump?: string[] } });
    expect(saved.options?.reduceMotion).toBe(true);
    expect(saved.bindings?.jump).toEqual(['KeyQ']);
    expect((await hooks(page)).errors).toEqual([]);
  });
});
