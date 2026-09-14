/** Simulation tick rate. The sim always advances in whole ticks of 1/SIM_HZ seconds. */
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

/**
 * Upper bound on ticks consumed per frame. Prevents a spiral of death after a
 * long stall (tab hidden, debugger paused): excess time is dropped, not simulated.
 */
export const MAX_TICKS_PER_FRAME = 8;

export interface ClockStep {
  /** Whole sim ticks to run this frame. */
  readonly ticks: number;
  /** Fraction [0,1) of the next tick already elapsed; use for render interpolation. */
  readonly alpha: number;
  /** True if time was discarded because the frame exceeded MAX_TICKS_PER_FRAME. */
  readonly dropped: boolean;
}

/**
 * Fixed-timestep accumulator. Feed it wall-clock frame durations; it tells you
 * how many fixed ticks to simulate and how far to interpolate the render.
 * Pure and deterministic: identical inputs yield identical outputs.
 */
export class FixedClock {
  private accumulator = 0;
  private tickCount = 0;

  constructor(
    private readonly dt: number = SIM_DT,
    private readonly maxTicks: number = MAX_TICKS_PER_FRAME,
  ) {}

  /** Advance by `frameSeconds` of real time. Negative or NaN input is treated as zero. */
  advance(frameSeconds: number): ClockStep {
    const safe = Number.isFinite(frameSeconds) && frameSeconds > 0 ? frameSeconds : 0;
    this.accumulator += safe;

    let ticks = Math.floor(this.accumulator / this.dt);
    let dropped = false;
    if (ticks > this.maxTicks) {
      dropped = true;
      ticks = this.maxTicks;
      // Discard the backlog; keep only the sub-tick remainder.
      this.accumulator = this.accumulator % this.dt;
    } else {
      this.accumulator -= ticks * this.dt;
    }
    this.tickCount += ticks;

    return { ticks, alpha: this.accumulator / this.dt, dropped };
  }

  /** Total ticks issued since construction or last reset. */
  get elapsedTicks(): number {
    return this.tickCount;
  }

  reset(): void {
    this.accumulator = 0;
    this.tickCount = 0;
  }
}
