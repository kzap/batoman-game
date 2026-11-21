# BatoMan v2 - Remake Plan

Status: Phases 0-7b and 8.1-8.3 are on `v2`. Level 6 source art and dressing landed with #33. Still open on
that level: the lying-path collider, Tikbalang-X, a second mid layer, and a dedicated music track. Level 3
source art is on `v2` (#32) and the level is still grey-box (no `art` block). The playtest build deploys
from `v2` to GitHub Pages (#24) and is live at https://mydev.org/batoman-game/. `main` still holds v1
(Phaser 3, tagged `v1-archive`) and is still the default branch. The remake stays on `v2`, one phase per PR,
and moves to `main` in Phase 9 once v0.2 is finished.

Playable set: Levels 1, 3, 4 and 6, in that order (`package.json` version `0.2.0`). Levels 1, 4 and 6 are
dressed. Level 3 is grey-box. The tikbalang sheet exists; the spawn never becomes an actor. Powerups are
absent from the schema, the sim and the HUD. Phase 9 has not started.

Priority: finish v0.2 before any new district. Dress Level 3 from the source art now in
`art-source/level-3/`, close the Level 6 leftovers (lying-path collider, tikbalang behaviour, its own music,
and a second mid layer if the upper roofs need it), then the rest of Phase 8: the 60 fps mid-laptop
sign-off, the results card, and the docs that still describe unbuilt systems. Levels 2, 5 and 7-10 wait.

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

## Playtest

`v2` publishes a production build to GitHub Pages on every push (#24, `.github/workflows/pages.yml`). The
build sets `VITE_BASE_PATH=/batoman-game/` and the workflow deploys that branch only. The playtest is live
at https://mydev.org/batoman-game/.

## Content gaps

Checked against `src/content/`, `art-source/` and `spawnEnemy`. Manifest order is 1, 3, 4, 6. Fixtures are the
undamaged clears in `tests/replay/fixtures/`.

| Level | Dressing | What is in the tree |
|---|---|---|
| 1 Tondo Sublevel Docks | Dressed | `art` block, `level-1-props`, `sky`/`town`, 58 decor quads. Full source set in `art-source/level-1/`. Patrollers, drones, and the `aswang` boss (patroller sheet, 1.6x, lilac). Fixture 5567 ticks. |
| 3 Quiapo Underground Chapel | Grey-box | No `art` block, so it still renders as boxes. Source art landed in #32: `background.png`, `foreground.png`, `tileset.png`, `backdrops.json` (`nave` / `chapel`), a props recipe, plus the older concept painting. Stealth, drone, patroller. No Sigbin boss. Music track `level-2`. Fixture 2642 ticks. |
| 4 NSA Tower Exterior | Dressed | `art` block, `level-4-props`, `skyline`/`street`, 86 decor quads. Source set complete (`background.png`, `foreground.png`, `tileset.png`, `backdrops.json`, 27-prop recipe). Patrollers, drones, one stealth. No boss; the PRD names none for Level 4. Music track `level-2`. Fixture 2802 ticks. |
| 6 Abandoned Rooftop Garden | Dressed | #33. `art` block, `level-6-props`, `sky`/`garden`, 144 decor quads, lift uses `platform_pallet`. Geometry unchanged. Drone, patroller, and a `tikbalang` at x 4100 that the sim drops. No Tikbalang-X boss. The painted lying path is not a collider. Music track `level-1`. Fixture 3954 ticks. |

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

Level 6 dressing is done. Level 3 dressing is the remaining content PR: the source files are in
`art-source/level-3/`, and the level JSON still needs an `art` block along the Level 1 path. The editor
still cannot add an `art` block or change `art.props` and backdrops (TDD section 11).

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
the pipeline. Drones and stealths gained a `sightHeight` (128 px) so an enemy does not react to the player climbing past on another
storey; the existing fixtures were unaffected. Route DSL gained `wallClimb`, `waitMoverSettling` and a
direction for `fight`. 86 decor quads; fixture 2802 ticks undamaged.

### Level 6 source art and dressing (`content/level-6`)

Merged as #33 onto `v2`. Source art for the Abandoned Rooftop Garden in the Level 1 inked-painterly style,
painted as a sunny lush rooftop farm (the approved brightness direction; ART.md's earlier night-rain row is
updated to match), plus the data-only dressing. Geometry is unchanged.

- `art-source/level-6/`: `background.png`, a mirrored 2560-wide `foreground.png` that tiles without a seam,
  `backdrops.json`, `tileset.png`, and a 29-prop recipe.
- `src/content/levels/level-6.json`: `art` block, 144 decor quads, the lift mover uses `platform_pallet`.
  `level-6-clear` stays 3954 ticks.
- Packed: atlas 636 KB, sky 104 KB, garden 378 KB (about 1.12 MB for Level 6). Served total 8.53 MB / 12 MB.

Still open, and each needs code rather than more painting: a fake-solid collider for the lying path, the
Tikbalang-X boss (the spawn at 4100 is still a scout with no behaviour), a possible second mid layer for
the upper roofs, and a music track of its own (the manifest still points Level 6 at `level-1`).

Exit: Level 6 loads dressed, the existing clear fixture completes, and e2e asserts the atlas and both
backdrops and screenshots the start, the lift, and the last roof.

### Phase 8 - Polish and performance (`phase/8-polish-perf`)

Split on `v2`. The original scope stands. 8.1 through 8.3 have landed. The exit has not.

- Instancing, culling, texture compression, far-layer LOD. Remappable input, reduce-motion,
  colourblind-safe weak points. Docs rewritten to match the code.

#### Phase 8.1 - Instancing, culling, KTX2, far LOD (#31)

Merged. Decor is one `InstancedMesh` per layer, screen-sized chunk, frame and flip (`batches.ts`), so
crates at the other end of a level are frustum-culled. Backdrop planes are tiled the same way, and a
content band drops empty rows (Level 4's keyed street). Far backdrops pack smaller (`farLodDimensions`);
the mid layer stays full resolution. Backdrops are also ETC1S KTX2, fetched when the GPU reports S3TC or
BC7; WebP stays the software-GL fallback. Atlases are still WebP. A cloud-VM SwiftShader probe, not a mid
laptop, moved post-on Level 1 from about 6 fps to about 11 fps. The 60 fps mid-laptop sign-off was not
taken: that probe had no GPU to sample. The older laptop numbers (grey-box 60 fps, dressed art 37-41 fps)
predate 8.1.

#### Phase 8.2 - Remappable keyboard (#38)

Merged. `bindings.ts` maps each sim button to one to four physical keys and saves the table in
`batoman.v2.save`. The Controls screen is on the title and on pause. Escape, Enter, P, M, N, R and
backtick stay reserved, so a remap cannot trap pause, the menus, or the reduce-motion toggle. Gamepad
mapping is out of scope. Rebinding does not change packed input, so the clear fixtures stay valid.

#### Phase 8.3 - Reduce-motion and colourblind-safe weak points (#39)

Merged. `options.reduceMotion` is true, false, or null (follow `prefers-reduced-motion`). R toggles it
and writes the save; `?reduceMotion=` overrides the session until then. It holds shake, grain, the
weak-point pulse, and the invulnerability blink. The boss core is a magenta diamond with a white outline,
drawn only while exposed. The outline is the second channel. There is no colour-blind post pass. Other
enemies still have no weak-point marker.

Still open:

- The exit. 60 fps on a mid laptop has not been signed off. The new number is the cloud-VM probe above.
- E2E gameplay no longer depends on render speed (#27). Those tests step the sim in lockstep
  (`VITE_E2E_LOCKSTEP`, `tests/e2e/drive.ts`). `npm run test:e2e:perf` is a separate job with a
  hosted-runner floor (1 fps, 4 ticks/s), retuned after ubuntu-latest measured about 5 fps and 20 ticks/s
  on 2026-11-20. The old 20 fps / 110 ticks/s gate is gone.
- Shell. The results card still lists time, hearts left and score, and `complete` is still `dim: false`.
  ART's dim, spotlight and score tally are unbuilt. Title, level select and game over are still text.
  `art-source/level-select.png` is unused. The salakot title and the salakot game-over screen are unbuilt.
- Docs. `docs/TDD.md` matches the code through 8.3, except the tikbalang line "drawn if placed" (the spawn
  is dropped, so nothing is drawn). `docs/PRD.md` is still the v0.1 ten-district spec, plus the 8.2 remap
  note. `docs/ART.md` still specifies the powerup timer and those unbuilt screens; 8.3 updated the
  weak-point row.

Exit: 60 fps on a mid laptop; docs current.

### Phase 9 - `v2 -> main`

Not started. Open it only after v0.2 is finished: Level 3 dressed, the Level 6 leftovers closed (including
tikbalang behaviour), and Phase 8's exit met.

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
