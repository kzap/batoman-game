import type { MeshBasicMaterial } from 'three';
import { AdditiveBlending, BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { AtlasJson } from '@content/atlas';
import type { EnemyType, Rect } from '@content/level';
import type { EnemyPose } from '@game/enemies';
import { PROJECTILE } from '@game/tuning';
import type { BossSnapshot, EnemySnapshot, PlayerSnapshot, ProjectileKind, ProjectileSnapshot, SolidSnapshot, WorldSnapshot } from '@game/world';
import { ClipAnimator, clipFrameIndex, enemyClips, PlayerAnimator, playerClips, type Clip } from './animator';
import { ENEMY_LOOK, type GameAssets, type LoadedAtlas } from './assets';
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
/** Invulnerability blink: on for this many ticks, off for as many. */
const BLINK_HALF_PERIOD_TICKS = 6;
/** Hurt flash alternates tint every this many ticks. */
const FLASH_HALF_PERIOD_TICKS = 3;
/** Charge glow at the muzzle: orb scale at empty and full charge, its pulse, and how far past the body it sits. */
const CHARGE_GLOW = { min: 0.15, max: 0.7, pulse: 0.1, pulsePeriodTicks: 12, offsetX: 6 } as const;
/** The nova is drawn white-hot; plasma keeps the sheet's cyan. */
const NOVA_TINT = 0xfffde0;
/** The boss core glow: shown only while the double-damage window is open, pulsing. */
const CORE = { pulseTicks: 20, opacity: 0.55, pulse: 0.25, scale: 1.6 } as const;

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
  private readonly core: Mesh;
  private readonly coreMaterial: MeshBasicMaterial;
  private readonly movers = new Map<number, MoverView>();
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
    this.coreMaterial = atlasMaterial(assets.batoman.texture);
    this.coreMaterial.blending = AdditiveBlending;
    this.coreMaterial.color.setHex(PALETTE.neonMagenta);
    const core = new SpriteQuad(assets.batoman, this.coreMaterial, this.orbFrame);
    this.core = core.mesh;
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
  }

  private presentPlayer(a: PlayerSnapshot, b: PlayerSnapshot, tick: number, alpha: number): void {
    const x = lerp(a.x, b.x, alpha);
    const y = lerp(a.y, b.y, alpha);
    this.player.setFrame(this.animator.frameAt(b.pose, b.shooting, tick));
    this.player.place(x + b.w / 2, y, PLAYER_Z, { flip: b.facing < 0 });
    // Blink while invulnerable; flash magenta while hurt or dead (the dead clip holds the hurt frame until respawn).
    const blink = b.invulnerable && Math.floor(tick / BLINK_HALF_PERIOD_TICKS) % 2 === 0;
    this.playerMaterial.opacity = blink ? 0.45 : 1;
    this.playerMaterial.color.setHex(b.pose === 'hurt' || b.pose === 'dead' ? PALETTE.neonMagenta : 0xffffff);
    this.placeOutline(this.playerOutline, { x, y, w: b.w, h: b.h }, PLAYER_Z);
    // Charge glow grows at the muzzle while fire is held.
    this.chargeGlow.mesh.visible = b.charge > 0;
    if (b.charge > 0) {
      const muzzleX = x + b.w / 2 + b.facing * (b.w / 2 + CHARGE_GLOW.offsetX);
      const pulse = 1 + CHARGE_GLOW.pulse * Math.sin((tick / CHARGE_GLOW.pulsePeriodTicks) * Math.PI * 2);
      this.chargeGlow.place(muzzleX, y + PROJECTILE.muzzleY, ORB_Z, { scale: (CHARGE_GLOW.min + (CHARGE_GLOW.max - CHARGE_GLOW.min) * b.charge) * pulse });
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
        if (!fresh) continue; // no sheet loaded for this type (tikbalang spawn data)
        v = fresh;
        this.enemies.set(c.id, v);
      }
      const p = prev.find((e) => e.id === c.id) ?? c;
      const x = lerp(p.x, c.x, alpha);
      const y = lerp(p.y, c.y, alpha);
      const look = ENEMY_LOOK[c.type];
      v.quad.setFrame(v.animator.frameAt(c.pose, tick));
      const pivotY = look.pivot === 'centre' ? y + c.h / 2 : y;
      v.quad.place(x + c.w / 2, pivotY, ENEMY_Z, { flip: c.facing > 0, scale: look.scale });
      const flashing = c.flash > 0 && Math.floor(tick / FLASH_HALF_PERIOD_TICKS) % 2 === 0;
      v.material.color.setHex(flashing ? PALETTE.neonMagenta : look.tint);
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

  /** The boss's weak-point core: a pulsing magenta glow shown only while the double-damage window is open. */
  private presentCore(prev: BossSnapshot | null, cur: BossSnapshot | null, tick: number, alpha: number): void {
    this.core.visible = cur !== null && cur.exposed && cur.hp > 0;
    if (!this.core.visible || !cur) return;
    const p = prev ?? cur;
    const r = cur.weakPoint;
    const x = lerp(p.weakPoint.x, r.x, alpha) + r.w / 2;
    const y = lerp(p.weakPoint.y, r.y, alpha) + r.h / 2;
    this.coreMaterial.opacity = CORE.opacity + CORE.pulse * Math.sin((tick / CORE.pulseTicks) * Math.PI * 2);
    this.core.position.set(toUnits(x), toUnits(y), CORE_Z);
    const s = (toUnits(r.h) / 2) * CORE.scale;
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

  get entityCount(): number {
    return 1 + this.projectiles.size + this.enemies.size + this.movers.size;
  }

  dispose(): void {
    this.player.dispose();
    this.chargeGlow.dispose();
    for (const v of this.projectiles.values()) v.quad.dispose();
    for (const v of this.shotPool) v.quad.dispose();
    for (const v of this.enemies.values()) this.disposeEnemyView(v);
    for (const list of this.enemyPool.values()) for (const v of list) this.disposeEnemyView(v);
    for (const m of this.movers.values()) m.quad?.dispose();
    this.unitBox.dispose();
    this.outlineGeometry.dispose();
    this.outlineMaterial.dispose();
    this.enemyOutlineMaterial.dispose();
    this.playerMaterial.dispose();
    this.orbMaterial.dispose();
    this.novaMaterial.dispose();
    this.coreMaterial.dispose();
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
