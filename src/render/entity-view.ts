import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
  type Object3D,
} from 'three';
import type { AtlasJson } from '@content/atlas';
import type { EnemyType, PickupKind, Rect } from '@content/level';
import type { EnemyPose } from '@game/enemies';
import { ENEMY, PROJECTILE } from '@game/tuning';
import type { BossSnapshot, EnemySnapshot, PickupSnapshot, PlayerSnapshot, ProjectileKind, ProjectileSnapshot, SolidSnapshot, WorldSnapshot } from '@game/world';
import { ClipAnimator, clipFrameIndex, enemyClips, PlayerAnimator, playerClips, type Clip } from './animator';
import { ENEMY_LOOK, type GameAssets, type LoadedAtlas } from './assets';
import { chargeGlowScale, enemyHurtTint, invulnOpacity, pickupBob, PRESENTATION, weakPointDiamond, weakPointLook, type WeakPointCue } from './motion';
import { atlasMaterial, SpriteQuad } from './sprite';
import { PALETTE } from './stage';
import { toUnits } from './units';

/** Z of the player quad: in front of props, behind 'front' decor. */
const PLAYER_Z = 0.3;
/** Enemies stand just behind the player so an overlap reads as the player in front. */
const ENEMY_Z = 0.2;
/** Shots pass in front of everyone. */
const ORB_Z = PLAYER_Z + 0.1;
/** The boss core glow sits on the boss quad. */
const CORE_Z = ENEMY_Z + 0.05;
/** A mover's prop sits just behind the gameplay plane like the static props. */
const MOVER_PROP_Z = -0.2;
/** Depth of the grey mover box (no prop) and of the flat outline boxes. */
const MOVER_BOX_DEPTH = 1.2;
const OUTLINE_DEPTH = 0.05;
/** The orb frame is a large glow; scale it per shot kind around the projectile's collider. Enemy shots use their sheet's clip. */
const SHOT_SCALE: Readonly<Record<ProjectileKind, number>> = { plasma: 0.4, nova: 0.9, enemy: 0.6 };
/** Animation in the batoman atlas whose first frame is the plasma shot; enemy sheets have their own `projectile` clip. */
const ORB_ANIMATION = 'orb';
const ENEMY_SHOT_ANIMATION = 'projectile';
/** The nova is drawn white-hot; plasma keeps the sheet's cyan. */
const NOVA_TINT = 0xfffde0;
/** Pickup quads sit in front of the player. The bob is visual only; the hitbox does not move. */
const PICKUP_Z = 0.45;

/** Colour per kind. A new kind (invincibility) adds a case here and nothing else in the loop. */
function pickupColor(kind: PickupKind): number {
  switch (kind) {
    case 'hp-up':
      return PALETTE.neonMagenta;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/** Fill is a shape; the ring is a line loop of the same diamond, slightly larger. Both come from `weakPointDiamond`. */
function diamondGeometry(which: 'fill' | 'ring'): BufferGeometry {
  const pts = weakPointDiamond(which);
  if (which === 'ring') return new BufferGeometry().setFromPoints(pts.map(([x, y]) => new Vector3(x, y, 0)));
  const shape = new Shape();
  const [first, ...rest] = pts;
  shape.moveTo(first![0], first![1]);
  for (const [x, y] of rest) shape.lineTo(x, y);
  shape.closePath();
  return new ShapeGeometry(shape);
}

interface MoverView {
  readonly obj: Object3D;
  readonly outline: Object3D;
  /** Null when the mover has no prop and is drawn as a lit box. */
  readonly quad: SpriteQuad | null;
}

interface EnemyView {
  readonly type: EnemyType;
  readonly quad: SpriteQuad;
  /** Own material: alpha (cloak) and tint (flash, boss) are per enemy. */
  readonly material: MeshBasicMaterial;
  readonly animator: ClipAnimator<EnemyPose>;
  readonly outline: LineSegments;
}

interface ShotView {
  readonly kind: ProjectileKind;
  readonly quad: SpriteQuad;
}

interface PickupView {
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** First frame of a named animation; frames themselves are named by the packer (r<row>f<index>). */
function firstFrame(atlas: AtlasJson, animation: string): string {
  const f = atlas.animations[animation]?.frames[0];
  if (!f) throw new Error(`atlas has no animation "${animation}"`);
  return f;
}

/**
 * Mirrors dynamic sim entities as billboards keyed by id, so a quad lives
 * exactly as long as its entity. Positions are interpolated between the
 * previous and current snapshot; animation time comes from the sim tick.
 * Views of departed enemies and shots go back to per-sheet free lists.
 * Nothing here reads the World.
 */
export class EntityView {
  readonly group = new Group();
  private readonly player: SpriteQuad;
  private readonly playerMaterial: MeshBasicMaterial;
  private readonly animator: PlayerAnimator;
  private readonly orbMaterial: MeshBasicMaterial;
  private readonly novaMaterial: MeshBasicMaterial;
  private readonly orbFrame: string;
  private readonly chargeGlow: SpriteQuad;
  private readonly enemyShot: { atlas: LoadedAtlas; material: MeshBasicMaterial; clip: Clip } | null;
  private readonly propMaterial: MeshBasicMaterial | null;
  private readonly projectiles = new Map<number, ShotView>();
  private readonly shotPool: ShotView[] = [];
  private readonly enemies = new Map<number, EnemyView>();
  private readonly enemyPool = new Map<EnemyType, EnemyView[]>();
  private readonly core: Group;
  private readonly coreFill: Mesh;
  private readonly coreFillMaterial: MeshBasicMaterial;
  private readonly coreRing: LineLoop;
  private readonly coreRingMaterial: LineBasicMaterial;
  /** Last cue `presentCore` applied. Null when the core is hidden. The hook reads this, not a hardcoded flag. */
  private weakPointCueState: WeakPointCue | null = null;
  private reduceMotion = false;
  private readonly movers = new Map<number, MoverView>();
  private readonly pickups = new Map<number, PickupView>();
  private readonly unitBox = new BoxGeometry(1, 1, 1);
  private readonly moverMaterial = new MeshStandardMaterial({ color: PALETTE.rustOrange, roughness: 0.7 });
  private readonly outlineGeometry = new EdgesGeometry(new BoxGeometry(1, 1, 1));
  private readonly outlineMaterial = new LineBasicMaterial({ color: 0x40ff80 });
  private readonly enemyOutlineMaterial = new LineBasicMaterial({ color: 0xff8080 });
  private readonly playerOutline: LineSegments;
  private outlines = false;

  constructor(private readonly assets: GameAssets) {
    this.playerMaterial = atlasMaterial(assets.batoman.texture);
    this.player = new SpriteQuad(assets.batoman, this.playerMaterial, firstFrame(assets.batoman.json, 'idle'));
    this.animator = new PlayerAnimator(playerClips(assets.batoman.json));
    this.orbFrame = firstFrame(assets.batoman.json, ORB_ANIMATION);
    this.orbMaterial = atlasMaterial(assets.batoman.texture);
    this.orbMaterial.blending = AdditiveBlending;
    this.novaMaterial = atlasMaterial(assets.batoman.texture);
    this.novaMaterial.blending = AdditiveBlending;
    this.novaMaterial.color.setHex(NOVA_TINT);
    this.chargeGlow = new SpriteQuad(assets.batoman, this.orbMaterial, this.orbFrame);
    this.chargeGlow.mesh.visible = false;
    this.enemyShot = this.enemyShotSource();
    this.propMaterial = assets.levelArt ? atlasMaterial(assets.levelArt.props.texture) : null;
    // Magenta diamond plus a white outline. The outline is the non-colour channel; geometry is `weakPointDiamond` only.
    this.coreFillMaterial = new MeshBasicMaterial({
      color: PALETTE.neonMagenta,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.coreFill = new Mesh(diamondGeometry('fill'), this.coreFillMaterial);
    this.coreRingMaterial = new LineBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    this.coreRing = new LineLoop(diamondGeometry('ring'), this.coreRingMaterial);
    this.coreRing.position.z = 0.02;
    this.core = new Group();
    this.core.name = 'weak-point';
    this.core.add(this.coreFill, this.coreRing);
    this.core.visible = false;
    // The player's collider outline is a sibling, not a child: the quad's scale is the art size, not the hitbox.
    this.playerOutline = this.outline(this.outlineMaterial);
    this.group.add(this.player.mesh, this.playerOutline, this.chargeGlow.mesh, this.core);
  }

  /** Enemy shots use the first loaded enemy sheet that has a projectile clip (the sheets share the look). */
  private enemyShotSource(): EntityView['enemyShot'] {
    for (const atlas of this.assets.enemies.values()) {
      const clip = atlas.json.animations[ENEMY_SHOT_ANIMATION];
      if (clip) {
        const material = atlasMaterial(atlas.texture);
        material.blending = AdditiveBlending;
        return { atlas, material, clip };
      }
    }
    return null;
  }

  private outline(material: LineBasicMaterial): LineSegments {
    const o = new LineSegments(this.outlineGeometry, material);
    o.visible = this.outlines;
    o.name = 'outline';
    return o;
  }

  /** Presentation policy. Does not change what the sim simulated. */
  setReduceMotion(on: boolean): void {
    this.reduceMotion = on;
  }

  /** Cue drawn for the exposed core, or null when it is hidden. */
  get weakPointCue(): WeakPointCue | null {
    return this.weakPointCueState;
  }

  /** Show collision boxes (debug overlay). */
  setOutlines(on: boolean): void {
    this.outlines = on;
    this.group.traverse((o) => {
      if (o.name === 'outline') o.visible = on;
    });
  }

  present(prev: WorldSnapshot, cur: WorldSnapshot, alpha: number): void {
    this.presentPlayer(prev.player, cur.player, cur.tick, alpha);
    this.syncEnemies(prev.enemies, cur.enemies, cur.tick, alpha);
    this.presentCore(prev.boss, cur.boss, cur.tick, alpha);
    this.syncProjectiles(prev.projectiles, cur.projectiles, cur.tick, alpha);
    this.syncMovers(prev.movingSolids, cur.movingSolids, alpha);
    this.syncPickups(cur.pickups, cur.tick);
  }

  private presentPlayer(a: PlayerSnapshot, b: PlayerSnapshot, tick: number, alpha: number): void {
    const x = lerp(a.x, b.x, alpha);
    const y = lerp(a.y, b.y, alpha);
    this.player.setFrame(this.animator.frameAt(b.pose, b.shooting, tick));
    this.player.place(x + b.w / 2, y, PLAYER_Z, { flip: b.facing < 0 });
    // Blink while invulnerable; flash magenta while hurt or dead (the dead clip holds the hurt frame until respawn).
    this.playerMaterial.opacity = invulnOpacity(b.invulnerable, tick, this.reduceMotion);
    this.playerMaterial.color.setHex(b.pose === 'hurt' || b.pose === 'dead' ? PALETTE.neonMagenta : 0xffffff);
    this.placeOutline(this.playerOutline, { x, y, w: b.w, h: b.h }, PLAYER_Z);
    // Charge glow grows at the muzzle while fire is held. The pulse is decorative and drops out under reduce-motion.
    this.chargeGlow.mesh.visible = b.charge > 0;
    if (b.charge > 0) {
      const muzzleX = x + b.w / 2 + b.facing * (b.w / 2 + PRESENTATION.charge.offsetX);
      this.chargeGlow.place(muzzleX, y + PROJECTILE.muzzleY, ORB_Z, { scale: chargeGlowScale(b.charge, tick, this.reduceMotion) });
    }
  }

  private placeOutline(o: Object3D, r: Rect, z: number): void {
    o.position.set(toUnits(r.x + r.w / 2), toUnits(r.y + r.h / 2), z);
    o.scale.set(toUnits(r.w), toUnits(r.h), OUTLINE_DEPTH);
  }

  // ---- Enemies ---------------------------------------------------------------

  private syncEnemies(prev: readonly EnemySnapshot[], cur: readonly EnemySnapshot[], tick: number, alpha: number): void {
    const seen = new Set<number>();
    for (const c of cur) {
      seen.add(c.id);
      let v = this.enemies.get(c.id);
      if (!v) {
        const fresh = this.takeEnemyView(c.type);
        if (!fresh) continue; // this level did not load a sheet for the type
        v = fresh;
        this.enemies.set(c.id, v);
      }
      const p = prev.find((e) => e.id === c.id) ?? c;
      const x = lerp(p.x, c.x, alpha);
      const y = lerp(p.y, c.y, alpha);
      const look = ENEMY_LOOK[c.type];
      v.quad.setFrame(v.animator.frameAt(c.pose, tick));
      const pivotY = look.pivot === 'centre' ? y + c.h / 2 : y;
      const flip = look.faces === 'right' ? c.facing < 0 : c.facing > 0;
      // The tikbalang's lunge drops the body to `lungeHeight`. Fit the quad to that
      // live height (feet stay on the pivot) so a jump that clears the hurtbox
      // also clears the sprite. Every other pose keeps the sheet's own scale.
      const h = lerp(p.h, c.h, alpha);
      const lunging = c.type === 'tikbalang' && h < ENEMY.tikbalang.height;
      v.quad.place(x + c.w / 2, pivotY, ENEMY_Z, lunging ? { flip, size: { h } } : { flip, scale: look.scale });
      v.material.color.setHex(enemyHurtTint(c.flash > 0, tick, this.reduceMotion, look.tint, PALETTE.neonMagenta));
      v.material.opacity = c.alpha;
      this.placeOutline(v.outline, { x, y, w: c.w, h: c.h }, ENEMY_Z);
    }
    for (const [id, v] of this.enemies) {
      if (!seen.has(id)) {
        this.enemies.delete(id);
        this.releaseEnemyView(v);
      }
    }
  }

  /** A view from the type's free list, or a fresh one (own material so alpha and tint are per enemy). */
  private takeEnemyView(type: EnemyType): EnemyView | null {
    const pooled = this.enemyPool.get(type)?.pop();
    if (pooled) {
      pooled.quad.mesh.visible = true;
      pooled.outline.visible = this.outlines;
      return pooled;
    }
    const look = ENEMY_LOOK[type];
    const atlas = this.assets.enemies.get(look.atlas);
    if (!atlas) return null;
    const material = atlasMaterial(atlas.texture);
    const clips = enemyClips(atlas.json, look);
    const quad = new SpriteQuad(atlas, material, clips.idle.frames[0]!);
    const outline = this.outline(this.enemyOutlineMaterial);
    this.group.add(quad.mesh, outline);
    return { type, quad, material, animator: new ClipAnimator<EnemyPose>(clips, 'idle'), outline };
  }

  private releaseEnemyView(v: EnemyView): void {
    v.quad.mesh.visible = false;
    v.outline.visible = false;
    const list = this.enemyPool.get(v.type) ?? [];
    list.push(v);
    this.enemyPool.set(v.type, list);
  }

  /**
   * The boss's weak point: a magenta diamond with a white outline, shown only
   * while the double-damage window is open. The outline does not pulse. Reduce-motion
   * holds the fill steady so the shape cue remains without a brightness throb.
   */
  private presentCore(prev: BossSnapshot | null, cur: BossSnapshot | null, tick: number, alpha: number): void {
    const show = cur !== null && cur.exposed && cur.hp > 0;
    this.core.visible = show;
    if (!show || !cur) {
      this.weakPointCueState = null;
      return;
    }
    const look = weakPointLook(tick, this.reduceMotion);
    this.weakPointCueState = { shape: look.shape, ring: look.ring, pulsing: look.pulsing };
    const p = prev ?? cur;
    const r = cur.weakPoint;
    const x = lerp(p.weakPoint.x, r.x, alpha) + r.w / 2;
    const y = lerp(p.weakPoint.y, r.y, alpha) + r.h / 2;
    this.coreFillMaterial.opacity = look.fillOpacity;
    this.coreFill.scale.set(look.fillScale, look.fillScale, 1);
    this.core.position.set(toUnits(x), toUnits(y), CORE_Z);
    const s = (toUnits(r.h) / 2) * PRESENTATION.weakPoint.scale;
    this.core.scale.set(s, s, 1);
  }

  // ---- Projectiles -----------------------------------------------------------

  private syncProjectiles(prev: readonly ProjectileSnapshot[], cur: readonly ProjectileSnapshot[], tick: number, alpha: number): void {
    const seen = new Set<number>();
    for (const c of cur) {
      seen.add(c.id);
      let v = this.projectiles.get(c.id);
      if (!v) {
        const fresh = this.takeShotView(c.kind);
        if (!fresh) continue;
        v = fresh;
        this.projectiles.set(c.id, v);
      }
      const p = prev.find((e) => e.id === c.id) ?? c;
      // Projectile x, y is the centre; the orb and projectile frames pivot at their centre too.
      const x = lerp(p.x, c.x, alpha);
      const y = lerp(p.y, c.y, alpha);
      if (c.kind === 'enemy') {
        const clip = this.enemyShot!.clip;
        v.quad.setFrame(clip.frames[clipFrameIndex(clip, tick)]!);
      }
      v.quad.place(x, y, ORB_Z, { scale: SHOT_SCALE[c.kind], flip: c.dir < 0 });
    }
    for (const [id, v] of this.projectiles) {
      if (!seen.has(id)) {
        this.projectiles.delete(id);
        v.quad.mesh.visible = false;
        this.shotPool.push(v);
      }
    }
  }

  private takeShotView(kind: ProjectileKind): ShotView | null {
    const i = this.shotPool.findIndex((s) => s.kind === kind);
    if (i >= 0) {
      const v = this.shotPool.splice(i, 1)[0]!;
      v.quad.mesh.visible = true;
      return v;
    }
    let quad: SpriteQuad;
    if (kind === 'enemy') {
      if (!this.enemyShot) return null;
      quad = new SpriteQuad(this.enemyShot.atlas, this.enemyShot.material, this.enemyShot.clip.frames[0]!);
    } else quad = new SpriteQuad(this.assets.batoman, kind === 'nova' ? this.novaMaterial : this.orbMaterial, this.orbFrame);
    this.group.add(quad.mesh);
    return { kind, quad };
  }

  // ---- Movers ----------------------------------------------------------------

  private syncMovers(prev: readonly SolidSnapshot[], cur: readonly SolidSnapshot[], alpha: number): void {
    const seen = new Set<number>();
    for (const c of cur) {
      seen.add(c.id);
      let m = this.movers.get(c.id);
      if (!m) {
        m = this.makeMover(c);
        this.movers.set(c.id, m);
        this.group.add(m.obj);
      }
      const p = prev.find((e) => e.id === c.id) ?? c;
      const r = { x: lerp(p.x, c.x, alpha), y: lerp(p.y, c.y, alpha), w: c.w, h: c.h };
      if (m.quad) {
        // Stretch the prop to the collider's width, keep its aspect, and hang it from the collider's top edge.
        const natural = m.quad.naturalSize;
        const artH = (r.w * natural.h) / natural.w;
        m.quad.place(r.x + r.w / 2, r.y + r.h - artH, MOVER_PROP_Z, { size: { w: r.w } });
        this.placeOutline(m.outline, r, 0);
      } else {
        m.obj.position.set(toUnits(r.x + r.w / 2), toUnits(r.y + r.h / 2), 0);
        m.obj.scale.set(toUnits(r.w), toUnits(r.h), MOVER_BOX_DEPTH);
      }
    }
    for (const [id, m] of this.movers) {
      if (!seen.has(id)) {
        m.quad?.dispose();
        m.obj.removeFromParent();
        this.movers.delete(id);
      }
    }
  }

  /** A prop quad (with a free-standing outline) when the level names one and its atlas is loaded; a grey box otherwise. */
  private makeMover(s: SolidSnapshot): MoverView {
    const art = this.assets.levelArt;
    const outline = this.outline(this.outlineMaterial);
    if (s.prop && art && this.propMaterial && s.prop in art.props.json.frames) {
      const quad = new SpriteQuad(art.props, this.propMaterial, s.prop);
      const obj = new Group();
      obj.add(outline, quad.mesh);
      return { obj, outline, quad };
    }
    // The box outline is a child so the parent's scale sizes it.
    const mesh = new Mesh(this.unitBox, this.moverMaterial);
    mesh.add(outline);
    return { obj: mesh, outline, quad: null };
  }

  /** Unlit placeholder quads. Collected pickups leave the snapshot, so the mesh goes with them. */
  private syncPickups(cur: readonly PickupSnapshot[], tick: number): void {
    const seen = new Set<number>();
    const bob = pickupBob(tick, this.reduceMotion);
    for (const p of cur) {
      seen.add(p.id);
      let v = this.pickups.get(p.id);
      if (!v) {
        const material = new MeshBasicMaterial({ color: pickupColor(p.kind) });
        const mesh = new Mesh(this.unitBox, material);
        this.group.add(mesh);
        v = { mesh, material };
        this.pickups.set(p.id, v);
      }
      v.mesh.position.set(toUnits(p.x + p.w / 2), toUnits(p.y + p.h / 2 + bob), PICKUP_Z);
      v.mesh.scale.set(toUnits(p.w), toUnits(p.h), toUnits(8));
    }
    for (const [id, v] of this.pickups) {
      if (seen.has(id)) continue;
      v.mesh.removeFromParent();
      v.material.dispose();
      this.pickups.delete(id);
    }
  }

  get entityCount(): number {
    return 1 + this.projectiles.size + this.enemies.size + this.movers.size + this.pickups.size;
  }

  dispose(): void {
    this.player.dispose();
    this.chargeGlow.dispose();
    for (const v of this.projectiles.values()) v.quad.dispose();
    for (const v of this.shotPool) v.quad.dispose();
    for (const v of this.enemies.values()) this.disposeEnemyView(v);
    for (const list of this.enemyPool.values()) for (const v of list) this.disposeEnemyView(v);
    for (const m of this.movers.values()) m.quad?.dispose();
    for (const p of this.pickups.values()) p.material.dispose();
    this.unitBox.dispose();
    this.outlineGeometry.dispose();
    this.outlineMaterial.dispose();
    this.enemyOutlineMaterial.dispose();
    this.playerMaterial.dispose();
    this.orbMaterial.dispose();
    this.novaMaterial.dispose();
    this.coreFill.geometry.dispose();
    this.coreFillMaterial.dispose();
    this.coreRing.geometry.dispose();
    this.coreRingMaterial.dispose();
    this.enemyShot?.material.dispose();
    this.propMaterial?.dispose();
    this.moverMaterial.dispose();
    this.group.removeFromParent();
  }

  private disposeEnemyView(v: EnemyView): void {
    v.quad.dispose();
    v.material.dispose();
    v.outline.removeFromParent();
  }
}
