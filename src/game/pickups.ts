import { overlaps, type AABB } from '@core/math/aabb';
import type { PickupJson, PickupKind, Rect } from '@content/level';
import type { Health } from './health';
import { PICKUP } from './tuning';

/**
 * What a pickup may change. Overlap and the one-shot flag do not know about
 * hearts: they call `applyPickup`. A timed pickup (invincibility) adds a kind
 * and a method here — a buff clock, for example — and leaves the loop alone.
 */
export interface PickupCollector {
  /** False while the player is dead. A dead collector never receives an effect. */
  readonly alive: boolean;
  readonly health: Health;
}

/** Apply `kind` once. False means "do not consume" (dead, or a no-op amount). */
export function applyPickup(kind: PickupKind, collector: PickupCollector): boolean {
  if (!collector.alive || !collector.health.alive) return false;
  switch (kind) {
    case 'hp-up':
      return collector.health.gainHearts(PICKUP.hpUp.hearts);
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export interface PickupSnapshot {
  readonly id: number;
  readonly kind: PickupKind;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * One placed collectible. `collected` sticks for the rest of the level,
 * including checkpoint respawns; the World does not rebuild the list on death.
 */
export class Pickup {
  collected = false;

  constructor(
    readonly id: number,
    readonly kind: PickupKind,
    readonly box: Rect,
  ) {}

  /** Overlap-collect. True only on the tick it is consumed. */
  tryCollect(body: AABB, collector: PickupCollector): boolean {
    if (this.collected || !overlaps(body, this.box)) return false;
    if (!applyPickup(this.kind, collector)) return false;
    this.collected = true;
    return true;
  }

  snapshot(): PickupSnapshot {
    return { id: this.id, kind: this.kind, x: this.box.x, y: this.box.y, w: this.box.w, h: this.box.h };
  }
}

export function createPickups(list: readonly PickupJson[] | undefined): Pickup[] {
  return (list ?? []).map((p, id) => new Pickup(id, p.kind, { x: p.x, y: p.y, w: p.w, h: p.h }));
}
