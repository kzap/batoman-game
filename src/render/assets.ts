import { LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { atlasProblems, type AtlasJson } from '@content/atlas';
import type { LevelJson } from '@content/level';

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
  readonly levelArt: LevelArtAssets | null;
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
  const [batoman, levelArt] = await Promise.all([
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
  ]);
  return { batoman, levelArt };
}

export function disposeAssets(assets: GameAssets): void {
  assets.batoman.texture.dispose();
  assets.levelArt?.props.texture.dispose();
  assets.levelArt?.backdrops.forEach((t) => t.dispose());
}
