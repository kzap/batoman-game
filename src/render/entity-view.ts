import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial } from 'three';
import type { WorldSnapshot } from '@game/world';
import { PALETTE } from './stage';
import { toUnits } from './units';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Mirrors dynamic sim entities as grey-box meshes, keyed by id so a mesh
 * lives exactly as long as its entity. Positions are interpolated between the
 * previous and current snapshot; nothing here reads the World.
 */
export class EntityView {
  readonly group = new Group();
  private readonly player: Mesh;
  private readonly playerMaterial: MeshStandardMaterial;
  private readonly projectiles = new Map<number, Mesh>();
  private readonly movers = new Map<number, Mesh>();
  private readonly unitBox = new BoxGeometry(1, 1, 1);
  private readonly projectileMaterial = new MeshStandardMaterial({ color: PALETTE.warmAmber, emissive: PALETTE.warmAmber, emissiveIntensity: 0.8 });
  private readonly moverMaterial = new MeshStandardMaterial({ color: PALETTE.rustOrange, roughness: 0.7 });
  private readonly outlineGeometry = new EdgesGeometry(new BoxGeometry(1, 1, 1));
  private readonly outlineMaterial = new LineBasicMaterial({ color: 0x40ff80 });
  private outlines = false;

  constructor() {
    this.playerMaterial = new MeshStandardMaterial({ color: PALETTE.neonCyan, emissive: PALETTE.neonCyan, emissiveIntensity: 0.4 });
    this.player = new Mesh(this.unitBox, this.playerMaterial);
    this.player.add(this.outline());
    this.group.add(this.player);
  }

  /** Collider outline as a child, so the parent's scale sizes it. Hidden unless debug is on. */
  private outline(): LineSegments {
    const o = new LineSegments(this.outlineGeometry, this.outlineMaterial);
    o.scale.set(1.02, 1.02, 1.02);
    o.visible = this.outlines;
    o.name = 'outline';
    return o;
  }

  /** Show collision boxes (debug overlay). */
  setOutlines(on: boolean): void {
    this.outlines = on;
    this.group.traverse((o) => {
      if (o.name === 'outline') o.visible = on;
    });
  }

  present(prev: WorldSnapshot, cur: WorldSnapshot, alpha: number): void {
    this.presentPlayer(prev, cur, alpha);
    this.sync(this.projectiles, prev.projectiles, cur.projectiles, alpha, this.projectileMaterial, (p) => ({ w: 12, h: 6, x: p.x, y: p.y }));
    this.sync(this.movers, prev.movingSolids, cur.movingSolids, alpha, this.moverMaterial, (s) => ({ w: s.w, h: s.h, x: s.x, y: s.y }));
  }

  private presentPlayer(prev: WorldSnapshot, cur: WorldSnapshot, alpha: number): void {
    const a = prev.player;
    const b = cur.player;
    const x = lerp(a.x, b.x, alpha) + b.w / 2;
    const y = lerp(a.y, b.y, alpha) + b.h / 2;
    this.player.position.set(toUnits(x), toUnits(y), 0.3);
    this.player.scale.set(toUnits(b.w), toUnits(b.h), 0.6);
    this.player.visible = b.pose !== 'dead';
    // Blink while invulnerable; dim while hurt.
    const blink = b.invulnerable && Math.floor(cur.tick / 6) % 2 === 0;
    this.playerMaterial.emissiveIntensity = blink ? 1.2 : 0.4;
    this.playerMaterial.color.setHex(b.pose === 'hurt' ? PALETTE.neonMagenta : PALETTE.neonCyan);
  }

  private sync<T extends { id: number }>(
    pool: Map<number, Mesh>,
    prev: readonly T[],
    cur: readonly T[],
    alpha: number,
    material: MeshStandardMaterial,
    box: (t: T) => { x: number; y: number; w: number; h: number },
  ): void {
    const seen = new Set<number>();
    for (const c of cur) {
      seen.add(c.id);
      let mesh = pool.get(c.id);
      if (!mesh) {
        mesh = new Mesh(this.unitBox, material);
        mesh.add(this.outline());
        pool.set(c.id, mesh);
        this.group.add(mesh);
      }
      const p = prev.find((e) => e.id === c.id) ?? c;
      const pb = box(p);
      const cb = box(c);
      mesh.position.set(toUnits(lerp(pb.x, cb.x, alpha) + cb.w / 2), toUnits(lerp(pb.y, cb.y, alpha) + cb.h / 2), 0);
      mesh.scale.set(toUnits(cb.w), toUnits(cb.h), 1.2);
    }
    for (const [id, mesh] of pool) {
      if (!seen.has(id)) {
        mesh.removeFromParent();
        pool.delete(id);
      }
    }
  }

  get entityCount(): number {
    return 1 + this.projectiles.size + this.movers.size;
  }

  dispose(): void {
    this.unitBox.dispose();
    this.outlineGeometry.dispose();
    this.outlineMaterial.dispose();
    this.playerMaterial.dispose();
    this.projectileMaterial.dispose();
    this.moverMaterial.dispose();
    this.group.removeFromParent();
  }
}
