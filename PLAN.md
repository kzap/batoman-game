# BatoMan v2 - Remake Plan

Status: Phases 0-7b and 8.1-8.3 are on `v2`. The tip is `f92ab08` (tikbalang scout, #26). Level 6 is dressed (#33).
Level 3 has source art (#32) and its level JSON is still grey-box. The playtest build deploys from `v2`
(#24) and is live at https://mydev.org/batoman-game/. `main` still holds v1 (Phaser 3, tagged `v1-archive`)
and is still the default branch. Node is `^20.19 || >=22.12` (`package.json` `engines`).

The game is five levels, one themed boss each, as set out in `docs/VISION.md` (#25, now on `v2`). The tree
today ships four level files. The finale is the fifth, not built yet.

| Order | Id | Boss | Where it stands |
|---|---|---|---|
| 1 Tondo docks | `level-1` | ASWANG prototype | Shipped |
| 2 Quiapo chapel | `level-3` | Sigbin Unit | Source art on `v2`. Dressing is #14. The boss is #41, open |
| 3 NSA tower | `level-4` | Manananggal-7 | Dressed. No boss in the tree. Andre confirmed this boss on #25 |
| 4 Rooftop garden | `level-6` | Tikbalang-X | Dressed. Scout AI landed in #26. The boss is unbuilt |
| 5 Destroyed block | proposed `level-5` | Bakunawa-Prime | Not in the tree |

Whether v0.2 grows to include the unbuilt bosses is still an open question for Andre.

Priority until that call: dress Level 3 (#14) and finish the Phase 8 remainder (#40 results card, the
60 fps mid-laptop sign-off). The scout AI is in (#26). Still open beside that: the #11 coverage pins, the
lying-path collider, a second mid layer, a Level 6 music track, and Tikbalang-X itself.

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
| Levels for v0.2 | 1 (Tondo docks), 3 (Quiapo chapel), 6 (rooftop garden) + Level 1 boss. Level 4 joined in Phase 7b. Boss scope beyond the ASWANG is Andre's open question (PR #25) |
| Props | Textured quads only; no glTF meshes in v0.2 |
| Git history | Untouched. No rewrite. New heavy files must not enter `public/` |
| Node | `^20.19 || >=22.12` |
| Branching | All work on `v2`. Branch prefixes: `phase/`, `content/`, `infra/`, `cursor/`. PRs target `v2` |

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

Branch policy: all work on `v2`. Cut `phase/N-slug`, `content/<level>`, `infra/<slug>`, or `cursor/<slug>`
from `v2`. PRs target `v2`. Run `npm run ci` before the PR.

PR process: author merges after a teammate review and green CI. See CONTRIBUTING.md.

```
git checkout v2 && git pull
git checkout -b phase/N-<slug>          # or content/, infra/, cursor/
# implement; npm run ci green
# code-review skill: standards + spec; address findings
git push -u origin <branch>
gh pr create --base v2 --head <branch>
```

`npm run ci` is lint, unit, replay, build, `check:prod-bundle`, `build:e2e` (lockstep), `check:e2e-bundle`,
the e2e gate, and e2e perf. The perf job in `.github/workflows/ci.yml` is blocking: it has no
`continue-on-error`, so a miss fails the workflow. `playwright.config.ts` lines 32-33 and `README.md` line 41
still say perf is outside `npm run ci` and that CI runs it as a non-blocking job. That mismatch is for Ari.
This plan does not edit those files.

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
| 3 Quiapo Underground Chapel | Grey-box JSON | Source art is on `v2` (#32): `background.png`, `foreground.png`, `tileset.png`, `backdrops.json` (`nave` / `chapel`), a props recipe, plus the older concept painting. No `art` block, so it still renders as boxes. Remaining: #14 dresses it, #41 adds the Sigbin Unit. Stealth, drone, patroller. Music `level-2`. Fixture 2642 ticks. E2E loads it as grey-box. |
| 4 NSA Tower Exterior | Dressed | `art` block, `level-4-props`, `skyline`/`street`, 86 decor quads. Patrollers, drones, one stealth. No boss in the tree. PR #25 names Manananggal-7; that fight is not built. Music `level-2`. Fixture 2802 ticks. E2E asserts the atlas and both backdrops. |
| 6 Abandoned Rooftop Garden | Dressed | #33. `art` block, `level-6-props`, `sky`/`garden`, 144 decor quads, lift uses `platform_pallet`. E2E asserts the atlas and both backdrops and screenshots the start, the lift, the checkpoint roof, and the last roof. Drone, patroller, and a tikbalang scout at x 4100 (#26: burst chase and stomp). Music `level-1`. Fixture 4059 ticks, undamaged. |

Tikbalang. The scout landed in #26 (`src/game/enemies/tikbalang.ts`). It patrols in bursts, then on the
player's storey it chases and stomps; a jump clears the lunge. `spawnEnemy` builds it. The clear route
shoots the burst and jumps the stomp. `level-6-clear` is 4059 ticks, undamaged. Issue #11 still names the
coverage gate that PR did not add to e2e: the tikbalang atlas is requested, a rooftop screenshot is taken
where the scout stands, and no enemies are left at the exit. Tikbalang-X, the boss, is unbuilt.

Powerups. Nothing in the sim yet: no pickup field, no collector, no HUD timer. The first one is HP Up.
Issue #12 specifies it, and PR #29 (`phase/6.2-hp-up`) implements it. The other PRD pickups wait.

Level 6 dressing is done. Level 3 dressing is #14: the source files are in `art-source/level-3/`, and the
level JSON still needs an `art` block. The editor still cannot add an `art` block or change `art.props` and
backdrops (TDD section 11). The Sigbin Unit is a separate PR, #41.

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

Outcome: the shell shipped. Level 6 is dressed (#33). Level 3 has source art (#32) and its level JSON
is still grey-box, so it renders as boxes until #14 adds the `art` block.

### Phase 7b - Level 4, NSA Tower Exterior (`content/level-4`)

Added after Phase 7: the only level besides Level 1 with complete source art (`art-source/level-4/`
background, foreground, tileset, 27-prop recipe already building), unused since v1.

- Manifest entry (name, music), grey-box layout in the editor: vertical tower exterior with scaffolds,
  one-way ladders, wall-jump shafts, lifts and drones; no boss in the tree. VISION.md (PR #25) names
  Manananggal-7, which Andre confirmed.
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
  `level-6-clear` is 4059 ticks after the scout (#26).
- Packed: atlas 636 KB, sky 104 KB, garden 378 KB (about 1.12 MB for Level 6). Served total 10.93 MB / 20 MB at 188085ca914e34a66c7482b5f8496a0682336dae, 2026-11-20.

Still open, and each needs code rather than more painting: a fake-solid collider for the lying path, the
Tikbalang-X boss (the spawn at 4100 is the scout from #26, not that boss; #11 is the remaining coverage
gate), a possible second mid layer for the upper roofs, and a music track of its own (the manifest still
points Level 6 at `level-1`).

Exit: Level 6 loads dressed, the existing clear fixture completes, and e2e asserts the atlas and both
backdrops and screenshots the start, the lift, the checkpoint roof, and the last roof. That exit is met.
#11 adds the scout atlas request, the rooftop screenshot, and no enemies left at the exit once #26 lands.

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

Merged, including `tests/e2e/a11y.spec.ts`. `options.reduceMotion` is true, false, or null (follow
`prefers-reduced-motion`). R toggles it and writes the save; `?reduceMotion=` overrides the session until
then. It holds shake, grain, the weak-point pulse, and the invulnerability blink. The boss core is a
magenta diamond with a white outline, drawn only while exposed. The outline is the second channel. There
is no colour-blind post pass. Issue #19 is still open only because #39 did not reference it. The work
itself is on `v2`.

E2E (#27). Gameplay tests step the sim in lockstep (`VITE_E2E_LOCKSTEP`, `tests/e2e/drive.ts`). The perf
floors in `tests/e2e/level.spec.ts` are `MIN_FPS` 1 and `MIN_TPS` 4. `v2` CI is green. See the workflow
section for the perf-job mismatch Ari should fix.

Still open:

- The exit. 60 fps on a mid laptop has not been signed off. The cloud-VM probe above is the new number.
- Results card, #40 (`phase/8.4-results-polish`). The card lists time, hearts left and score, and
  `complete` is still `dim: false`. ART's dim, spotlight and score tally are that PR.
- Docs. `docs/TDD.md` matches the code through 8.3, except the tikbalang line "drawn if placed".
  `docs/PRD.md` is still the v0.1 ten-district spec, plus the 8.2 remap note. `docs/VISION.md` landed with
  #25. `docs/ART.md` still specifies the powerup timer; 8.3 updated the weak-point row.

Exit: 60 fps on a mid laptop; docs current.

### Phase 9 - `v2 -> main`

Not started. Open it after v0.2's close-out, and after Andre answers the boss-scope question on #25.

- One merge PR from `v2` into `main`. CI already runs on PRs to `main` and to `v2`. `npm run ci` first.
  No force-push, no history rewrite.
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
| Level 3 art segments differently from Level 1 | Level 4 needed a chroma key. Level 6 dressed on the same path. Level 3's source art is in and its `art` block is #14 |
