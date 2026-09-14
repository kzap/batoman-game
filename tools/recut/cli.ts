import { existsSync } from 'node:fs';
import path from 'node:path';
import { previewPathFor, readRecipe, runRecipe, writeRecipe } from './files.js';
import { loadImage, renderOverlay } from './io.js';
import { applyMask } from './mask.js';
import { scaffoldRecipe } from './recipe.js';
import type { Recipe } from './recipe.js';
import { planAtlas, segment } from './segment.js';
import type { Segmentation } from './types.js';

function report(recipePath: string, recipe: Recipe, seg: Segmentation): void {
  const bg = seg.background.colors.map((c) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`).join(' ');
  console.info(`${recipePath}`);
  console.info(`  source ${recipe.source} ${seg.width}x${seg.height}  background ${bg}${seg.background.transparent ? ' (pre-keyed)' : ''}`);
  seg.rows.forEach((row, r) => {
    const sizes = row.map((f) => `${f.w}x${f.h}`);
    const sats = row.reduce((n, f) => n + f.satellites.length, 0);
    console.info(`  row ${r}: ${row.length} frames${sats ? ` (+${sats} satellites)` : ''}  ${sizes.join(' ')}`);
  });
  const byReason = new Map<string, number>();
  for (const d of seg.dropped) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
  if (byReason.size) console.info(`  dropped: ${[...byReason].map(([k, v]) => `${v} ${k}`).join(', ')}`);
  const plan = planAtlas(seg, recipe);
  console.info(`  plan: ${plan.frames.length} frames, ${plan.animations.length} animations${plan.unused.length ? `, UNUSED ${plan.unused.join(' ')}` : ''}`);
  console.info(`  preview ${previewPathFor(recipePath)}`);
}

function usage(): never {
  console.error(
    [
      'usage:',
      '  tsx tools/recut/cli.ts init <source.png> --name <atlas-name> [--kind sheet|catalogue]',
      '      scaffold <dir>/<atlas-name>.recipe.json next to the source and render a preview',
      '  tsx tools/recut/cli.ts <recipe.json> [...]',
      '      re-run segmentation, print a report and refresh the preview',
    ].join('\n'),
  );
  process.exit(2);
}

async function main(argv: string[]): Promise<void> {
  if (argv.length === 0) usage();
  if (argv[0] === 'init') {
    const source = argv[1];
    const nameIdx = argv.indexOf('--name');
    const kindIdx = argv.indexOf('--kind');
    if (!source || nameIdx < 0 || !argv[nameIdx + 1]) usage();
    const name = argv[nameIdx + 1];
    const kind = kindIdx >= 0 ? (argv[kindIdx + 1] as Recipe['kind']) : 'sheet';
    if (kind !== 'sheet' && kind !== 'catalogue') usage();
    const recipePath = path.join(path.dirname(source), `${name}.recipe.json`);
    if (existsSync(recipePath)) {
      console.error(`${recipePath} already exists; edit it or run without "init".`);
      process.exit(1);
    }
    const draft = scaffoldRecipe(source, name, kind, 0);
    const img = await loadImage(source);
    const seg = segment(img, draft);
    let recipe = scaffoldRecipe(source, name, kind, seg.rows.length);
    if (kind === 'catalogue') {
      const props: Record<string, string> = {};
      seg.rows.forEach((row) => row.forEach((f) => (props[f.id] = `prop_${f.id}`)));
      recipe = { ...recipe, props };
    }
    await writeRecipe(recipePath, recipe);
    const keyed = applyMask(img, seg.mask, seg.background);
    await renderOverlay(keyed, seg, previewPathFor(recipePath));
    report(recipePath, recipe, seg);
    return;
  }
  let failed = false;
  for (const recipePath of argv) {
    try {
      const recipe = await readRecipe(recipePath);
      const seg = await runRecipe(recipePath, recipe);
      report(recipePath, recipe, seg);
    } catch (err) {
      failed = true;
      console.error(`${recipePath}: ${(err as Error).message}`);
    }
  }
  if (failed) process.exit(1);
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
