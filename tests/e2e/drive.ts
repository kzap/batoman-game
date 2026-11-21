import type { Page } from '@playwright/test';

/**
 * Append `?lockstep=1` so the sim steps a fixed tick count instead of wall time.
 * `manual` sets `ticksPerFrame=0`: the frame loop only presents, and the sim
 * moves when the test calls `advance`.
 */
export function withLockstep(path: string, manual = false): string {
  const url = new URL(path, 'http://localhost');
  url.searchParams.set('lockstep', '1');
  if (manual) url.searchParams.set('ticksPerFrame', '0');
  return `${url.pathname}${url.search}`;
}

/** Step the lockstep sim `ticks` times and present once. */
export async function advance(page: Page, ticks: number): Promise<void> {
  await page.evaluate((n) => {
    const step = window.__batoman?.advance;
    if (!step) throw new Error('window.__batoman.advance is missing; open the page with ?lockstep=1');
    step(n);
  }, ticks);
}

/** A sim landmark. Checked after each chunk so a transient state (boss phase) is not skipped. */
export type SimUntil =
  | { readonly x: number }
  | { readonly y: number }
  | { readonly engaged: true }
  | { readonly phase: number }
  | { readonly exposed: true }
  | { readonly done: true };

/**
 * Step the sim in chunks until `until` holds. The replay frame budget stays 0, so the sim
 * does not move while the test is screenshotting or asserting between calls.
 * Chunk size is below the shortest boss-phase window in the Level 1 fixture (337 ticks).
 * The stun window is only 100 ticks: pass a step under that when waiting for `{ exposed: true }`.
 */
export async function stepUntil(page: Page, until: SimUntil, timeout = 30_000, step = 120): Promise<void> {
  await page.waitForFunction(
    ({ until, step }) => {
      const h = window.__batoman;
      if (!h) return false;
      const met = (): boolean => {
        if ('done' in until) return h.status !== 'playing';
        if ('engaged' in until) return h.boss?.engaged === true;
        if ('phase' in until) return (h.boss?.phase ?? 0) >= until.phase;
        if ('exposed' in until) return h.weakPoint !== null;
        if ('x' in until) return h.player.x > until.x;
        return h.player.y >= until.y;
      };
      if (met()) return true;
      h.advance?.(step);
      return met();
    },
    { until, step },
    { timeout },
  );
}

/** Run a replay to the end inside the page. Returns when the world leaves `playing`. */
export async function advanceUntilDone(page: Page, step = 120, maxChunks = 100): Promise<void> {
  const status = await page.evaluate(
    ({ step, maxChunks }) => {
      const h = window.__batoman;
      if (!h?.advance) throw new Error('window.__batoman.advance is missing; open the page with ?lockstep=1');
      for (let i = 0; i < maxChunks && h.status === 'playing'; i++) h.advance(step);
      return h.status;
    },
    { step, maxChunks },
  );
  if (status === 'playing') throw new Error(`sim still playing after ${maxChunks * step} lockstep ticks`);
}
