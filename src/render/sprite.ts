import type { BufferAttribute} from 'three';
import { Mesh, MeshBasicMaterial, PlaneGeometry, type Texture } from 'three';
import type { AtlasFrame, AtlasJson } from '@content/atlas';
import type { LoadedAtlas } from './assets';
import { framePlacement, frameUv } from './sprite-layout';
import { atlasToUnits } from './units';

/**
 * One material per atlas texture, shared by every quad cut from it. Unlit:
 * the painted art carries its own lighting, and the post stack adds the glow.
 */
export function atlasMaterial(texture: Texture): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: texture,
    transparent: true,
    // Hard-cut the fully transparent margin so quads behind sort cleanly; soft edges still blend.
    alphaTest: 0.02,
    depthWrite: false,
  });
}

/**
 * A textured quad showing one atlas frame, anchored by the frame's pivot.
 * The geometry is per-quad (its UVs change with the frame); the material is
 * shared by the atlas.
 */
export class SpriteQuad {
  readonly mesh: Mesh;
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly atlas: AtlasJson;
  private frame: AtlasFrame;
  private frameName: string;

  constructor(atlas: LoadedAtlas, material: MeshBasicMaterial, frame: string) {
    this.atlas = atlas.json;
    this.frame = requireFrame(this.atlas, frame);
    this.frameName = frame;
    this.mesh = new Mesh(this.geometry, material);
    this.applyUv();
  }

  get currentFrame(): string {
    return this.frameName;
  }

  setFrame(frame: string): void {
    if (frame === this.frameName) return;
    this.frame = requireFrame(this.atlas, frame);
    this.frameName = frame;
    this.applyUv();
  }

  /**
   * Put the pivot at a sim-pixel position. `size` overrides the rendered
   * size in sim px, stretching the frame (one missing side keeps the aspect);
   * `scale` multiplies the natural size; `flip` mirrors it to face left.
   */
  place(x: number, y: number, z: number, opts: { flip?: boolean; size?: { w?: number; h?: number }; scale?: number } = {}): void {
    const p = framePlacement(this.frame, { x, y }, opts);
    this.mesh.position.set(p.cx, p.cy, z);
    this.mesh.scale.set(p.sx, p.sy, 1);
  }

  /** Natural rendered size of the current frame in stage units. */
  get naturalSize(): { w: number; h: number } {
    return { w: atlasToUnits(this.frame.w), h: atlasToUnits(this.frame.h) };
  }

  private applyUv(): void {
    const uv = frameUv(this.frame, this.atlas.width, this.atlas.height);
    const attr = this.geometry.getAttribute('uv') as BufferAttribute;
    // PlaneGeometry vertex order: top-left, top-right, bottom-left, bottom-right.
    attr.setXY(0, uv.u0, uv.v1);
    attr.setXY(1, uv.u1, uv.v1);
    attr.setXY(2, uv.u0, uv.v0);
    attr.setXY(3, uv.u1, uv.v0);
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.mesh.removeFromParent();
  }
}

function requireFrame(atlas: AtlasJson, name: string): AtlasFrame {
  const f = atlas.frames[name];
  if (!f) throw new Error(`atlas has no frame "${name}"`);
  return f;
}
