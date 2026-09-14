import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AtlasJson } from '../../src/content/atlas';
import type { LevelJson } from '../../src/content/level';
import { levelArtReferenceProblems } from '../../src/content/level-art';
import { PATHS } from '../config';

/** Resolve a level's art block against the atlas JSON and backdrop files on disk. Shared by validate and the editor save endpoint. */
export function levelArtReferences(level: LevelJson, root: string): string[] {
  const art = level.art;
  if (!art) return [];
  const atlasPath = join(root, PATHS.atlases, `${art.props}.json`);
  if (!existsSync(atlasPath)) return [`art.props atlas ${art.props} has not been built (${atlasPath})`];
  const atlas = JSON.parse(readFileSync(atlasPath, 'utf8')) as AtlasJson;
  const dir = join(root, PATHS.backdrops, level.id);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -'.webp'.length)) : [];
  return levelArtReferenceProblems(
    art,
    level.movingSolids.map((m) => m.prop),
    new Set(Object.keys(atlas.frames)),
    new Set(files),
  );
}
