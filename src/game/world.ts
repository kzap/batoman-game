import { SIM_DT } from '@core/sim/clock';
import { EventBus } from '@core/sim/events';
import type { Vec2 } from '@core/math/vec2';

/** Events the sim announces. Grows as gameplay systems land in later phases. */
export interface WorldEvents extends Record<string, unknown> {
  tick: { tick: number };
}

/**
 * Snapshot of everything the renderer needs. The renderer reads snapshots;
 * it never reaches into the World. Two consecutive snapshots are interpolated
 * for smooth motion between fixed ticks.
 */
export interface WorldSnapshot {
  readonly tick: number;
  readonly marker: Vec2;
}

/**
 * Phase 0 placeholder world: a single marker moving on a fixed circuit so the
 * clock -> sim -> snapshot -> renderer path is exercised end to end.
 * Replaced by the real Actor/Solid world in Phase 2.
 */
export class World {
  readonly events = new EventBus<WorldEvents>();
  private tick = 0;

  step(): void {
    this.tick += 1;
    this.events.emit('tick', { tick: this.tick });
  }

  snapshot(): WorldSnapshot {
    const t = this.tick * SIM_DT;
    return {
      tick: this.tick,
      marker: { x: Math.cos(t) * 3, y: 1.5 + Math.sin(t * 2) * 0.5 },
    };
  }

  get currentTick(): number {
    return this.tick;
  }
}
