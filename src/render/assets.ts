import { LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { atlasProblems, type AtlasJson } from '@content/atlas';
import type { EnemyType, LevelJson } from '@content/level';
import { parseBackdropMeta, type BackdropMeta } from './backdrop-meta';
import { isSoftwareRenderer, useCompressedBackdrops, type GpuTextureSupport } from './compression';

/** An atlas description together with its uploaded texture. */
export interface LoadedAtlas {
  readonly json: AtlasJson;
  readonly texture: Texture;
}

/** Everything the views need to dress one level; null layers mean grey-box. */
export interface BackdropLayerAssets {
  readonly texture: Texture;
  readonly meta: BackdropMeta;
}

export interface LevelArtAssets {
  readonly props: LoadedAtlas;
  /** Backdrop slot (`far` / `mid`) to texture and the packer's content box. */
  readonly backdrops: ReadonlyMap<string, BackdropLayerAssets>;
}

export interface GameAssets {
  readonly batoman: LoadedAtlas;
  /** Enemy sheets the level needs, by atlas name (see `ENEMY_ATLAS`). */
  readonly enemies: ReadonlyMap<string, LoadedAtlas>;
  readonly levelArt: LevelArtAssets | null;
}

/**
 * How an enemy type is drawn: which sheet, how big, what tint, where its frames
 * pivot, which way the painted frames face, and which clips play its poses.
 */
export interface EnemyLook {
  readonly atlas: string;
  readonly scale: number;
  readonly tint: number;
  readonly pivot: 'feet' | 'centre';
  /** Which way the sheet's frames face unflipped; the view mirrors them to match the sim's facing. */
  readonly faces: 'left' | 'right';
  readonly clips: { readonly idle: string; readonly move: string; readonly shoot: string };
}

const PATROLLER_LOOK: EnemyLook = { atlas: 'patroller', scale: 1, tint: 0xffffff, pivot: 'feet', faces: 'right', clips: { idle: 'idle', move: 'move', shoot: 'shoot' } };

/** Stealth and the boss reuse the patroller sheet until their own art exists; the boss is a heavy, lilac-tinted 1.6x cut. */
export const ENEMY_LOOK: Readonly<Record<EnemyType, EnemyLook>> = {
  patroller: PATROLLER_LOOK,
  stealth: PATROLLER_LOOK,
  aswang: { ...PATROLLER_LOOK, scale: 1.6, tint: 0xd8b4ff },
  /**
   * Own 192×188 sheet, packed at 0.5 from 2× art. Scale 2 counters
   * `SIM_PX_PER_ATLAS_PX` (0.5) so the sprite matches the sim body.
   */
  sigbin: { atlas: 'sigbin', scale: 2, tint: 0xffffff, pivot: 'feet', faces: 'right', clips: { idle: 'idle', move: 'move', shoot: 'shoot' } },
  drone: { atlas: 'drone', scale: 1, tint: 0xffffff, pivot: 'centre', faces: 'left', clips: { idle: 'hover', move: 'move', shoot: 'shoot' } },
  tikbalang: { atlas: 'tikbalang', scale: 1, tint: 0xffffff, pivot: 'feet', faces: 'right', clips: { idle: 'idle', move: 'run', shoot: 'stomp' } },
};

/** Atlas names a level's enemies need; a boss also needs the drones it summons. */
export function enemyAtlasNames(level: LevelJson): string[] {
  const names = new Set<string>();
  for (const e of level.enemies) {
    names.add(ENEMY_LOOK[e.type].atlas);
    if (e.type === 'aswang') names.add(ENEMY_LOOK.drone.atlas);
  }
  return [...names].sort();
}

/** Fetches JSON and textures from the served asset root. Swappable in tests. */
export interface AssetSource {
  json(path: string): Promise<unknown>;
  texture(path: string): Promise<Texture>;
  /** Absolute URL for a path. Present when the source can feed a loader that fetches on its own (KTX2). */
  url?(path: string): string;
}

export class HttpAssetSource implements AssetSource {
  private readonly loader = new TextureLoader();

  constructor(private readonly base: string) {}

  url(path: string): string {
    return this.base + path;
  }

  async json(path: string): Promise<unknown> {
    const res = await fetch(this.base + path);
    if (!res.ok) throw new Error(`asset ${path}: HTTP ${res.status}`);
    return res.json() as Promise<unknown>;
  }

  async texture(path: string): Promise<Texture> {
    return this.loader.loadAsync(this.base + path);
  }
}

let gpuSupport: GpuTextureSupport | null = null;

/** One throwaway context, then dropped, so the game's own context is the only one left. */
export function probeGpuTextureSupport(): GpuTextureSupport {
  if (gpuSupport) return gpuSupport;
  if (typeof document === 'undefined') return (gpuSupport = { software: true, s3tc: false, bptc: false });
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return (gpuSupport = { software: true, s3tc: false, bptc: false });
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  gpuSupport = {
    software: isSoftwareRenderer(renderer),
    s3tc: gl.getExtension('WEBGL_compressed_texture_s3tc') !== null,
    bptc: gl.getExtension('EXT_texture_compression_bptc') !== null,
  };
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return gpuSupport;
}

let ktx2: KTX2Loader | null = null;

async function loadKtx2(url: string, support: GpuTextureSupport): Promise<Texture> {
  if (!ktx2) {
    const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
    ktx2 = new KTX2Loader();
    ktx2.setWorkerLimit(1);
    // BC7 / S3TC only. ETC2 and ASTC are left off: on desktop Linux they are often emulated.
    ktx2.workerConfig = {
      astcSupported: false,
      astcHDRSupported: false,
      etc1Supported: false,
      etc2Supported: false,
      dxtSupported: support.s3tc,
      bptcSupported: support.bptc,
      pvrtcSupported: false,
    };
  }
  return ktx2.loadAsync(url);
}

/** Painted art is authored in sRGB; sprites are drawn near 1:1 and keep mipmaps for the odd minified frame. */
function atlasTexture(tex: Texture): Texture {
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

/** Backdrops cover the screen at or above 1:1, so mipmaps would only cost fill rate (about 10 fps under software GL). */
function backdropTexture(tex: Texture): Texture {
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

async function loadAtlas(src: AssetSource, name: string): Promise<LoadedAtlas> {
  const json = (await src.json(`atlases/${name}.json`)) as AtlasJson;
  const problems = atlasProblems(json);
  if (problems.length) throw new Error(`atlas ${name}: ${problems.join('; ')}`);
  const texture = atlasTexture(await src.texture(`atlases/${json.image}`));
  return { json, texture };
}

async function loadBackdrop(src: AssetSource, levelId: string, file: string, support: GpuTextureSupport): Promise<BackdropLayerAssets> {
  const ktx2Url = src.url?.(`backdrops/${levelId}/${file}.ktx2`);
  const [metaJson, texture] = await Promise.all([
    src.json(`backdrops/${levelId}/${file}.meta.json`),
    ktx2Url && useCompressedBackdrops(support) ? loadKtx2(ktx2Url, support) : src.texture(`backdrops/${levelId}/${file}.webp`),
  ]);
  return { texture: backdropTexture(texture), meta: parseBackdropMeta(metaJson) };
}

/**
 * Load the character atlas and, when the level declares art, its prop atlas
 * and backdrop layers. Atlases fetch their JSON before their image (the JSON
 * names it); everything else runs in parallel. A missing file rejects so boot
 * lands the error in the test hooks instead of rendering pink squares.
 * Backdrops are KTX2 where the GPU can sample a block format, WebP otherwise.
 */
export async function loadAssets(level: LevelJson, src: AssetSource): Promise<GameAssets> {
  const art = level.art;
  const enemyNames = enemyAtlasNames(level);
  const [batoman, levelArt, ...enemyAtlases] = await Promise.all([
    loadAtlas(src, 'batoman'),
    art
      ? (async (): Promise<LevelArtAssets> => {
          const layerNames = Object.entries(art.backdrops);
          const support = probeGpuTextureSupport();
          const [props, ...layers] = await Promise.all([loadAtlas(src, art.props), ...layerNames.map(([, file]) => loadBackdrop(src, level.id, file, support))]);
          const backdrops = new Map<string, BackdropLayerAssets>();
          layerNames.forEach(([layer], i) => backdrops.set(layer, layers[i]!));
          return { props, backdrops };
        })()
      : Promise.resolve(null),
    ...enemyNames.map((n) => loadAtlas(src, n)),
  ]);
  const enemies = new Map<string, LoadedAtlas>();
  enemyNames.forEach((n, i) => enemies.set(n, enemyAtlases[i]!));
  return { batoman, enemies, levelArt };
}

export function disposeAssets(assets: GameAssets): void {
  assets.batoman.texture.dispose();
  assets.enemies.forEach((a) => a.texture.dispose());
  assets.levelArt?.props.texture.dispose();
  assets.levelArt?.backdrops.forEach((layer) => layer.texture.dispose());
}
