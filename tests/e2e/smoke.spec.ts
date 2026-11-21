import { expect, test, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';
import { advance, withLockstep } from './drive';

declare global {
  interface Window {
    __batoman?: TestHooks;
  }
}

const readHooks = (page: Page) => page.evaluate(() => window.__batoman ?? null);

const waitForFrames = (page: Page, n: number) =>
  page.waitForFunction((min) => (window.__batoman?.frames ?? 0) > min, n);

test.describe('smoke', () => {
  // Real-time on purpose: no ?lockstep, so this exercises FixedClock against wall-clock deltas.
  // It waits on simTicks crossing a count, not on a tick rate, so a slow renderer still passes.
  test('boots, renders frames, and runs the sim without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    await page.waitForFunction(() => window.__batoman?.ready === true);
    await waitForFrames(page, 30);

    // The title shows over the frozen first level; Enter starts the run and the sim.
    const title = await readHooks(page);
    expect(title!.screen).toBe('title');
    expect(title!.lockstep).toBe(false);
    expect(title!.simTicks).toBe(0);
    await expect(page.locator('#overlay')).toContainText('BATOMAN');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__batoman?.screen === 'playing');
    await page.waitForFunction(() => (window.__batoman?.simTicks ?? 0) > 30);

    const h = await readHooks(page);
    expect(h).not.toBeNull();
    expect(h!.frames).toBeGreaterThan(30);
    expect(h!.simTicks).toBeGreaterThan(30);
    expect(h!.errors).toEqual([]);
    expect(consoleErrors).toEqual([]);

    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });

  test('draws non-background pixels (renderer actually produced an image)', async ({ page }) => {
    await page.goto('/');
    await waitForFrames(page, 10);

    const distinct = await page.evaluate(() => {
      const c = document.getElementById('game-canvas') as HTMLCanvasElement;
      const gl = c.getContext('webgl2') ?? c.getContext('webgl');
      if (!gl) return -1;
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const seen = new Set<number>();
      for (let i = 0; i < px.length; i += 4 * 97) {
        seen.add((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!);
        if (seen.size > 50) break;
      }
      return seen.size;
    });
    expect(distinct).toBeGreaterThan(5);
  });
});

test.describe('controls', () => {
  test('keyboard drives the sim: run right, tap to hop', async ({ page }) => {
    // Manual lockstep so the hop is sampled tick by tick. A large batch would land before we could see it.
    await page.goto(withLockstep('/?level=level-1', true));
    await waitForFrames(page, 10);
    // Spawn pose is fall until the first tick senses the ground. Manual lockstep does not tick on its own.
    await advance(page, 5);
    const start = (await readHooks(page))!.player;
    expect(start.pose).toBe('idle');
    expect((await readHooks(page))!.lockstep).toBe(true);

    await page.keyboard.down('ArrowRight');
    await advance(page, 40); // full run speed by ~tick 15; 40 ticks clears start.x + 40
    const running = (await readHooks(page))!.player;
    await page.keyboard.up('ArrowRight');
    expect(running.x).toBeGreaterThan(start.x + 40);
    expect(running.pose).toBe('run');

    await advance(page, 24); // ground decel returns to idle in about 11 ticks
    expect((await readHooks(page))!.player.pose).toBe('idle');

    await page.keyboard.press('Space');
    const hop = await page.evaluate((startY) => {
      const h = window.__batoman!;
      let peak = startY;
      for (let i = 0; i < 40; i++) {
        h.advance!(2);
        peak = Math.max(peak, h.player.y);
        if (h.player.pose === 'idle' && i > 2) break;
      }
      return { peak, pose: h.player.pose };
    }, start.y);
    expect(hop.peak).toBeGreaterThan(start.y + 1);
    expect(hop.pose).toBe('idle');
    expect((await readHooks(page))!.errors).toEqual([]);
  });
});
