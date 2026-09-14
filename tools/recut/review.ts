/**
 * Review UI server: `npm run recut:review <recipe.json> [--port 5177]`.
 *
 * Serves a single page that shows the keyed sheet with the segmenter's frames,
 * and lets the reviewer correct the recipe (names, merges, drops, erase cuts,
 * pivots) without hand-editing JSON. Every edit is validated by running the
 * full pipeline; only a recipe that segments and plans cleanly is written back.
 * Nothing here is shipped: the page is dev tooling with no dependencies.
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { previewPathFor, readRecipe, writeRecipe } from './files.js';
import { loadImage, renderOverlay, toSharp } from './io.js';
import { applyMask } from './mask.js';
import { parseRecipe, RecipeError } from './recipe.js';
import type { Recipe } from './recipe.js';
import { planAtlas, segment } from './segment.js';
import type { AtlasPlan } from './segment.js';
import type { Box, RawImage, Segmentation } from './types.js';

/** What the page needs: geometry only, no pixel buffers. */
export interface ReviewState {
  readonly recipePath: string;
  readonly recipe: Recipe;
  readonly width: number;
  readonly height: number;
  readonly background: readonly string[];
  readonly rows: readonly (readonly ReviewFrame[])[];
  readonly dropped: readonly (Box & { readonly reason: string })[];
  readonly plan: AtlasPlan | null;
  /** Set when the recipe segments but cannot be planned (e.g. an animation names a missing frame). */
  readonly planError: string | null;
}

export interface ReviewFrame extends Box {
  readonly id: string;
  readonly row: number;
  readonly primary: Box;
  readonly satellites: readonly Box[];
  /** Frame-relative pivot. */
  readonly pivot: { readonly x: number; readonly y: number };
}

function hex(c: { r: number; g: number; b: number }): string {
  return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function pickBox(b: Box): Box {
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

export function toReviewState(recipePath: string, recipe: Recipe, seg: Segmentation): ReviewState {
  let plan: AtlasPlan | null = null;
  let planError: string | null = null;
  try {
    plan = planAtlas(seg, recipe);
  } catch (err) {
    if (!(err instanceof RecipeError)) throw err;
    planError = err.message;
  }
  return {
    recipePath,
    recipe,
    width: seg.width,
    height: seg.height,
    background: seg.background.colors.map(hex),
    rows: seg.rows.map((row) =>
      row.map((f) => ({
        id: f.id,
        row: f.row,
        ...pickBox(f),
        primary: pickBox(f.primary),
        satellites: f.satellites.map(pickBox),
        pivot: { x: f.pivot.x - f.x, y: f.pivot.y - f.y },
      })),
    ),
    dropped: seg.dropped.map((d) => ({ ...pickBox(d.component), reason: d.reason })),
    plan,
    planError,
  };
}

class Session {
  private img: { source: string; image: RawImage } | null = null;
  private sheetPng: Buffer | null = null;
  private sheetKey = '';

  constructor(
    readonly recipePath: string,
    private recipe: Recipe,
  ) {}

  /** The sheet for `source`, reloaded when a raw-JSON edit points the recipe elsewhere. */
  private async image(source: string): Promise<RawImage> {
    if (this.img?.source !== source) this.img = { source, image: await loadImage(source) };
    return this.img.image;
  }

  private async run(recipe: Recipe): Promise<{ seg: Segmentation; keyed: RawImage }> {
    const img = await this.image(recipe.source);
    const seg = segment(img, recipe);
    const keyed = applyMask(img, seg.mask, seg.background);
    return { seg, keyed };
  }

  async state(): Promise<ReviewState> {
    const { seg, keyed } = await this.run(this.recipe);
    await this.cacheSheet(keyed);
    return toReviewState(this.recipePath, this.recipe, seg);
  }

  /** Validate, segment and plan the candidate; persist only when all three succeed. */
  async update(candidate: unknown): Promise<ReviewState> {
    const recipe = parseRecipe(candidate, this.recipePath);
    const { seg, keyed } = await this.run(recipe);
    const state = toReviewState(this.recipePath, recipe, seg);
    this.recipe = recipe;
    await writeRecipe(this.recipePath, recipe);
    await renderOverlay(keyed, seg, previewPathFor(this.recipePath));
    await this.cacheSheet(keyed);
    return state;
  }

  private async cacheSheet(keyed: RawImage): Promise<void> {
    // The keyed sheet only changes with background/mask/erase edits; cache on those.
    const key = JSON.stringify([this.recipe.background, this.recipe.mask, this.recipe.overrides?.erase]);
    if (key === this.sheetKey && this.sheetPng) return;
    this.sheetPng = await toSharp(keyed).png({ compressionLevel: 3 }).toBuffer();
    this.sheetKey = key;
  }

  async sheet(): Promise<Buffer> {
    if (!this.sheetPng) await this.state();
    return this.sheetPng!;
  }
}

function send(res: ServerResponse, status: number, body: Buffer | string, type: string): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function json(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, JSON.stringify(value), 'application/json');
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export function createServer(session: Session): http.Server {
  const pageUrl = new URL('./review.html', import.meta.url);
  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      try {
        if (req.method === 'GET' && url.pathname === '/') {
          send(res, 200, await readFile(pageUrl), 'text/html; charset=utf-8');
        } else if (req.method === 'GET' && url.pathname === '/api/state') {
          json(res, 200, await session.state());
        } else if (req.method === 'GET' && url.pathname === '/sheet.png') {
          send(res, 200, await session.sheet(), 'image/png');
        } else if (req.method === 'POST' && url.pathname === '/api/recipe') {
          json(res, 200, await session.update(JSON.parse(await readBody(req))));
        } else {
          send(res, 404, 'not found', 'text/plain');
        }
      } catch (err) {
        const message = (err as Error).message;
        json(res, err instanceof RecipeError || err instanceof SyntaxError ? 400 : 500, { error: message });
        if (!(err instanceof RecipeError)) console.error(err);
      }
    })();
  });
}

async function main(argv: string[]): Promise<void> {
  const recipePath = argv.find((a) => a.endsWith('.json'));
  if (!recipePath) {
    console.error('usage: tsx tools/recut/review.ts <recipe.json> [--port 5177]');
    process.exit(2);
  }
  const portIdx = argv.indexOf('--port');
  const port = portIdx >= 0 ? Number(argv[portIdx + 1]) : 5177;
  const session = new Session(recipePath, await readRecipe(recipePath));
  const server = createServer(session);
  server.listen(port, '127.0.0.1', () => {
    console.info(`reviewing ${recipePath}`);
    console.info(`open http://127.0.0.1:${port}/  (ctrl-c to stop; the recipe is saved on every edit)`);
  });
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
