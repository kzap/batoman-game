/**
 * Fixed-capacity projectile pool. Slots are reused so a long fight allocates
 * nothing; ids are fresh per shot so the renderer can key sprites by id.
 */

import { SIM_DT } from '@core/sim/clock';

export type ProjectileKind = 'plasma' | 'nova' | 'enemy';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  /** Centre position. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  damage: number;
  range: number;
  travelled: number;
  /** Keeps flying through enemies it has damaged (nova). */
  pierce: boolean;
  /** Enemies this shot has already damaged (pierce only). */
  hitIds: number[];
  active: boolean;
}

export interface ProjectileSnapshot {
  readonly id: number;
  readonly kind: ProjectileKind;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  /** Facing for the sprite, from the velocity. */
  readonly dir: 1 | -1;
}

export interface ShotSpec {
  readonly kind: ProjectileKind;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly w: number;
  readonly h: number;
  readonly damage: number;
  readonly range: number;
  readonly pierce?: boolean;
}

/** Advance one tick. */
export function advanceProjectile(p: Projectile): void {
  p.x += p.vx * SIM_DT;
  p.y += p.vy * SIM_DT;
  p.travelled += Math.sqrt(p.vx * p.vx + p.vy * p.vy) * SIM_DT;
}

/** Axis-aligned box of a projectile, integer-aligned for the collision query. */
export function projectileBox(p: Projectile): { x: number; y: number; w: number; h: number } {
  return { x: Math.round(p.x - p.w / 2), y: Math.round(p.y - p.h / 2), w: p.w, h: p.h };
}

export class ProjectilePool {
  private readonly slots: Projectile[] = [];
  private nextId = 1;

  constructor(readonly capacity = 64) {
    for (let i = 0; i < capacity; i++) {
      this.slots.push({ id: 0, kind: 'plasma', x: 0, y: 0, vx: 0, vy: 0, w: 0, h: 0, damage: 0, range: 0, travelled: 0, pierce: false, hitIds: [], active: false });
    }
  }

  /** Take a free slot; when the pool is full the oldest active shot is recycled so the newest always flies. */
  spawn(spec: ShotSpec): Projectile {
    let slot = this.slots.find((p) => !p.active);
    if (!slot) {
      slot = this.slots.reduce((oldest, p) => (p.id < oldest.id ? p : oldest));
    }
    slot.id = this.nextId++;
    slot.kind = spec.kind;
    slot.x = spec.x;
    slot.y = spec.y;
    slot.vx = spec.vx;
    slot.vy = spec.vy;
    slot.w = spec.w;
    slot.h = spec.h;
    slot.damage = spec.damage;
    slot.range = spec.range;
    slot.travelled = 0;
    slot.pierce = spec.pierce ?? false;
    slot.hitIds.length = 0;
    slot.active = true;
    return slot;
  }

  release(p: Projectile): void {
    p.active = false;
  }

  clear(): void {
    for (const p of this.slots) p.active = false;
  }

  *active(): IterableIterator<Projectile> {
    for (const p of this.slots) if (p.active) yield p;
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.slots) if (p.active) n++;
    return n;
  }

  snapshot(): ProjectileSnapshot[] {
    const out: ProjectileSnapshot[] = [];
    for (const p of this.slots) if (p.active) out.push({ id: p.id, kind: p.kind, x: p.x, y: p.y, vx: p.vx, vy: p.vy, dir: p.vx < 0 ? -1 : 1 });
    return out;
  }
}
