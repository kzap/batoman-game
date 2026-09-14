import type { MeshBasicMaterial} from 'three';
import { AdditiveBlending, BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { AtlasJson } from '@content/atlas';
import type { Rect } from '@content/level';
import type { PlayerSnapshot, ProjectileSnapshot, SolidSnapshot, WorldSnapshot } from '@game/world';
import { PlayerAnimator, playerClips } from './animator';
import type { GameAssets } from './assets';
import { atlasMaterial, SpriteQuad } from './sprite';
import { PALETTE } from './stage';
import { toUnits } from './units';

/** Z of the player quad: in front of props, behind 'front' decor. */
const PLAYER_Z = 0.3;
/** Shots pass in front of the player. */
const ORB_Z = PLAYER_Z + 0.1;
/** A mover's prop sits just behind the gameplay plane like the static props. */
const MOVER_PROP_Z = -0.2;
/** Depth of the grey mover box (no prop) and of the flat outline boxes. */
const MOVER_BOX_DEPTH = 1.2;
const OUTLINE_DEPTH = 0.05;
/** The orb frame is a large glow; shrink it to sit around the 12 px projectile. */
const ORB_SCALE = 0.4;
/** Animation in the batoman atlas whose first frame is the plasma shot. */
const ORB_ANIMATION = 'orb';
/** Invulnerability blink: on for this many ticks, off for as many. */
const BLINK_HALF_PERIOD_TICKS = 6;

interface MoverView {
  readonly obj: Object3D;
  readonly outline: Object3D;
  /** Null when the mover has no prop and is drawn as a lit box. */
  readonly quad: SpriteQuad | null;
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
 * Nothing here reads the World.
 */
export class EntityView {
  readonly group = new Group();
  private readonly player: SpriteQuad;
  private readonly playerMaterial: MeshBasicMaterial;
  private readonly animator: PlayerAnimator;
  private readonly orbMaterial: MeshBasicMaterial;
  private readonly orbFrame: string;
  private readonly propMaterial: MeshBasicMaterial | null;
  private readonly projectiles = new Map<number, SpriteQuad>();
  private readonly movers = new Map<number, MoverView>();
  private readonly unitBox = new BoxGeometry(1, 1, 1);
  private readonly moverMaterial = new MeshStandardMaterial({ color: PALETTE.rustOrange, roughness: 0.7 });
  private readonly outlineGeometry = new EdgesGeometry(new BoxGeometry(1, 1, 1));
  private readonly outlineMaterial = new LineBasicMaterial({ color: 0x40ff80 });
  private readonly playerOutline: LineSegments;
  private outlines = false;

  constructor(private readonly assets: GameAssets) {
    this.playerMaterial = atlasMaterial(assets.batoman.texture);
    this.player = new SpriteQuad(assets.batoman, this.playerMaterial, firstFrame(assets.batoman.json, 'idle'));
    this.animator = new PlayerAnimator(playerClips(assets.batoman.json));
    this.orbFrame = firstFrame(assets.batoman.json, ORB_ANIMATION);
    this.orbMaterial = atlasMaterial(assets.batoman.texture);
    this.orbMaterial.blending = AdditiveBlending;
    this.propMaterial = assets.levelArt ? atlasMaterial(assets.levelArt.props.texture) : null;
    // The player's collider outline is a sibling, not a child: the quad's scale is the art size, not the hitbox.
    this.playerOutline = this.outline();
    this.group.add(this.player.mesh, this.playerOutline);
  }

  private outline(): LineSegments {
    const o = new LineSegments(this.outlineGeometry, this.outlineMaterial);
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
    this.syncProjectiles(prev.projectiles, cur.projectiles, alpha);
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
  }

  private placeOutline(o: Object3D, r: Rect, z: number): void {
    o.position.set(toUnits(r.x + r.w / 2), toUnits(r.y + r.h / 2), z);
    o.scale.set(toUnits(r.w), toUnits(r.h), OUTLINE_DEPTH);
  }

  private syncProjectiles(prev: readonly ProjectileSnapshot[], cur: readonly ProjectileSnapshot[], alpha: number): void {
    const seen = new Set<number>();
    for (const c of cur) {
      seen.add(c.id);
      let q = this.projectiles.get(c.id);
      if (!q) {
        q = new SpriteQuad(this.assets.batoman, this.orbMaterial, this.orbFrame);
        this.projectiles.set(c.id, q);
        this.group.add(q.mesh);
      }
      const p = prev.find((e) => e.id === c.id) ?? c;
      // Projectile x, y is the centre; the orb's pivot is its centre too.
      q.place(lerp(p.x, c.x, alpha), lerp(p.y, c.y, alpha), ORB_Z, { scale: ORB_SCALE, flip: c.dir < 0 });
    }
    for (const [id, q] of this.projectiles) {
      if (!seen.has(id)) {
        q.dispose();
        this.projectiles.delete(id);
      }
    }
  }

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
    const outline = this.outline();
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
    return 1 + this.projectiles.size + this.movers.size;
  }

  dispose(): void {
    this.player.dispose();
    for (const q of this.projectiles.values()) q.dispose();
    for (const m of this.movers.values()) m.quad?.dispose();
    this.unitBox.dispose();
    this.outlineGeometry.dispose();
    this.outlineMaterial.dispose();
    this.playerMaterial.dispose();
    this.orbMaterial.dispose();
    this.propMaterial?.dispose();
    this.moverMaterial.dispose();
    this.group.removeFromParent();
  }
}
