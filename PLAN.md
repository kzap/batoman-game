# BatoMan v2 - Remake Plan

Status: Phases 0-7b merged. Phase 7b (Level 4, NSA Tower Exterior) is PR #9, on `v2`. `main` still holds v1
(Phaser 3, tagged `v1-archive`) and is still the default branch. The remake stays on `v2`, one phase per PR,
and moves to `main` in Phase 9 once v0.2 is finished.

Playable set: Levels 1, 3, 4 and 6, in that order (`package.json` version `0.2.0`). Levels 1 and 4 are dressed.
Levels 3 and 6 are grey-box. The tikbalang sheet exists; the spawn never becomes an actor. Powerups are absent
from the schema, the sim and the HUD. Phase 8 and Phase 9 have not started.

Priority: finish v0.2 before any new district. Dress Levels 3 and 6, give the tikbalang behaviour, then Phase 8.
Levels 2, 5 and 7-10 wait.

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
| Levels for v0.2 | 1 (Tondo docks), 3 (Quiapo chapel), 6 (rooftop garden) + Level 1 boss. Level 4 joined in Phase 7b; its art already existed |
| Props | Textured quads only; no glTF meshes in v0.2 |
| Git history | Untouched. No rewrite. New heavy files must not enter `public/` |
| Branching | All work on `v2`. Branches `phase/N-slug` or `content/<level>` off `v2`; PRs target `v2` |
| Merge gate | `npm run ci` before the PR. Implementer opens it, code-review skill first. Only Andre merges |

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
billboards at Z=0 with per-frame pivots. Phase 4 outcome: painted art (backdrops, props, sprites) is unlit
so the paintings keep their own light; the amber key and cyan rim lights remain for lit placeholder geometry.
Level 1 uses two backdrop slots (far -60, mid -8) plus three decor layers (wall, prop, front).

## Workflow per phase

Branch policy: all work on `v2`. Branches are `phase/N-slug` or `content/<level>`, cut from `v2`. PRs target
`v2`. Run `npm run ci` before the PR. Only Andre merges.

```
git checkout v2 && git pull
git checkout -b phase/N-<slug>          # or content/<level>
# implement; npm run ci green
# code-review skill: standards + spec; address findings
git push -u origin <branch>
gh pr create --base v2 --head <branch>
# stop; Andre reviews and merges
```

One PR per phase. If a phase grows too large to review, split into `phase/N.1`, `phase/N.2`, all targeting
`v2`. No force-push. No history rewrite.

## Content gaps

Checked against `src/content/`, `art-source/` and `spawnEnemy`. Manifest order is 1, 3, 4, 6. Fixtures are the
undamaged clears in `tests/replay/fixtures/`.

| Level | Dressing | What is in the tree |
|---|---|---|
| 1 Tondo Sublevel Docks | Dressed | `art` block, `level-1-props`, `sky`/`town`, 58 decor quads. Full source set in `art-source/level-1/`. Patrollers, drones, and the `aswang` boss (patroller sheet, 1.6x, lilac). Fixture 5567 ticks. |
| 3 Quiapo Underground Chapel | Grey-box | No `art` block. `art-source/level-3/` is one file, `concept-art-quiapo-catacombs.png`. No background, foreground, tileset, `backdrops.json` or props recipe. Stealth, drone, patroller. No Sigbin boss. Music track `level-2`. Fixture 2642 ticks. |
| 4 NSA Tower Exterior | Dressed | `art` block, `level-4-props`, `skyline`/`street`, 86 decor quads. Source set complete (`background.png`, `foreground.png`, `tileset.png`, `backdrops.json`, 27-prop recipe). Patrollers, drones, one stealth. No boss; the PRD names none for Level 4. Music track `level-2`. Fixture 2802 ticks. |
| 6 Abandoned Rooftop Garden | Grey-box | No `art` block and no `art-source/level-6/` directory. Drone, patroller, and a `tikbalang` at x 4100 that the sim drops. No Tikbalang-X boss. Music track `level-1`. Fixture 3954 ticks, past an empty spawn. |

Tikbalang. The sheet and recipe are real (`art-source/characters/tikbalang.recipe.json`: idle, run, stomp, hurt,
death, projectile). `tools/pack` picks up every recipe, `ENEMY_LOOK` points at that atlas, and the score table
already pays 500. Level 6 lists the spawn, so the atlas is fetched. `spawnEnemy` returns null and `World` skips
a null, so there is no actor, no collision, no drawing and no kill. There is no behaviour class and no unit
test. The TDD line "drawn if placed" is ahead of the code. Giving it behaviour will change the Level 6 route
and fixture; re-record with `npm run replay:record`.

Powerups. Absent. The PRD lists four permanent (HP up, plasma upgrade, dash upgrade, armor shard) and four
temporary (speed, invincibility, nova overcharge, double jump), and ART.md specifies a bottom-left timer. The
level schema has no pickup field, the sim has no collector, and `Hud` has no timer. No phase owns this yet, and
it is outside the current v0.2 finish line.

Also specified, also unbuilt, also waiting: districts 2 (Divisoria), 5 (Skyway), 7 (Laboratoryo Zero),
8 (Floodgates), 9 (Arcology) and 10 (Destroyed City Block). Crumbling platforms, destroyable blocks,
forcefields and rising water. A sniper type (Level 4's PRD theme). Unique sheets for stealth and the aswang;
both reuse the patroller until their own art exists. Music is two tracks, `level-1` (Tondo Sublevel) and
`level-2` (Divisoria).

Dressing 3 and 6 is still the Phase 7 content PR. It waits on art, not on code: `art-source/level-<n>/` needs
`background.png`, `foreground.png`, `backdrops.json`, `tileset.png` and a props recipe, then the Level 1 path.
The editor still cannot add an `art` block or change `art.props` and backdrops (TDD section 11).

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

Outcome: everything but the dressing shipped; Levels 3 and 6 have no source art (Level 3 one concept
painting, Level 6 nothing), so they stay grey-box until art exists. Dressing each is a one-day content PR
once `art-source/level-<n>/` has `background.png`, `foreground.png`, `backdrops.json`, `tileset.png` and a
props recipe, following Level 1.

### Phase 7b - Level 4, NSA Tower Exterior (`content/level-4`)

Added after Phase 7: the only level besides Level 1 with complete source art (`art-source/level-4/`
background, foreground, tileset, 27-prop recipe already building), unused since v1.

- Manifest entry (name, music), grey-box layout in the editor: vertical tower exterior with scaffolds,
  one-way ladders, wall-jump shafts, lifts and drones; no boss (PRD has none for Level 4).
- `backdrops.json`, `art` block, dressed with `level-4-props`.
- Route bot and fixture (undamaged clear), e2e load check, TDD level table.

Exit: Level 4 playable and dressed, in the level select after Level 3, fixture green.

Merged as PR #9 (`content/level-4` into `v2`). Outcome: as planned, plus two things the vertical layout forced.
The foreground art came on a solid magenta background, so backdrop layers gained a `key` chroma-key option in
the pipeline. Drones and
stealths gained a `sightHeight` (128 px) so an enemy does not react to the player climbing past on another
storey; the existing fixtures were unaffected. Route DSL gained `wallClimb`, `waitMoverSettling` and a
direction for `fight`. 86 decor quads; fixture 2802 ticks undamaged.

### Phase 8 - Polish and performance (`phase/8-polish-perf`)

Not started. No branch, no PR. Scope stays:

- Instancing, culling, texture compression, far-layer LOD. Remappable input, reduce-motion,
  colourblind-safe weak points. Docs rewritten to match the code.

Still open, checked against the tree:

- Performance. Decor is one mesh per quad (58 on Level 1, 86 on Level 4). Nothing uses `InstancedMesh`.
  Those meshes keep Three's default frustum cull; there is no distance cull and no far-layer LOD. The
  particle `Points` set `frustumCulled = false`. Atlases are WebP. KTX2/Basis stays deferred until a
  measured GPU-memory or decode cost justifies it (TDD 7.3). Recorded SwiftShader numbers at 1280x720:
  grey-box 60 fps, dressed art with the post stack 37-41 fps. The 60 fps mid-laptop sign-off has not been made.
  GitHub Actions e2e on `ubuntu-latest` is already red on `v2` (Phase 7b push, run 34925934706): dressed
  Level 1 came in around 4 fps and 15 ticks/s, under the 20 fps / 110 ticks/s floor in `tests/e2e/level.spec.ts`.
  The 1.5 s screenshot walk fails with the camera still clamped at 336, and the editor playtest is flaky on
  the same clock. The headless replays and the scripted fixture traversals pass.
- Input. `src/app/keyboard.ts` is a fixed `BINDINGS` map (arrows/WASD, Space/W/Up jump, Z/J fire,
  X/K/Shift dash). Nothing rebinds it. PRD v0.1 left a remapping UI out of scope; this phase is where it
  comes in.
- Reduce-motion. No `prefers-reduced-motion` path. Camera shake, grain, vignette and the two-frame boss
  hit-stop always run.
- Weak points. The boss core is a magenta orb, drawn only while stunned. Other enemies have no weak-point
  marker. There is no second channel besides colour.
- Shell, already named as Phase 8 polish in the TDD. The results card shows time, hearts left and score,
  and its presentation is `dim: false`, so the canvas stays bright. ART's dim, spotlight and score tally
  are unbuilt. Title, level select and game over are text cards. `art-source/level-select.png` is unused.
  The salakot title and the salakot game-over screen are unbuilt.
- Docs. `docs/TDD.md` matches the code through Phase 7b, except the tikbalang "drawn if placed" line above.
  `docs/PRD.md` is still the v0.1 ten-district spec, powerups and bosses included. `docs/ART.md` still
  specifies the powerup timer and those unbuilt screens. This plan was one phase behind until this refresh.
  Bringing PRD and ART into line with what shipped, and marking the rest as later targets, is this phase.

Exit: 60 fps on a mid laptop; docs current.

### Phase 9 - `v2 -> main`

Not started. Open it only after v0.2 is finished: Levels 3 and 6 dressed, tikbalang behaviour in, Phase 8's
exit met.

- One merge PR from `v2` into `main`. CI already runs on PRs to `main` and to `v2`. `npm run ci` first.
  Andre merges. No force-push, no history rewrite.
- `main` today is the Phaser prototype, the same commit as tag `v1-archive`. After the merge, `main` is
  the Three.js game. The tag stays, and it is what preserves v1.
- The remote default branch is already `main`, so the merge is what retires v1 on the default branch.
  Leave the tag. Leave history alone.
- The `v2` README says `main` holds v1 until the remake is playable. Update that sentence in the merge PR.

Exit: `main` is the remake, `v1-archive` still points at the Phaser game, CI on the merge PR is green.

## Risks

| Risk | Mitigation |
|---|---|
| Segmenter misreads a sheet | Human review step; committed, diffable recipes |
| 2.5D hurts jump readability | FOV 30; feel signed off in grey-box (Phase 3); orthographic fallback |
| Phase PR too large | Split into sub-PRs targeting `v2` |
| Level 3/6 art segments differently from Level 1 | Level 4 was the check, and its foreground needed a chroma key Level 1 did not. Expect a pipeline tweak when 3 and 6 are dressed |
