import {
  AdditiveBlending,
  BoxGeometry,
  ClampToEdgeWrapping,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  type BufferAttribute,
  type Material,
  type Texture,
} from 'three';
import type { LevelJson, Rect } from '@content/level';
import { CAMERA } from '@game/tuning';
import type { BackdropMeta } from './backdrop-meta';
import { decorBatches } from './batches';
import { BACKDROP_SLOTS, type BackdropSlot, type DecorJson, type DecorLayer } from '@content/level-art';
import type { LevelArtAssets } from './assets';
import { backdropContentBand, backdropPlacement, backdropTiles, layerViewWidth } from './diorama';
import { atlasMaterial } from './sprite';
import { framePlacement, frameUv } from './sprite-layout';
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
      const layer = art.backdrops.get(slot);
      if (layer) this.backdrop(slot, layer.texture, layer.meta, level);
    }
    this.decor(art, spec.decor);
  }

  /**
   * Static props are one instanced draw per (layer, chunk, frame, flip).
   * A chunk is one view wide, so a long level does not submit every crate on
   * every frame. Dynamic sprites stay as single quads: a handful of them
   * change frame every tick, and instancing that just rebuilds a buffer.
   */
  private decor(art: LevelArtAssets, decor: readonly DecorJson[]): void {
    const props = this.material(atlasMaterial(art.props.texture));
    const dummy = new Object3D();
    const batches = decorBatches(decor, CAMERA.viewW, CAMERA.viewH);
    for (const batch of batches) {
      const frame = art.props.json.frames[batch.prop];
      if (!frame) throw new Error(`prop atlas has no frame "${batch.prop}"`);
      const geo = new PlaneGeometry(1, 1);
      const uv = frameUv(frame, art.props.json.width, art.props.json.height);
      const u0 = batch.flip ? uv.u1 : uv.u0;
      const u1 = batch.flip ? uv.u0 : uv.u1;
      const attr = geo.getAttribute('uv') as BufferAttribute;
      attr.setXY(0, u0, uv.v1);
      attr.setXY(1, u1, uv.v1);
      attr.setXY(2, u0, uv.v0);
      attr.setXY(3, u1, uv.v0);
      const mesh = new InstancedMesh(geo, props, batch.instances.length);
      const z = DECOR_Z[batch.layer];
      batch.instances.forEach((inst, i) => {
        const size: { w?: number; h?: number } = {};
        if (inst.w !== undefined) size.w = inst.w;
        if (inst.h !== undefined) size.h = inst.h;
        const p = framePlacement(frame, { x: inst.x, y: inst.y }, { flip: inst.flip, size });
        dummy.position.set(p.cx, p.cy, z);
        dummy.scale.set(Math.abs(p.sx), p.sy, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  private backdrop(slot: BackdropSlot, tex: Texture, meta: BackdropMeta, level: LevelJson): void {
    const p = backdropPlacement(slot, { width: level.width, height: level.height, floorY: level.spawn.y }, meta.width / meta.height);
    const band = backdropContentBand(p, meta.height, meta.content.y, meta.content.h);
    const tiles = backdropTiles(p, layerViewWidth(p.z), band);
    if (tiles.length === 0) return;
    tex.wrapS = p.mirrored ? MirroredRepeatWrapping : RepeatWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    tex.needsUpdate = true;
    // Opaque layers (the far sky) skip the blend and the alpha test. The mid
    // layer keeps both: its roofs are cut out against the sky.
    const m = this.material(
      meta.opaque
        ? new MeshBasicMaterial({ map: tex, depthWrite: true })
        : new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.02 }),
    );
    for (const t of tiles) {
      const geo = new PlaneGeometry(t.w, t.h);
      const attr = geo.getAttribute('uv') as BufferAttribute;
      const u0 = t.offsetX;
      const u1 = t.offsetX + t.repeatX;
      const v0 = t.offsetY;
      const v1 = t.offsetY + t.repeatY;
      attr.setXY(0, u0, v1);
      attr.setXY(1, u1, v1);
      attr.setXY(2, u0, v0);
      attr.setXY(3, u1, v0);
      const mesh = new Mesh(geo, m);
      mesh.position.set(t.x, t.y, p.z);
      this.group.add(mesh);
    }
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
