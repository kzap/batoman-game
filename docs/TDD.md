# BatoMan v2 - Technical Design

Status: skeleton. Sections are filled in by the phase that implements them. Anything not marked
`[implemented]` describes intent, not shipped code.

## 1. Stack `[implemented: Phase 0]`

| Package | Version | Role |
|---|---|---|
| `three` | 0.186 | Renderer, scene graph, loaders |
| `postprocessing` | 6.39 (added in Phase 4) | Bloom, vignette, DOF |
| `vite` | 7 | Dev server, bundler |
| `typescript` | 5.9 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | |
| `vitest` | 5 | Unit and replay tests |
| `@playwright/test` | 1.63 | E2E against the production build |
| `sharp` | 0.35 (added in Phase 1) | Offline asset tooling |

Node 20.19+ or 22.12+ (`engines`; Vite 7 requirement). Path aliases `@core`, `@game`, `@render`, `@app`, `@content` are defined in
`tsconfig.json` and `vite.config.ts`; `vitest.config.ts` inherits them via `mergeConfig`.

## 2. Layers `[implemented: Phase 0]`

`core <- game <- render/app`. ESLint (`eslint.config.js`) forbids `core` and `game` from importing `three`,
`postprocessing`, or anything under `render/` or `app/` (aliased or relative); from touching browser globals
(`window`, `document`, `navigator`, storage, timers, `performance`, `globalThis`); and from calling
`Math.random`, `Date.now`, `performance.now`, or `new Date`.

## 3. Time `[implemented: Phase 0]`

`FixedClock` (`src/core/sim/clock.ts`) accumulates frame time and issues whole ticks at `SIM_HZ = 120`.
At most `MAX_TICKS_PER_FRAME = 8` ticks run per frame; excess time is discarded and reported as `dropped`.
The remainder fraction `alpha` in `[0, 1)` drives render interpolation. Negative, NaN, and infinite frame
durations count as zero.

## 4. Sim `[Phase 2]`

Actor/Solid swept-AABB. Snapshot-based read model for the renderer. Seeded PRNG in world state.

## 5. Renderer `[partial: Phase 0]`

`Stage` (`src/render/stage.ts`) owns the `WebGLRenderer`, `Scene`, `PerspectiveCamera` (FOV 30, distance
22, looking at Z=0), fog, and a key/rim light pair. `LAYER_Z` fixes the Z depths for backdrop, gameplay,
and foreground layers. Backdrops are `MeshBasicMaterial` (unlit). `preserveDrawingBuffer` is on so tests
can read pixels.

Billboards, diorama layers, prop instancing, and the post stack arrive in Phases 3-4.

## 6. App `[implemented: Phase 0]`

`installHooks()` (`src/app/app.ts`) publishes `window.__batoman` and global error capture before anything
else runs, so a WebGL boot failure is recorded in `errors`. `App` runs the `requestAnimationFrame` loop:
advance clock, step world N times, keep the last two snapshots, present with interpolation via
`Stage.setMarker`.

## 7. Asset pipeline `[implemented: Phase 1]`

Raw sheets live in `art-source/` and never ship. Each sheet has a committed `*.recipe.json` beside it;
`npm run assets` (`tools/pack/index.ts`) wipes `public/assets/atlases/` and `public/assets/backdrops/`
(both gitignored) and regenerates them from the recipes. `npm run build` runs `assets` before `validate`, so
a clone builds without a manual step.

### 7.1 Segmentation (`tools/recut`)

`segment()` (`segment.ts`) runs pure stages over an RGBA buffer; only `io.ts` touches `sharp`:

| Stage | Module | What it decides |
|---|---|---|
| Background | `background.ts` | Border-sampled colour palette, or the recipe's explicit `background` list for opaque sheets |
| Mask | `mask.ts` | Flood fill from the border with a hard and a soft tolerance; enclosed same-colour regions are kept (`enclosed: 'auto'` keys them only on saturated, pre-keyed sheets) |
| Erase | `segment.ts` | `overrides.erase` rectangles forced to background before labelling, to cut props that touch |
| Components | `components.ts` | 8-connected labelling; an optional `bridge` distance (default 0) joins near-touching blobs |
| Filter | `filter.ts` | Drops specks below `minArea` unless their centroid lies inside a larger component; drops the bottom-right watermark when small |
| Rows | `rows.ts` | Y-gap clustering using only substantial components; fragments join the nearest row |
| Grouping | `satellites.ts` | Sheets: small components near a frame become satellites (muzzle flash, debris). Catalogues: props never fuse; fragments attach to the prop whose box contains their centroid |
| Pivot | `pivot.ts` | `mass` (alpha-weighted centroid, default), `contact` (bottom-band centroid), or `center`, anchored at the bottom edge or the centre; `stabilize` replaces each frame's horizontal offset with the animation's median |

Frame ids are `r<row>f<index>` from the pre-override result, so `overrides.merge`, `drop`, `pivots`, and
`props` reference stable ids. Adding an `erase` rectangle can renumber a row; the review UI re-plans after
every edit so the reviewer sees the effect immediately.

The default is `mass`, not the contact band the plan proposed: on BatoMan's run row the contact-band pivot
moves between 0.43 and 0.57 of the frame width as the feet swing, while the mass centroid stays within
0.49 to 0.52 (measured with `computePivot` on `batoman.recipe.json`). Stabilisation then removes the
remaining jitter; shipped `run` pivots sit at 0.49 to 0.51 of frame width with `pivot.y` on the bottom edge
for every grounded frame.

Recipe schema: `recipe.ts` (`Recipe`, `parseRecipe`, `RecipeError`). Two kinds: `sheet` (rows of animation
frames, named by `animations[]`) and `catalogue` (independent props, named by `props`; unlisted frames are
reported as unused). `scale` in `(0, 1]` is applied when packing. The three enemy sheets and both prop
catalogues use `scale: 0.5`, which matches their 2816 px sources to the 1408 px BatoMan sheet.

Commands:

```
npm run recut <recipe.json>          # segment, print rows/frames/plan, write <name>.preview.png (gitignored)
npm run recut -- init <png> --name <n> --kind sheet|catalogue   # scaffold a recipe
npm run recut:review <recipe.json>   # browser review UI on 127.0.0.1:5177
```

### 7.2 Review UI (`tools/recut/review.ts`, `review.html`)

A local HTTP server that renders the keyed sheet with frame boxes and pivots, and writes the recipe on every
accepted edit. Edits: select, merge (`M`), drop (`Del`), erase-rectangle tool (`E`), pivot drag, prop
naming, animation rename/fps/loop, animation scrub with ghost overlay, and a raw JSON editor. `POST /api/recipe` re-parses, re-segments,
and re-plans; a `RecipeError` returns 400 and leaves the file untouched.

### 7.3 Packing (`tools/pack`)

`buildAtlas` (`atlas.ts`) crops each frame using the label map (so touching neighbours are excluded),
scales, extrudes edges by 1 px with a 1 px gutter, and packs with a skyline packer into the smallest
power-of-two texture up to `ATLAS_MAX_SIZE` (4096). Output is lossless WebP plus JSON in the `AtlasJson`
shape (`src/content/atlas.ts`, shared with the renderer): frame rects, per-frame pivots in atlas pixels,
and animations `{ fps, loop, frames }`. Frame names are `<animation>_<NN>` for sheets and the prop name for
catalogues.

`buildBackdrops` (`backdrops.ts`) reads `art-source/<level>/backdrops.json` and writes one WebP per layer,
lossy (default quality 82) unless the layer has transparency or sets `lossless: true`. Level 1's foreground
has alpha but is written lossy at quality 90 to stay within the payload target.

Atlases are WebP only. KTX2/Basis output needs an encoder dependency and a runtime `KTX2Loader` path; it is
deferred until a measured GPU-memory or decode-time problem justifies it.

### 7.4 Outputs and payload

| Atlas | Frames | Texture | Size |
|---|---|---|---|
| `batoman` | 48 | 1024x1024 | 622 KB |
| `patroller` | 32 | 1024x1024 | 555 KB |
| `drone` | 34 | 1024x512 | 420 KB |
| `tikbalang` | 30 | 1024x1024 | 437 KB |
| `level-1-props` | 24 | 1024x1024 | 769 KB |
| `level-4-props` | 27 | 1024x1024 | 791 KB |

Sizes are as printed by `npm run assets` (KiB). Level 1 backdrops: 61 KB + 176 KB + 221 KB.

The Level 1 set a player downloads (BatoMan, patroller, drone, props atlases with their JSON, three
backdrops) is 2,918,440 bytes. v1 loaded 29,557,023 bytes of images for the same level
(`git show v1-archive:src/scenes/PreloadScene.ts`: three backdrops, tileset, batoman, drone, patroller
PNGs). Ratio 9.9%, against the 10% ceiling; a quality or scale increase on any Level 1 asset needs a
matching saving elsewhere.

`npm run validate` (`tools/validate/assets.ts`) parses every recipe and backdrop spec, requires each output
file to exist, checks each atlas JSON with `atlasProblems()`, and confirms the WebP dimensions match the
JSON. A file under `public/assets/atlases/` with no recipe is an error.

## 8. Content `[Phase 2, 5]`

Level JSON schema and the in-browser editor.

## 9. Validation and budgets `[implemented: Phase 0]`

`npm run build` = typecheck, `assets`, `validate`, `vite build`, `budget`.

`npm run validate` (`tools/validate/index.ts`) walks `public/` and fails on any path
`forbiddenServedPathReason` (`tools/config.ts`) rejects: raw-art name patterns (`concept-art`,
`-sprites.png`, `art-source`, `.psd`) and any raster image outside `assets/atlases/`, `assets/backdrops/`, or `assets/ui/`. It also
parses `src/content/manifest.json` and runs the asset checks in section 7.4. `npm run budget` (`tools/validate/budget.ts`) applies the same path rule
to `dist/` and fails on any breach of `BUDGET`:

| Budget | Ceiling |
|---|---|
| Total served (excluding source maps) | 12 MB |
| JS + CSS | 900 KB |
| Single image | 1.5 MB |
| Single audio | 6 MB |

## 10. Testing `[implemented: Phase 0]`

| Layer | Tool | Location | Runs against |
|---|---|---|---|
| Unit | Vitest project `unit` | `tests/unit/**`, `tools/**/*.test.ts` | `core`, `game`, `tools` (segmenter stages run on synthetic sheets from `tools/recut/__tests__/fixtures.ts`) |
| Replay | Vitest project `replay` | `tests/replay/**` | headless `World` |
| E2E | Playwright | `tests/e2e/**` | `vite preview` of `dist/` with SwiftShader WebGL |

CI (`.github/workflows/ci.yml`): lint, unit, replay, build (typecheck + assets + validate + budget), then e2e on the
uploaded `dist/` artefact. E2E does not rebuild; run `npm run build` before `npm run test:e2e` locally.
