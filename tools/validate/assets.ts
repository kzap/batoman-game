import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import sharp from 'sharp';
import { atlasProblems, type AtlasJson } from '../../src/content/atlas';
import { PATHS } from '../config';
import { parseBackdrops } from '../pack/backdrops';
import { parseRecipe } from '../recut/recipe';
import { Report, findFiles } from './lib';

/**
 * Check that every recipe and backdrop spec under art-source/ has up-to-date
 * pipeline output under public/assets/, and that each atlas JSON is internally
 * consistent and matches its image. Recipes are parsed so a broken recipe fails
 * validation even before `npm run assets` is attempted.
 */

/** Output files one recipe or backdrop spec must have produced. */
export interface ExpectedOutput {
  /** Path relative to the repo root. */
  readonly path: string;
  readonly producedBy: string;
}

export function expectedAtlasOutputs(recipeName: string, recipePath: string, atlasDir: string = PATHS.atlases): ExpectedOutput[] {
  return [
    { path: `${atlasDir}/${recipeName}.json`, producedBy: recipePath },
    { path: `${atlasDir}/${recipeName}.webp`, producedBy: recipePath },
  ];
}

export function expectedBackdropOutputs(level: string, layers: readonly string[], specPath: string, backdropDir: string = PATHS.backdrops): ExpectedOutput[] {
  return layers.map((layer) => ({ path: `${backdropDir}/${level}/${layer}.webp`, producedBy: specPath }));
}

export interface ImageDims {
  readonly width: number;
  readonly height: number;
}

/**
 * Problems with one atlas JSON as read from disk. Pure: the caller supplies the
 * decoded JSON and the measured image size.
 */
export function atlasFileProblems(name: string, json: unknown, image: ImageDims | null): string[] {
  if (typeof json !== 'object' || json === null) return [`${name}.json is not an object`];
  const atlas = json as AtlasJson;
  const problems = atlasProblems(atlas);
  if (atlas.image !== `${name}.webp`) problems.push(`image field "${String(atlas.image)}" should be "${name}.webp"`);
  if (image === null) problems.push(`image ${name}.webp is missing or unreadable`);
  else if (image.width !== atlas.width || image.height !== atlas.height) {
    problems.push(`image is ${image.width}x${image.height} but JSON says ${atlas.width}x${atlas.height}`);
  }
  return problems;
}

async function imageDims(path: string): Promise<ImageDims | null> {
  try {
    const meta = await sharp(path).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
  } catch {
    return null;
  }
}

const REBUILD_HINT = 'run `npm run assets`';

export async function validateAssets(root = '.'): Promise<Report> {
  const report = new Report();
  const expected: ExpectedOutput[] = [];
  const atlasNames = new Map<string, string>();

  const recipes = findFiles(join(root, PATHS.artSource), (n) => n.endsWith('.recipe.json'));
  for (const recipePath of recipes) {
    try {
      const recipe = parseRecipe(JSON.parse(readFileSync(recipePath, 'utf8')), recipePath);
      const dup = atlasNames.get(recipe.name);
      if (dup) report.error(`${recipePath}: atlas name "${recipe.name}" is already used by ${dup}`);
      atlasNames.set(recipe.name, recipePath);
      if (!existsSync(join(root, recipe.source))) report.error(`${recipePath}: source ${recipe.source} does not exist`);
      expected.push(...expectedAtlasOutputs(recipe.name, recipePath));
    } catch (e) {
      report.error(`${recipePath}: ${(e as Error).message}`);
    }
  }
  report.note(`recipes: ${recipes.length}`);

  const specs = findFiles(join(root, PATHS.artSource), (n) => n === 'backdrops.json');
  for (const specPath of specs) {
    try {
      const spec = parseBackdrops(JSON.parse(readFileSync(specPath, 'utf8')), specPath);
      for (const layer of Object.values(spec.layers)) {
        const src = join(dirname(specPath), layer.source);
        if (!existsSync(src)) report.error(`${specPath}: layer source ${layer.source} does not exist`);
      }
      expected.push(...expectedBackdropOutputs(spec.level, Object.keys(spec.layers), specPath));
    } catch (e) {
      report.error(`${specPath}: ${(e as Error).message}`);
    }
  }
  report.note(`backdrop specs: ${specs.length}`);

  const missing = expected.filter((e) => !existsSync(join(root, e.path)));
  for (const m of missing) report.error(`${m.path} is missing (from ${m.producedBy}); ${REBUILD_HINT}`);

  for (const [name] of atlasNames) {
    const jsonPath = join(root, PATHS.atlases, `${name}.json`);
    if (!existsSync(jsonPath)) continue;
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      report.error(`${jsonPath}: not valid JSON: ${(e as Error).message}`);
      continue;
    }
    const dims = await imageDims(join(root, PATHS.atlases, `${name}.webp`));
    for (const p of atlasFileProblems(name, json, dims)) report.error(`atlas ${name}: ${p}`);
  }

  // Outputs with no recipe are stale leftovers; `npm run assets` wipes them, so this
  // only trips when someone hand-copies a file in.
  const produced = new Set(expected.map((e) => e.path));
  for (const f of findFiles(join(root, PATHS.atlases), () => true)) {
    const rel = `${PATHS.atlases}/${basename(f)}`;
    if (!produced.has(rel)) report.error(`${rel} has no recipe; ${REBUILD_HINT}`);
  }

  report.note(`pipeline outputs: ${expected.length - missing.length}/${expected.length} present`);
  return report;
}
