# BatoMan v2 - Remake Plan

Status: Phases 0-1 merged; Phase 2 in review. `main` still holds v1 (Phaser 3, tagged `v1-archive`). The remake lands on
the `v2` branch one phase per PR, then merges to `main` when playable.

## Why a remake

v1's bugs trace to two root causes, neither in gameplay code:

1. **The asset pipeline assumed grids that do not exist.** `tileset.png` is an illustration, not a 32 px
   tileset (the map used 9 of 4224 GIDs). `batoman-sprites.png` has rows of 10/11/9/9/8 frames of varying
   size; `frameWidth: 176` misaligned every animation. `fix_sprites.py` did global colour-key removal,
   which ate same-coloured pixels inside sprites. Three of four tile layers were empty. ~160 MB of PNG was
   served from `public/`, mostly concept art.
2. **Physics was fudged, not specified.** Death zone below the world with `collideWorldBounds` on; instant
   death swallowed by the hurt-stun guard; fire on key release; parallax seam from a 768/736 px mismatch;
   mixed texture-px/display-px hitbox conventions.

## Decisions

| Question | Decision |
|---|---|
| Rendering | 2.5D: Three.js renderer, 2D gameplay on Z=0, perspective camera, FOV 30 |
| Physics | Hand-rolled Actor/Solid swept AABB at fixed 120 Hz; deterministic, headless, unit-tested |
| Art | Auto-recut the existing AI sheets into pivot-annotated atlases with a human review step |
| Codebase | Fresh `src/`; nothing ported blindly |
| Tests | Vitest unit + headless replay + Playwright e2e + build-time asset validation and payload budget |
| Levels for v0.2 | 1 (Tondo docks), 3 (Quiapo chapel), 6 (rooftop garden) + Level 1 boss |
| Props | Textured quads only; no glTF meshes in v0.2 |
| Git history | Untouched. No rewrite. New heavy files must not enter `public/` |
| Branching | Worktree `../batoman-game-v2` on `v2`; `phase/N-slug` branches; PRs target `v2` |
| Merge gate | PRs opened by the implementer, reviewed with the `code-review` skill first, merged by the owner |

## Architecture

```
src/
  core/      math, Actor/Solid physics, FSM, buffered input, FixedClock, EventBus   (headless)
  game/      player, weapons, enemies, damage, checkpoints, level runtime           (headless)
  render/    Three.js Stage, diorama layers, billboards, props, interpolation
  app/       frame loop, input devices, DOM HUD, audio, save, test hooks
  content/   level JSON + atlas manifests
tools/
  recut/     sheet segmenter + review UI  ->  *.recipe.json (committed)
  pack/      atlas packer -> public/assets/atlases (generated, gitignored)
  validate/  content checks + payload budget (fail the build)
art-source/  raw AI art; never served
tests/
  unit/  replay/  e2e/
```

Dependency direction is `core <- game <- render/app`, enforced by ESLint.

### 2.5D layout

Camera on +Z at distance 22, FOV 30, looking at Z=0. Diorama layers at Z = -8 / -25 / -60 / -150, unlit,
fog only; parallax comes from camera motion. Foreground dressing at +5 / +15. Characters are alpha-tested
billboards at Z=0 with per-frame pivots. Z=0 gets an amber key and cyan rim light so silhouettes read
against the art (ART.md's readability rule).

## Workflow per phase

```
git checkout v2 && git pull
git checkout -b phase/N-<slug>
# implement; npm run ci green
# code-review skill: standards + spec; address findings
git push -u origin phase/N-<slug>
gh pr create --base v2 --head phase/N-<slug>
# stop; owner reviews and merges
```

One PR per phase. If a phase grows too large to review, split into `phase/N.1`, `phase/N.2`, all targeting
`v2`. No force-push. No history rewrite.

## Phases

### Phase 0 - Foundation (`phase/0-foundation`)

- Worktree and `v2` branch; `main` tagged `v1-archive`.
- Fresh `src/` skeleton with `FixedClock`, `EventBus`, `Vec2`/`AABB`, a placeholder `World`, a Three.js
  `Stage` rendering a grey-box reference scene with layered backdrops, and an `App` loop exposing
  `window.__batoman` test hooks.
- `tools/validate` (content: no raw art or unpipelined images in `public/`) and `tools/validate/budget.ts`
  (payload) both wired into `npm run build`.
- Vitest unit + replay projects; Playwright e2e smoke against the production build.
- GitHub Actions CI on PRs to `v2`/`main`.
- Raw art moved to `art-source/`; v1 code, root scripts, `fix_sprites.py`, and the `phaser-dev` skill
  removed; `three-dev` skill added; `game-testing` skill updated.

Exit: CI green. `npm run build` under budget. No raw art under `public/`.

### Phase 1 - Asset pipeline (`phase/1-asset-pipeline`)

- `tools/recut`: border-sampled background detection; flood-fill from the border (preserves enclosed
  same-colour regions; partial alpha on anti-aliased edges); watermark strip; connected components; row
  clustering by Y gaps; satellite merge (muzzle flash, particles); contact-region pivots with
  per-animation foot-slide stabilisation.
- Review UI (`npm run recut:review`) to correct splits/merges, name animations, scrub with pivots, and
  save `*.recipe.json`.
- `tools/pack` writes trimmed WebP (and KTX2 where supported) atlases + JSON.
- `tileset.png` becomes a prop catalogue of arbitrary-size quads.
- Segmenter unit tests against fixtures; one Level 4 sheet processed as a generality check.

Exit: `npm run assets` regenerates all Level 1 atlases from recipes; BatoMan animates with stable feet in
the review tool; Level 1 art payload is at most 10% of v1's.

### Phase 2 - Sim core (`phase/2-sim-core`)

- Actor/Solid solver: sub-pixel remainders, corner correction, one-way platforms, riders on moving solids.
- Controller: accel/decel curves, apex gravity reduction, variable jump, coyote time, jump buffer, wall
  slide/jump with lockout, dash with cooldown and i-frames, crouch-slide.
- Damage, i-frames, knockback; instant death bypasses hurt-stun; fire on press.
- Level JSON schema + loader; Level 1 geometry authored as colliders.
- Unit tests for each mechanic; replay harness with recorded inputs.

Exit: Level 1 completes headlessly under replay.

### Phase 3 - Stage and grey-box (`phase/3-stage-greybox`)

- Renderer mirrors sim entities by id with interpolation. Camera controller (deadzone, look-ahead,
  smoothing, bounds, shake) in `game/`, unit-tested.
- Debug overlay (backtick): colliders, tick rate, entity count.
- Playwright: frame-time budget, baseline screenshots, scripted traversal.

Exit: Level 1 grey-box at 60 fps; movement feel signed off before art.

### Phase 4 - Art integration (`phase/4-art-integration`)

- Diorama layers, character billboards, catalogue props aligned to colliders.
- Post stack: bloom on emissives, vignette, grain, optional DOF.

Exit: Level 1 matches the concept mood; replay tests unchanged.

### Phase 5 - Level editor (`phase/5-level-editor`)

- `?edit=1`: place/resize colliders, drop props, set Z, spawns, checkpoints; save through a dev-server
  endpoint to `src/content/`.
- Level 1 rebuilt as designed content; Levels 3 and 6 blocked out.

Exit: three levels load; Level 1 fully dressed.

### Phase 6 - Combat and enemies (`phase/6-combat-enemies`)

- Pooled projectiles, charge shot, hit reactions, GPU particles.
- Enemy behaviour FSMs (patrol, ranged, flying, stealth), unit-tested. Level 1 boss with phases.

Exit: Level 1 playable start to boss kill under replay.

### Phase 7 - Shell (`phase/7-shell`)

- Menus, DOM HUD, pause, audio buses with ducking, localStorage save. Levels 3 and 6 dressed.

Exit: full loop menu -> three levels -> credits.

### Phase 8 - Polish and performance (`phase/8-polish-perf`)

- Instancing, culling, texture compression, far-layer LOD. Remappable input, reduce-motion,
  colourblind-safe weak points. Docs rewritten to match the code.

Exit: 60 fps on a mid laptop; docs current.

### Phase 9 - `v2 -> main`

Single merge PR. `main` becomes v2; `v1-archive` preserves the old game.

## Risks

| Risk | Mitigation |
|---|---|
| Segmenter misreads a sheet | Human review step; committed, diffable recipes |
| 2.5D hurts jump readability | FOV 30; feel signed off in grey-box (Phase 3); orthographic fallback |
| Phase PR too large | Split into sub-PRs targeting `v2` |
| Level 3/6 art segments differently from Level 1 | Level 4 sheet processed in Phase 1 as a check |
