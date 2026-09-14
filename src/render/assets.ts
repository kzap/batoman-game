import { LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { atlasProblems, type AtlasJson } from '@content/atlas';
import type { EnemyType, LevelJson } from '@content/level';

/** An atlas description together with its uploaded texture. */
export interface LoadedAtlas {
  readonly json: AtlasJson;
  readonly texture: Texture;
}

/** Everything the views need to dress one level; null layers mean grey-box. */
export interface LevelArtAssets {
  readonly props: LoadedAtlas;
  /** Backdrop layer name (from `level.art.backdrops`) to texture. */
  readonly backdrops: ReadonlyMap<string, Texture>;
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
}

export class HttpAssetSource implements AssetSource {
  private readonly loader = new TextureLoader();

  constructor(private readonly base: string) {}

  async json(path: string): Promise<unknown> {
    const res = await fetch(this.base + path);
    if (!res.ok) throw new Error(`asset ${path}: HTTP ${res.status}`);
    return res.json() as Promise<unknown>;
  }

  async texture(path: string): Promise<Texture> {
    return this.loader.loadAsync(this.base + path);
  }
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

/**
 * Load the character atlas and, when the level declares art, its prop atlas
 * and backdrop layers. Atlases fetch their JSON before their image (the JSON
 * names it); everything else runs in parallel. A missing file rejects so boot
 * lands the error in the test hooks instead of rendering pink squares.
 */
export async function loadAssets(level: LevelJson, src: AssetSource): Promise<GameAssets> {
  const art = level.art;
  const enemyNames = enemyAtlasNames(level);
  const [batoman, levelArt, ...enemyAtlases] = await Promise.all([
    loadAtlas(src, 'batoman'),
    art
      ? (async (): Promise<LevelArtAssets> => {
          const layerNames = Object.entries(art.backdrops);
          const [props, ...textures] = await Promise.all([loadAtlas(src, art.props), ...layerNames.map(async ([, file]) => backdropTexture(await src.texture(`backdrops/${level.id}/${file}.webp`)))]);
          const backdrops = new Map<string, Texture>();
          layerNames.forEach(([layer], i) => backdrops.set(layer, textures[i]!));
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
  assets.levelArt?.backdrops.forEach((t) => t.dispose());
}
