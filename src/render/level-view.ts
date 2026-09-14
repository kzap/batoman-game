import {
  AdditiveBlending,
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  PlaneGeometry,
  RepeatWrapping,
  type Material,
  type Texture,
} from 'three';
import type { LevelJson, Rect } from '@content/level';
import { BACKDROP_SLOTS, type BackdropSlot, type DecorLayer } from '@content/level-art';
import type { LevelArtAssets } from './assets';
import { backdropPlacement } from './diorama';
import { atlasMaterial, SpriteQuad } from './sprite';
import { LAYER_Z, PALETTE } from './stage';
import { rectCenter, toUnits } from './units';

/** Depth of gameplay-plane geometry. Solids sit slightly behind Z=0 so actors read in front. */
const SOLID_DEPTH = 2;
const SOLID_Z = -0.5;

/** Z of each decor slot. Props hug the colliders; walls are clutter behind them; front pieces pass in front of the player. */
export const DECOR_Z: Readonly<Record<DecorLayer, number>> = { wall: -1.2, prop: -0.4, front: 3 };

/** Z of the zone markers: beams sit just behind the props, death-zone water behind the floor boards, spikes on the plane. */
const ZONE_Z = { beam: -0.3, beamCore: -0.29, deathZone: -0.6, spikes: 0.1, spawn: -0.3 } as const;
/** Debug outlines float just in front of what they outline. */
const OUTLINE_Z = 0.5;
/** Placeholder body of a not-yet-implemented enemy spawn (the player's standing size). */
const SPAWN_BODY = { w: 24, h: 48 };
const spawnBox = (e: { x: number; y: number }): Rect => ({ x: e.x - SPAWN_BODY.w / 2, y: e.y, w: SPAWN_BODY.w, h: SPAWN_BODY.h });

/**
 * Static part of a level: the diorama (backdrop layers and catalogue props)
 * when the level declares art, grey boxes otherwise, plus the glowing zone
 * markers the player must be able to read either way. Collider outlines are
 * built in both modes and shown by the debug toggle.
 */
export class LevelView {
  readonly group = new Group();
  private readonly outlines = new Group();
  private readonly materials: Material[] = [];

  constructor(level: LevelJson, art: LevelArtAssets | null) {
    this.zones(level);
    if (art && level.art) this.diorama(level, art);
    else this.greyBox(level);
    this.colliderOutlines(level);
    this.outlines.visible = false;
    this.group.add(this.outlines);
  }

  /** Show collider outlines (debug overlay). */
  setOutlines(on: boolean): void {
    this.outlines.visible = on;
  }

  private material<M extends Material>(m: M): M {
    this.materials.push(m);
    return m;
  }

  private box(r: Rect, m: Material, depth: number, z: number, parent: Group = this.group): void {
    const mesh = new Mesh(new BoxGeometry(toUnits(r.w), toUnits(r.h), depth), m);
    const c = rectCenter(r);
    mesh.position.set(c.x, c.y, z);
    parent.add(mesh);
  }

  private plane(r: Rect, m: Material, z: number): void {
    const mesh = new Mesh(new PlaneGeometry(toUnits(r.w), toUnits(r.h)), m);
    const c = rectCenter(r);
    mesh.position.set(c.x, c.y, z);
    this.group.add(mesh);
  }

  /** Meaning-carrying markers: checkpoints and the exit glow amber and cyan; hazards and death zones warn in magenta and river teal. */
  private zones(level: LevelJson): void {
    const glow = (color: number, opacity: number): MeshBasicMaterial => this.material(new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }));
    const beam = (r: Rect, color: number): void => {
      // A wide soft column and a thin bright core; the core is what blooms.
      this.plane(r, glow(color, 0.18), ZONE_Z.beam);
      this.plane({ x: r.x + r.w / 2 - 3, y: r.y, w: 6, h: r.h }, glow(color, 0.9), ZONE_Z.beamCore);
    };
    for (const c of level.checkpoints) beam(c, PALETTE.warmAmber);
    beam(level.exit, PALETTE.neonCyan);
    for (const r of level.deathZones) this.plane(r, glow(PALETTE.bioTeal, 0.18), ZONE_Z.deathZone);
    const spikes = this.material(new MeshBasicMaterial({ color: PALETTE.neonMagenta }));
    const crusher = this.material(new MeshStandardMaterial({ color: 0xaa2222, roughness: 0.6 }));
    for (const h of level.hazards) {
      if (h.kind === 'spikes') {
        this.plane(h, glow(PALETTE.neonMagenta, 0.3), ZONE_Z.spikes);
        this.box({ x: h.x, y: h.y + h.h - 3, w: h.w, h: 3 }, spikes, 0.4, ZONE_Z.spikes);
      } else this.box(h, crusher, 1, 0);
    }
  }

  private greyBox(level: LevelJson): void {
    const solid = this.material(new MeshStandardMaterial({ color: PALETTE.concreteGrey, roughness: 0.9 }));
    const oneWay = this.material(new MeshStandardMaterial({ color: PALETTE.rustOrange, roughness: 0.8 }));
    const spawn = this.material(new MeshBasicMaterial({ color: PALETTE.warmAmber, transparent: true, opacity: 0.6 }));
    for (const r of level.solids) this.box(r, solid, SOLID_DEPTH, SOLID_Z);
    for (const r of level.oneWay) this.box(r, oneWay, SOLID_DEPTH * 0.6, SOLID_Z);
    for (const e of level.enemies) this.plane(spawnBox(e), spawn, ZONE_Z.spawn);

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

  private diorama(level: LevelJson, art: LevelArtAssets): void {
    const spec = level.art!;
    for (const slot of BACKDROP_SLOTS) {
      const tex = art.backdrops.get(slot);
      if (tex) this.backdrop(slot, tex, level);
    }
    const props = this.material(atlasMaterial(art.props.texture));
    for (const d of spec.decor) {
      const q = new SpriteQuad(art.props, props, d.prop);
      const size: { w?: number; h?: number } = {};
      if (d.w !== undefined) size.w = d.w;
      if (d.h !== undefined) size.h = d.h;
      q.place(d.x, d.y, DECOR_Z[d.layer ?? 'prop'], { flip: d.flip ?? false, size });
      this.group.add(q.mesh);
    }
  }

  private backdrop(slot: BackdropSlot, tex: Texture, level: LevelJson): void {
    const img = tex.image as { width: number; height: number };
    const p = backdropPlacement(slot, { width: level.width, height: level.height, floorY: level.spawn.y }, img.width / img.height);
    tex.wrapS = p.mirrored ? MirroredRepeatWrapping : RepeatWrapping;
    tex.repeat.set(p.repeatX, 1);
    tex.needsUpdate = true;
    // Same recipe as the sprites: a layer may have cut-out sky (the town does), and the Z order is fixed anyway.
    const m = this.material(new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.02 }));
    const mesh = new Mesh(new PlaneGeometry(p.w, p.h), m);
    mesh.position.set(p.x, p.y, p.z);
    this.group.add(mesh);
  }

  /** Wireframe boxes for every collider and the zones' bounds, in the debug palette. */
  private colliderOutlines(level: LevelJson): void {
    const line = (color: number): LineBasicMaterial => this.material(new LineBasicMaterial({ color }));
    const solid = line(0x40ff80);
    const oneWay = line(PALETTE.rustOrange);
    const hazard = line(PALETTE.neonMagenta);
    const zone = line(PALETTE.neonCyan);
    const outline = (r: Rect, m: LineBasicMaterial, z: number): void => {
      const geo = new EdgesGeometry(new BoxGeometry(toUnits(r.w), toUnits(r.h), 0.01));
      const seg = new LineSegments(geo, m);
      const c = rectCenter(r);
      seg.position.set(c.x, c.y, z);
      this.outlines.add(seg);
    };
    for (const r of level.solids) outline(r, solid, OUTLINE_Z);
    for (const r of level.oneWay) outline(r, oneWay, OUTLINE_Z);
    for (const r of level.hazards) outline(r, hazard, OUTLINE_Z);
    for (const r of level.deathZones) outline(r, hazard, OUTLINE_Z);
    for (const r of level.checkpoints) outline(r, zone, OUTLINE_Z);
    outline(level.exit, zone, OUTLINE_Z);
    for (const e of level.enemies) outline(spawnBox(e), zone, OUTLINE_Z);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    this.group.removeFromParent();
  }
}
