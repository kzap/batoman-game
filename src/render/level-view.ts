import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, type Material } from 'three';
import type { LevelJson, Rect } from '@content/level';
import { LAYER_Z, PALETTE } from './stage';
import { rectCenter, toUnits } from './units';

/** Depth of gameplay-plane geometry. Solids sit slightly behind Z=0 so actors read in front. */
const SOLID_DEPTH = 2;
const SOLID_Z = -0.5;

/**
 * Grey-box rendering of a level's static geometry straight from the JSON:
 * solids, one-way platforms, hazards, zones, and backdrop planes sized to the
 * level. No art; colours only encode meaning so the layout can be judged.
 */
export class LevelView {
  readonly group = new Group();
  private readonly materials: Material[] = [];

  constructor(level: LevelJson) {
    const solid = this.material(new MeshStandardMaterial({ color: PALETTE.concreteGrey, roughness: 0.9 }));
    const oneWay = this.material(new MeshStandardMaterial({ color: PALETTE.rustOrange, roughness: 0.8 }));
    const spikes = this.material(new MeshStandardMaterial({ color: PALETTE.neonMagenta, emissive: PALETTE.neonMagenta, emissiveIntensity: 0.5 }));
    const crusher = this.material(new MeshStandardMaterial({ color: 0xaa2222, roughness: 0.6 }));
    const death = this.material(new MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.25 }));
    const checkpoint = this.material(new MeshBasicMaterial({ color: PALETTE.neonCyan, transparent: true, opacity: 0.25 }));
    const exit = this.material(new MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0.3 }));
    const spawn = this.material(new MeshBasicMaterial({ color: PALETTE.warmAmber, transparent: true, opacity: 0.6 }));

    for (const r of level.solids) this.box(r, solid, SOLID_DEPTH, SOLID_Z);
    for (const r of level.oneWay) this.box(r, oneWay, SOLID_DEPTH * 0.6, SOLID_Z);
    for (const h of level.hazards) this.box(h, h.kind === 'spikes' ? spikes : crusher, 1, 0);
    for (const r of level.deathZones) this.plane(r, death, -0.2);
    for (const r of level.checkpoints) this.plane(r, checkpoint, -0.3);
    this.plane(level.exit, exit, -0.3);
    for (const e of level.enemies) this.plane({ x: e.x - 12, y: e.y, w: 24, h: 48 }, spawn, -0.3);

    this.backdrops(level);
  }

  private material<M extends Material>(m: M): M {
    this.materials.push(m);
    return m;
  }

  private box(r: Rect, m: Material, depth: number, z: number): void {
    const mesh = new Mesh(new BoxGeometry(toUnits(r.w), toUnits(r.h), depth), m);
    const c = rectCenter(r);
    mesh.position.set(c.x, c.y, z);
    this.group.add(mesh);
  }

  private plane(r: Rect, m: Material, z: number): void {
    const mesh = new Mesh(new PlaneGeometry(toUnits(r.w), toUnits(r.h)), m);
    const c = rectCenter(r);
    mesh.position.set(c.x, c.y, z);
    this.group.add(mesh);
  }

  /** Unlit planes at the standard depths, wide enough to cover the level from any camera position. */
  private backdrops(level: LevelJson): void {
    const w = toUnits(level.width);
    const h = toUnits(level.height);
    const layers = [
      { z: LAYER_Z.nearStructures, color: 0x3a2f4d, margin: 30 },
      { z: LAYER_Z.midStructures, color: PALETTE.smogPurple, margin: 60 },
      { z: LAYER_Z.farStructures, color: 0x1a1530, margin: 120 },
      { z: LAYER_Z.farSky, color: PALETTE.deepShadow, margin: 260 },
    ];
    for (const { z, color, margin } of layers) {
      const m = this.material(new MeshBasicMaterial({ color }));
      const plane = new Mesh(new PlaneGeometry(w + margin * 2, h + margin), m);
      plane.position.set(w / 2, h / 2 + margin * 0.1, z);
      this.group.add(plane);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    this.group.removeFromParent();
  }
}
