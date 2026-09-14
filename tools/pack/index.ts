import { readFile, rm } from 'node:fs/promises';
import { PATHS } from '../config.js';
import { loadImage } from '../recut/io.js';
import { applyMask } from '../recut/mask.js';
import { parseRecipe } from '../recut/recipe.js';
import { planAtlas, segment } from '../recut/segment.js';
import { findFiles, fmtBytes } from '../validate/lib.js';
import { buildAtlas, writeAtlas } from './atlas.js';
import { buildBackdrops } from './backdrops.js';

/**
 * `npm run assets`: rebuild every atlas and backdrop set from the committed
 * recipes under art-source/. Output directories are wiped first so a renamed
 * atlas cannot leave a stale file behind.
 */
async function main(): Promise<void> {
  const recipes = findFiles(PATHS.artSource, (n) => n.endsWith('.recipe.json'));
  const backdropSpecs = findFiles(PATHS.artSource, (n) => n === 'backdrops.json');
  await rm(PATHS.atlases, { recursive: true, force: true });
  await rm(PATHS.backdrops, { recursive: true, force: true });

  let failed = false;
  let total = 0;
  for (const recipePath of recipes) {
    try {
      const recipe = parseRecipe(JSON.parse(await readFile(recipePath, 'utf8')), recipePath);
      const img = await loadImage(recipe.source);
      const seg = segment(img, recipe);
      const plan = planAtlas(seg, recipe);
      if (plan.unused.length) console.warn(`  warning: ${recipePath} leaves frames unused: ${plan.unused.join(' ')}`);
      const keyed = applyMask(img, seg.mask, seg.background);
      const built = await buildAtlas(keyed, seg, plan);
      const written = await writeAtlas(built, PATHS.atlases);
      total += written.imageBytes;
      console.info(`atlas ${recipe.name}: ${plan.frames.length} frames, ${built.json.width}x${built.json.height}, ${fmtBytes(written.imageBytes)} -> ${written.imagePath}`);
    } catch (err) {
      failed = true;
      console.error(`${recipePath}: ${(err as Error).message}`);
    }
  }
  for (const specPath of backdropSpecs) {
    try {
      for (const w of await buildBackdrops(specPath, PATHS.backdrops)) {
        total += w.bytes;
        console.info(`backdrop ${w.path}: ${fmtBytes(w.bytes)}${w.lossless ? ' (lossless)' : ''}`);
      }
    } catch (err) {
      failed = true;
      console.error(`${specPath}: ${(err as Error).message}`);
    }
  }
  console.info(`total generated image payload: ${fmtBytes(total)}`);
  if (failed) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
