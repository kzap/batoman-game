import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';

declare global {
  interface Window {
    __batoman?: TestHooks;
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '../../e2e-screenshots');
const hooks = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__batoman)) as TestHooks);
const editorReady = (page: Page) => page.waitForFunction(() => window.__batoman?.ready === true && window.__batoman.editor !== null && window.__batoman.frames > 10);

/**
 * The editor runs against the production build here, so saving falls back to
 * a download; the dev-server endpoint is covered by tools/dev tests.
 */
test.describe('level editor (?edit=1)', () => {
  test('opens with the sim frozen, creates a solid by dragging, selects it, and undoes', async ({ page }) => {
    await page.goto('/?edit=1');
    await editorReady(page);
    const h0 = await hooks(page);
    expect(h0.mode).toBe('edit');
    expect(h0.editor!.tool).toBe('select');
    expect(h0.editor!.dirty).toBe(false);
    await expect(page.locator('.editor-problems')).toContainText('level is valid');
    await expect(page.locator('.editor-prop')).toHaveCount(24); // level-1-props palette
    await page.screenshot({ path: resolve(SHOTS, 'editor-open.png') });

    // Ticks must not advance while editing.
    const ticks0 = h0.simTicks;
    await page.waitForTimeout(300);
    expect((await hooks(page)).simTicks).toBe(ticks0);

    // Solid tool (1), drag a rectangle in the middle of the canvas.
    await page.keyboard.press('Digit1');
    expect((await hooks(page)).editor!.tool).toBe('solid');
    await page.mouse.move(560, 300);
    await page.mouse.down();
    await page.mouse.move(700, 360, { steps: 6 });
    await page.mouse.up();
    const h1 = await hooks(page);
    expect(h1.editor!.objects).toBe(h0.editor!.objects + 1);
    expect(h1.editor!.selection).toMatch(/^solid#\d+$/);
    expect(h1.editor!.dirty).toBe(true);
    await expect(page.locator('.editor-fields')).toContainText('solid #');
    await expect(page.locator('.editor-fields input[name="field-w"]')).toHaveValue(/^\d+$/);
    await page.screenshot({ path: resolve(SHOTS, 'editor-created.png') });

    // Clicking the new solid with the select tool keeps it selected; Escape clears; undo removes it.
    await page.keyboard.press('KeyV');
    await page.mouse.click(630, 330);
    expect((await hooks(page)).editor!.selection).toBe(h1.editor!.selection);
    await page.keyboard.press('Escape');
    expect((await hooks(page)).editor!.selection).toBeNull();
    await page.keyboard.press('Control+KeyZ');
    const h2 = await hooks(page);
    expect(h2.editor!.objects).toBe(h0.editor!.objects);
    expect(h2.errors).toEqual([]);
  });

  test('P playtests the edited level from the spawn and returns to the editor', async ({ page }) => {
    await page.goto('/?edit=1');
    await editorReady(page);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.__batoman?.mode === 'play');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(700);
    await page.keyboard.up('ArrowRight');
    const playing = await hooks(page);
    expect(playing.editor!.playing).toBe(true);
    expect(playing.player.x).toBeGreaterThan(150);
    expect(playing.simTicks).toBeGreaterThan(50);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.__batoman?.mode === 'edit');
    const back = await hooks(page);
    expect(back.editor!.playing).toBe(false);
    expect(back.errors).toEqual([]);
  });

  test('a level without art opens with an empty palette and still edits', async ({ page }) => {
    await page.goto('/?edit=1&level=level-3');
    await editorReady(page);
    await expect(page.locator('.editor-palette')).toContainText('no prop atlas');
    await page.keyboard.press('Digit2'); // one-way
    await page.mouse.move(500, 400);
    await page.mouse.down();
    await page.mouse.move(600, 420, { steps: 4 });
    await page.mouse.up();
    const h = await hooks(page);
    expect(h.level).toBe('level-3');
    expect(h.editor!.selection).toMatch(/^oneWay#/);
    expect(h.errors).toEqual([]);
  });
});
