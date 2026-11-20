/**
 * Test-only sim stepping. Compiled into the bundle only when the build sets
 * `VITE_E2E_LOCKSTEP=1` (`npm run build:e2e`). `npm run build`, `npm run dev`,
 * and the Pages workflow (which sets `VITE_BASE_PATH` and runs `npm run build`)
 * leave the flag unset, and the bundler drops this module.
 */

/**
 * Ticks per rendered frame while a person (or nothing) is driving. Small so a
 * jump stays visible across frames when a test is not calling `advance`.
 */
export const LOCKSTEP_INTERACTIVE_TICKS = 4;
/**
 * Ticks per rendered frame while a replay feeds inputs. Default 0: the frame loop does not
 * play the replay, so a screenshot cannot race past a boss phase. Tests call `advance`.
 * `?replayTicks=N` opts into frame-loop batches. A batch stops early when boss phase,
 * engagement, or world status changes.
 */
export const LOCKSTEP_REPLAY_TICKS = 0;
/** Upper bound for `advance` and for query-string tick counts. */
export const MAX_ADVANCE_TICKS = 10_000;

export interface LockstepOptions {
  /** Ticks simulated per rendered frame when no replay is feeding inputs. `0` steps only via `advance`. */
  readonly interactive: number;
  /** Ticks simulated per rendered frame while a replay is active. */
  readonly replay: number;
}

/**
 * `?lockstep=1` is required. `?ticksPerFrame=N` and `?replayTicks=N` only override
 * budgets when that flag is set, and a present-but-invalid count disables lockstep
 * rather than falling back (so `?replayTicks=0` alone does nothing, and a typo does not
 * silently step at the default rate).
 */
export function lockstepFromQuery(search: string): LockstepOptions | null {
  const q = new URLSearchParams(search);
  if (q.get('lockstep') !== '1') return null;
  const interactive = parseTickCount(q.get('ticksPerFrame'), LOCKSTEP_INTERACTIVE_TICKS);
  const replay = parseTickCount(q.get('replayTicks'), LOCKSTEP_REPLAY_TICKS);
  if (interactive === null || replay === null) return null;
  return { interactive, replay };
}

/** `null` when the key is present but not an integer in `0..MAX_ADVANCE_TICKS`. Absent key uses `fallback`. */
function parseTickCount(raw: string | null, fallback: number): number | null {
  if (raw == null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (n > MAX_ADVANCE_TICKS) return null;
  return n;
}
