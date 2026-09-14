import type { AABB } from '../math/aabb';
import { overlaps } from '../math/aabb';

/**
 * Integer-pixel Actor/Solid collision (the Celeste model). Positions are whole
 * pixels; fractional motion accumulates in per-axis remainders so slow speeds
 * still add up. Y points up, so "standing on" means actor.y === solid.y + solid.h.
 *
 * Solids never overlap each other by contract; actors are moved one pixel at a
 * time and stop at the first solid pixel. Moving solids push or carry actors.
 */

export interface Solid {
  readonly id: number;
  /** Min corner; mutable only through `moveSolid`. */
  x: number;
  y: number;
  readonly w: number;
  readonly h: number;
  /** Blocks only from above (and only when the actor was fully above it). */
  readonly oneWay: boolean;
  /** Cleared while the solid itself is being moved so it does not block its riders. */
  collidable: boolean;
}

/**
 * Mutable actor body. `rx`/`ry` hold sub-pixel remainders in [-0.5, 0.5].
 * `h` is mutable for crouching; the caller checks the space is free first.
 */
export class Body implements AABB {
  x: number;
  y: number;
  h: number;
  rx = 0;
  ry = 0;

  constructor(
    x: number,
    y: number,
    readonly w: number,
    h: number,
  ) {
    this.h = h;
    this.x = Math.round(x);
    this.y = Math.round(y);
  }

  get right(): number {
    return this.x + this.w;
  }
  get top(): number {
    return this.y + this.h;
  }
  get centerX(): number {
    return this.x + this.w / 2;
  }

  /** Exact position including remainders; for interpolation and debug only. */
  get exactX(): number {
    return this.x + this.rx;
  }
  get exactY(): number {
    return this.y + this.ry;
  }

  /** Reposition and drop remainders (teleport, respawn). */
  place(x: number, y: number): void {
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.rx = 0;
    this.ry = 0;
  }
}

export interface MoveOptions {
  /**
   * When moving up and blocked, try shifting left/right up to this many pixels
   * to slip past a corner. Makes narrow gaps and ledge edges forgiving.
   */
  readonly ceilingCorrection?: number;
  /** Fall through one-way platforms (holding down). */
  readonly ignoreOneWay?: boolean;
}

export type CollideCallback = (solid: Solid) => void;

const boxAt = (b: Body, x: number, y: number): AABB => ({ x, y, w: b.w, h: b.h });

export class CollisionWorld {
  private readonly solids: Solid[] = [];
  private nextId = 1;

  addSolid(box: AABB, oneWay = false): Solid {
    const s: Solid = { id: this.nextId++, x: box.x, y: box.y, w: box.w, h: box.h, oneWay, collidable: true };
    this.solids.push(s);
    return s;
  }

  removeSolid(solid: Solid): void {
    const i = this.solids.indexOf(solid);
    if (i >= 0) this.solids.splice(i, 1);
  }

  get all(): readonly Solid[] {
    return this.solids;
  }

  /**
   * First full solid overlapping the box. One-way platforms are not solid in
   * this query; they only matter to a downward move (see `moveY`).
   */
  solidAt(box: AABB): Solid | null {
    for (const s of this.solids) if (s.collidable && !s.oneWay && overlaps(box, s)) return s;
    return null;
  }

  /** One-way platform whose top edge is exactly under the box (box.y === top). */
  private oneWayUnder(box: AABB): Solid | null {
    for (const s of this.solids) {
      if (!s.collidable || !s.oneWay) continue;
      if (box.y === s.y + s.h && box.x < s.x + s.w && box.x + box.w > s.x) return s;
    }
    return null;
  }

  /** Full solid or one-way platform directly under the body's feet. */
  groundUnder(b: Body): Solid | null {
    return this.solidAt(boxAt(b, b.x, b.y - 1)) ?? this.oneWayUnder(b);
  }

  /** Solid touching the body's left (dir -1) or right (dir 1) side. */
  wallBeside(b: Body, dir: -1 | 1): Solid | null {
    return this.solidAt(boxAt(b, b.x + dir, b.y));
  }

  /**
   * Move horizontally by `amount` pixels (fractional allowed). Stops at the
   * first solid and reports it. Returns true when blocked.
   */
  moveX(b: Body, amount: number, onCollide?: CollideCallback): boolean {
    b.rx += amount;
    let move = Math.round(b.rx);
    if (move === 0) return false;
    b.rx -= move;
    const sign = Math.sign(move);
    while (move !== 0) {
      const hit = this.solidAt(boxAt(b, b.x + sign, b.y));
      if (hit) {
        b.rx = 0;
        onCollide?.(hit);
        return true;
      }
      b.x += sign;
      move -= sign;
    }
    return false;
  }

  /** Vertical counterpart of `moveX`; negative is down. Handles one-way platforms and ceiling corners. */
  moveY(b: Body, amount: number, onCollide?: CollideCallback, opts: MoveOptions = {}): boolean {
    b.ry += amount;
    let move = Math.round(b.ry);
    if (move === 0) return false;
    b.ry -= move;
    const sign = Math.sign(move);
    while (move !== 0) {
      let hit = this.solidAt(boxAt(b, b.x, b.y + sign));
      if (!hit && sign < 0 && !opts.ignoreOneWay) hit = this.oneWayUnder(b);
      if (hit && sign > 0 && opts.ceilingCorrection && this.slipPastCorner(b, opts.ceilingCorrection)) {
        continue;
      }
      if (hit) {
        b.ry = 0;
        onCollide?.(hit);
        return true;
      }
      b.y += sign;
      move -= sign;
    }
    return false;
  }

  /** Shift the body sideways by the smallest offset (<= max) that lets it rise one pixel. */
  private slipPastCorner(b: Body, max: number): boolean {
    for (let d = 1; d <= max; d++) {
      for (const dir of [1, -1]) {
        const nx = b.x + dir * d;
        if (!this.solidAt(boxAt(b, nx, b.y)) && !this.solidAt(boxAt(b, nx, b.y + 1))) {
          b.x = nx;
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Move a solid, carrying actors that stand on it and pushing actors it runs
   * into. An actor pushed into another solid is reported to `onSquish`.
   * The solid is non-collidable during its own move so riders can be moved
   * freely; anything else in the world still blocks them.
   */
  moveSolid(solid: Solid, dx: number, dy: number, actors: readonly Body[], onSquish?: (b: Body) => void): void {
    if (dx === 0 && dy === 0) return;
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) throw new Error('moveSolid takes whole pixels; accumulate fractions in the caller');
    solid.collidable = false;
    if (dx !== 0) {
      const riders = actors.filter((a) => this.isRiding(a, solid));
      solid.x += dx;
      for (const a of actors) {
        if (overlaps(a, solid) && !solid.oneWay) {
          const push = dx > 0 ? solid.x + solid.w - a.x : solid.x - a.right;
          if (this.moveX(a, push)) onSquish?.(a);
        } else if (riders.includes(a)) {
          this.carry(a, dx, 0);
        }
      }
    }
    if (dy !== 0) {
      // Re-evaluate: a rider stopped by a wall during the horizontal pass is no longer on board.
      const riders = actors.filter((a) => this.isRiding(a, solid));
      solid.y += dy;
      for (const a of actors) {
        if (overlaps(a, solid) && !solid.oneWay) {
          const push = dy > 0 ? solid.y + solid.h - a.y : solid.y - a.top;
          if (this.moveY(a, push)) onSquish?.(a);
        } else if (riders.includes(a)) {
          this.carry(a, 0, dy);
        }
      }
    }
    solid.collidable = true;
  }

  /** Move a rider by whole pixels without touching its own sub-pixel remainders. */
  private carry(a: Body, dx: number, dy: number): void {
    const { rx, ry } = a;
    a.rx = 0;
    a.ry = 0;
    if (dx) this.moveX(a, dx);
    if (dy) this.moveY(a, dy);
    a.rx = rx;
    a.ry = ry;
  }

  /** Standing on the solid: feet on its top edge with horizontal overlap. */
  isRiding(b: Body, solid: Solid): boolean {
    return b.y === solid.y + solid.h && b.x < solid.x + solid.w && b.right > solid.x;
  }
}
