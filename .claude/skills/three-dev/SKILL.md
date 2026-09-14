---
name: three-dev
description: Three.js 0.186 and deterministic-sim development skill for the BatoMan 2.5D platformer. Use this skill when writing any game code - sim core, game rules, renderer, app shell, tools, or tests - so the layer boundaries and conventions below are respected.
---

# BatoMan v2 Development

## Architecture in one paragraph

Gameplay runs in a deterministic, headless sim (`src/core`, `src/game`) at a fixed 120 Hz. The renderer
(`src/render`, Three.js) reads snapshots from the sim and interpolates between the last two ticks. The app
shell (`src/app`) owns the frame loop, DOM HUD, input plumbing, audio, and save data. Dependencies flow one
way: `core <- game <- render/app`. ESLint enforces that `core` and `game` import neither Three.js nor DOM
globals.

## Where code goes

| Concern | Location | Testing |
|---|---|---|
| Math, physics, FSM, clock, events | `src/core/` | `tests/unit/core/` |
| Player controller, enemies, weapons, damage, level runtime | `src/game/` | `tests/unit/game/` + `tests/replay/` |
| Scene graph, camera, lights, materials, atlases, post FX | `src/render/` | `tests/e2e/` (screenshots) |
| Frame loop, input devices, HUD DOM, audio, save | `src/app/` | `tests/e2e/` |
| Level JSON, atlas manifests | `src/content/` | `tools/validate` |
| Offline asset tooling | `tools/` | `tests/unit/tools/` (or co-located `*.test.ts` for fixtures-heavy tools) |

If you are unsure whether something is "game" or "render": if it would need to exist to run a replay test
with no screen, it is game.

## Sim rules

- Sim state is plain data. No class instances holding Three objects, no DOM handles, no `Date`.
- `World.step(input)` advances exactly one tick from an `InputFrame`; it never reads devices.
- Everything the renderer needs is in `World.snapshot()`. The renderer never calls into `World`.
- Randomness comes from `World.rng` (seeded mulberry32). `Math.random()`, `Date.now()`, and
  `performance.now()` are banned in `core`/`game` by ESLint (`no-restricted-properties`).
- Sim coordinates are integer pixels, +Y up, 32 px tiles, origin at the level's bottom-left. Boxes are
  `{x, y, w, h}` with `x,y` the min corner. The renderer converts pixels to stage units; the gameplay plane
  is Z=0.
- Physics is Actor/Solid (`src/core/sim/collision.ts`): bodies move one pixel at a time through
  `CollisionWorld.moveX/moveY` and never overlap solids; solids move through `moveSolid` and carry or push
  bodies. Sub-pixel remainders live on the `Body`. Do not add a velocity integrator that bypasses this.
- All gameplay timers are in ticks (120 Hz), never seconds, so replays stay exact. Tuning numbers live in
  `src/game/tuning.ts` only.
- Changing movement tuning or Level 1 geometry changes the replay fixture: run `npm run replay:record`,
  check the bot still completes the level with full hp, and commit the fixture diff with the change.
- Level JSON schema is `src/content/level.ts`; `levelProblems()` must pass (`npm run validate`).

## Renderer rules

- Camera: `PerspectiveCamera`, FOV 30, on +Z looking at Z=0 (`src/render/stage.ts` `CAMERA`). Keep FOV narrow;
  wide FOV makes jump distances unreadable.
- Layer depths are the `LAYER_Z` constants. Backdrops use `MeshBasicMaterial` (unlit, fog only). Z=0 content
  uses `MeshStandardMaterial` with the key (amber) + rim (cyan) lights so silhouettes read against art.
- Characters are alpha-tested billboards driven by atlas frames with per-frame pivots. Never scale a
  billboard to "fix" alignment; fix the pivot in the recut recipe.
- Interpolate: position = lerp(previous, current, alpha). Never move a mesh from inside a tick.
- Dispose geometries, materials, and textures when removing objects. `Stage.dispose()` is the pattern.
- `preserveDrawingBuffer: true` is intentional (tests read pixels).

## App rules

- The frame loop is `App.frame`. It calls `clock.advance`, steps the world N times, then presents once.
- Test hooks live on `window.__batoman` (`TestHooks` in `src/app/app.ts`). Add fields there when e2e tests
  need new visibility; never read private state from tests.
- HUD is DOM in `#hud`, styled in `src/app/styles.css`. Do not draw text in WebGL.

## Assets

- Raw art lives in `art-source/` and never ships. `public/` holds only processed outputs and audio.
  Any raster image under `public/` outside `assets/atlases/`, `assets/backdrops/`, or `assets/ui/` fails
  `npm run validate`.
- Every sheet has a committed `*.recipe.json` beside it. Fix segmentation problems in the recipe
  (`overrides.erase` to cut touching props, `merge`/`drop`, `pivots`), never by editing outputs.
  Use `npm run recut:review <recipe>` for visual edits; `npm run recut <recipe>` prints the plan and writes
  a preview PNG. Frame ids `r<row>f<index>` can renumber after an `erase`, so re-check names after cutting.
- Opaque sheets (no key colour) need an explicit `background` palette in the recipe; see
  `art-source/level-1/level-1-props.recipe.json`.
- `tools/pack` writes atlases and backdrops under `public/assets/` (gitignored; `npm run assets`, also run
  by `npm run build`). Atlas JSON shape is `AtlasJson` in `src/content/atlas.ts`; pivots are in atlas pixels
  from the frame's top-left.
- `tools/validate` and `tools/validate/budget.ts` fail the build on malformed content, missing pipeline
  output, or oversized payload. Budgets are in `tools/config.ts`; raise them in a PR with a stated reason.
- Details: `docs/TDD.md` section 7.

## Testing discipline

- New sim behaviour: unit test first, then a replay test that exercises it in a level.
- Bug found in browser: reproduce in the lowest layer that can express it (unit > replay > e2e), then fix.
- e2e specs run against the production build with software WebGL. Keep them few and stable.

## Commands

```bash
npm run dev            # Vite dev server, http://localhost:5173
npm run ci             # lint, typecheck, unit, replay, validate, build (with budget), e2e
npm run test -- -w     # watch unit tests
npm run assets         # regenerate atlases + backdrops from art-source/ recipes
npm run recut <recipe> # segment one sheet and write its preview
npm run recut:review <recipe>  # browser review UI
npm run replay:record  # re-record replay fixtures from the scripted bots
npm run level:from-tiled <map.json> <out.json> --id <id> --name <name>  # convert a Tiled map
```

## Three.js 0.186 notes

- Import from `three`; addons from `three/addons/...` (e.g. `three/addons/loaders/KTX2Loader.js`).
- Color management is on by default; textures used as colour need `colorSpace = SRGBColorSpace`.
- `postprocessing` (pmndrs) will be the effects library from Phase 4, not `three/addons/postprocessing`.
- `WebGLRenderer.setSize(w, h, false)` leaves CSS sizing to the stylesheet; the canvas is 100% of `#game-root`.
