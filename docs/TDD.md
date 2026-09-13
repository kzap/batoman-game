# BatoMan v2 - Technical Design

Status: skeleton. Sections are filled in by the phase that implements them. Anything not marked
`[implemented]` describes intent, not shipped code.

## 1. Stack `[implemented: Phase 0]`

| Package | Version | Role |
|---|---|---|
| `three` | 0.186 | Renderer, scene graph, loaders |
| `postprocessing` | 6.39 | Bloom, vignette, DOF |
| `vite` | 7 | Dev server, bundler |
| `typescript` | 5.9 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | |
| `vitest` | 5 | Unit and replay tests |
| `@playwright/test` | 1.63 | E2E against the production build |
| `sharp` | 0.35 | Offline asset tooling |

Node 20+ (`engines`). Path aliases `@core`, `@game`, `@render`, `@app`, `@content` are defined in
`tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`.

## 2. Layers `[implemented: Phase 0]`

`core <- game <- render/app`. ESLint (`eslint.config.js`) forbids `core` and `game` from importing `three`,
`postprocessing`, `@render/*`, `@app/*`, and from touching `window`, `document`,
`requestAnimationFrame`, or `performance`.

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

`App` (`src/app/app.ts`) runs the `requestAnimationFrame` loop: advance clock, step world N times, keep
the last two snapshots, present with interpolation. `window.__batoman` exposes `TestHooks` for e2e tests.

## 7. Asset pipeline `[Phase 1]`

`tools/recut` -> `*.recipe.json` -> `tools/pack` -> `public/assets/atlases/`. See PLAN.md Phase 1.

## 8. Content `[Phase 2, 5]`

Level JSON schema and the in-browser editor.

## 9. Validation and budgets `[implemented: Phase 0]`

`npm run validate` (`tools/validate/index.ts`) checks `public/` for forbidden raw-art paths and parses
`src/content/manifest.json`. `npm run budget` (`tools/validate/budget.ts`) runs after `vite build` and
fails on any breach of `BUDGET` in `tools/config.ts`:

| Budget | Ceiling |
|---|---|
| Total served (excluding source maps) | 12 MB |
| JS + CSS | 900 KB |
| Single image | 1.5 MB |
| Single audio | 6 MB |

## 10. Testing `[implemented: Phase 0]`

| Layer | Tool | Location | Runs against |
|---|---|---|---|
| Unit | Vitest project `unit` | `tests/unit/**`, `tools/**/*.test.ts` | `core`, `game`, `tools` |
| Replay | Vitest project `replay` | `tests/replay/**` | headless `World` |
| E2E | Playwright | `tests/e2e/**` | `vite preview` of `dist/` with SwiftShader WebGL |

CI (`.github/workflows/ci.yml`): lint, typecheck, unit, replay, validate, build+budget, then e2e on the
uploaded `dist/` artefact.
