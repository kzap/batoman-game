/** Recipe file helpers shared by the CLI, the review server and the packer. */
import { readFile, writeFile } from 'node:fs/promises';
import { loadImage, renderOverlay } from './io.js';
import { applyMask } from './mask.js';
import { parseRecipe } from './recipe.js';
import type { Recipe } from './recipe.js';
import { segment } from './segment.js';
import type { Segmentation } from './types.js';

export function previewPathFor(recipePath: string): string {
  return recipePath.replace(/\.recipe\.json$/, '.preview.png');
}

export async function readRecipe(recipePath: string): Promise<Recipe> {
  const raw = JSON.parse(await readFile(recipePath, 'utf8')) as unknown;
  return parseRecipe(raw, recipePath);
}

export async function writeRecipe(recipePath: string, recipe: Recipe): Promise<void> {
  await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
}

/** Segment one recipe and write its preview. Returns the segmentation for reporting. */
export async function runRecipe(recipePath: string, recipe: Recipe): Promise<Segmentation> {
  const img = await loadImage(recipe.source);
  const seg = segment(img, recipe);
  const keyed = applyMask(img, seg.mask, seg.background);
  await renderOverlay(keyed, seg, previewPathFor(recipePath));
  return seg;
}
