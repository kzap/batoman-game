/**
 * Skyline bottom-left rectangle packer. Deterministic: same input order and
 * sizes always produce the same layout. Good enough for a few dozen sprite
 * frames per atlas; we do not need MaxRects-level density.
 */

export interface PackInput {
  readonly id: string;
  readonly w: number;
  readonly h: number;
}

export interface Placement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PackResult {
  readonly width: number;
  readonly height: number;
  readonly placements: readonly Placement[];
}

interface SkylineNode {
  x: number;
  y: number;
  w: number;
}

class Skyline {
  private nodes: SkylineNode[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.nodes = [{ x: 0, y: 0, w: width }];
  }

  /** Lowest y at which a w-wide rect starting at node i fits; -1 if it overflows. */
  private fitAt(i: number, w: number, h: number): number {
    const start = this.nodes[i];
    if (start.x + w > this.width) return -1;
    let y = start.y;
    let remaining = w;
    for (let j = i; remaining > 0 && j < this.nodes.length; j++) {
      y = Math.max(y, this.nodes[j].y);
      if (y + h > this.height) return -1;
      remaining -= this.nodes[j].w;
    }
    return remaining > 0 ? -1 : y;
  }

  place(w: number, h: number): { x: number; y: number } | null {
    let best: { x: number; y: number; i: number } | null = null;
    for (let i = 0; i < this.nodes.length; i++) {
      const y = this.fitAt(i, w, h);
      if (y < 0) continue;
      const x = this.nodes[i].x;
      if (!best || y + h < best.y + h || (y + h === best.y + h && x < best.x)) best = { x, y, i };
    }
    if (!best) return null;

    // Insert the new top segment and trim overlapped nodes.
    const node: SkylineNode = { x: best.x, y: best.y + h, w };
    this.nodes.splice(best.i, 0, node);
    for (let j = best.i + 1; j < this.nodes.length; j++) {
      const n = this.nodes[j];
      const prev = this.nodes[j - 1];
      if (n.x >= prev.x + prev.w) break;
      const shrink = prev.x + prev.w - n.x;
      n.x += shrink;
      n.w -= shrink;
      if (n.w <= 0) {
        this.nodes.splice(j, 1);
        j--;
      }
    }
    // Merge equal-height neighbours.
    for (let j = 0; j < this.nodes.length - 1; j++) {
      if (this.nodes[j].y === this.nodes[j + 1].y) {
        this.nodes[j].w += this.nodes[j + 1].w;
        this.nodes.splice(j + 1, 1);
        j--;
      }
    }
    return { x: best.x, y: best.y };
  }
}

/** Try to pack everything into a fixed-size bin. Null when something does not fit. */
export function packInto(items: readonly PackInput[], width: number, height: number, padding: number): Placement[] | null {
  const sky = new Skyline(width, height);
  const order = [...items].sort((a, b) => b.h - a.h || b.w - a.w || a.id.localeCompare(b.id));
  const out: Placement[] = [];
  for (const it of order) {
    const p = sky.place(it.w + padding, it.h + padding);
    if (!p) return null;
    out.push({ id: it.id, x: p.x, y: p.y, w: it.w, h: it.h });
  }
  return out;
}

/**
 * Pack into the smallest power-of-two texture (square or 2:1) up to `maxSize`.
 * `padding` is reserved on the right/bottom of every item so extrusion and a
 * gutter both fit. Throws when the items cannot fit at all.
 */
export function packAtlas(items: readonly PackInput[], padding = 2, maxSize = 4096): PackResult {
  if (items.length === 0) return { width: 1, height: 1, placements: [] };
  const area = items.reduce((n, it) => n + (it.w + padding) * (it.h + padding), 0);
  const candidates: [number, number][] = [];
  for (let size = 64; size <= maxSize; size *= 2) {
    candidates.push([size, size / 2], [size, size]);
  }
  for (const [w, h] of candidates) {
    if (w * h < area) continue;
    const placements = packInto(items, w, h, padding);
    if (placements) return { width: w, height: h, placements };
  }
  const biggest = items.reduce((m, it) => Math.max(m, it.w, it.h), 0);
  throw new Error(`cannot pack ${items.length} frames (largest side ${biggest}px, total area ${area}px) within ${maxSize}x${maxSize}`);
}
