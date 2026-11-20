---
name: game-testing
description: Use this skill to test the BatoMan game running in the browser using Playwright MCP or the Playwright test suite. Use when asked to verify gameplay, check for visual bugs, test controls, or validate that a feature works correctly in the browser.
---

# BatoMan Game Testing

Two routes. Prefer the test suite for anything repeatable; use Playwright MCP for exploratory checks.

## Route A: the test suite (preferred)

```bash
npm run test          # unit tests over src/core and src/game (headless, no browser)
npm run test:replay   # recorded-input replays against the headless sim
npm run build         # required before e2e: e2e serves dist/ as-is and does not rebuild
npm run test:e2e      # Playwright against the production build in dist/
npm run ci            # everything, in CI order
```

E2E specs live in `tests/e2e/*.spec.ts` (`smoke.spec.ts`, `level.spec.ts`, `editor.spec.ts`). They run against `vite preview`
on port 4173 with software WebGL (`--use-angle=swiftshader`) so they behave the same on CI runners, one
worker at a time (parallel SwiftShader pages halve each other's frame rate). `level.spec.ts` writes
screenshots to `e2e-screenshots/` (start, debug overlay, one-way, mover and dash sections, Level 3 and 6
start/complete, editor open/created); look at them after a render change. The frame budget floor is 20 fps
under SwiftShader; the measured value is logged.

Replay fixtures are recorded from routes in `tests/replay/bots.ts` (step language in `route.ts`). After
changing a level or the player tuning: `npm run replay:trace -- level-1` shows where the route stalls or
dies, fix the route or the level, then `npm run replay:record` and commit the fixture diff.

Add a spec when a bug is found in the browser that the unit/replay layers cannot catch (rendering, input
plumbing, DOM HUD). Anything about movement, collision, or game rules belongs in `tests/unit` or
`tests/replay`, not e2e.

## Route B: Playwright MCP (exploratory)

Install once:
```bash
claude mcp add playwright -s user -- npx -y @playwright/mcp@latest
```

Start the dev server:
```bash
npm run dev   # http://localhost:5173
```

### Test hooks

The app exposes `window.__batoman` for assertions. Read it with `page.evaluate`:

| Field | Meaning |
|---|---|
| `version` | package.json version |
| `ready` | true once the render loop has started |
| `frames` | rendered frames since boot |
| `simTicks` | fixed-step sim ticks since boot (120 Hz) |
| `droppedFrames` | frames where the clock discarded time (stall recovery) |
| `lastFrameMs` | last frame duration |
| `player` | `{ x, y, pose, hp }` from the latest snapshot; sim pixels, Y up, feet at `y` |
| `camera` | `{ x, y }` camera centre in sim pixels |
| `enemies` | `[{ type, pose, x, hp }]` live enemies from the latest snapshot (dying ones show `pose: 'death'` until dropped) |
| `boss` | null, or `{ hp, phase, engaged }`; `engaged` flips when the player reaches the arena and the HUD bar appears |
| `entities` | sprites the entity view is showing: player + enemies + shots + movers |
| `status` | `playing`, `complete`, or `gameover` |
| `level` | id of the loaded level |
| `mode` | `play`, `paused` (shell froze the sim: menus, intro card), or `edit` while the editor has it |
| `screen` | shell screen: `title`, `levelSelect`, `intro`, `playing`, `paused`, `complete`, `gameover`, `credits` |
| `score` | run score shown in the HUD |
| `music` | track id requested (`level-1`, `level-2`), null before the shell asks for one |
| `audio` | true once the AudioContext is running (after the first key or pointer) |
| `editor` | null, or `{ tool, selection, objects, revision, dirty, lastSave, playing }` while `?edit=1` is attached |
| `replay(fixture)` | restart and feed a replay fixture (`tests/replay/fixtures/*.json`) instead of the keyboard |
| `errors` | uncaught errors and unhandled rejections captured in-page |

A healthy session has `errors: []`, `simTicks` growing at roughly `2 x frames` at 60 fps while `status` is
`playing` (it freezes after completion or game over until a jump restarts), and
`droppedFrames` staying near 0 after the first second.

### Workflow

1. Navigate to `http://localhost:5173` for the title (press Enter twice to start Level 1 through the intro
   card) or `http://localhost:5173/?level=level-1` to start in a level directly; wait for
   `window.__batoman.ready === true`. `Esc` pauses; menus take Enter/Esc/arrows.
2. Screenshot the initial state.
3. Drive input with `keyboard.down` / `keyboard.up` (hold durations matter for variable jump and charge).
4. Screenshot after each action; compare against the expected state.
5. Read `window.__batoman.errors` and the console; both must be empty.

Controls (`src/app/keyboard.ts`):

| Action | Keys |
|---|---|
| Move | Arrow keys or A / D |
| Jump | Up / W / Space (release early for a shorter jump; down + jump drops through one-way platforms) |
| Crouch / slide | Down / S (slide when moving) |
| Dash | X / K / Shift |
| Fire | Z / J tap for plasma; hold 0.8 s and release for a piercing nova |
| Debug overlay | backtick: stats bottom-left plus collider outlines |
| Menus | Enter confirm, Esc back/pause, P pause, arrows move; M music, N sfx |

Poses reported in `player.pose`: `idle run jump fall wallslide dash crouch slide hurt dead`.

Query flags: `?level=<id>` loads a manifest level (`level-1`, `level-3`, `level-4`, `level-6`; an unknown id is a boot
error); `?edit=1` opens the level editor (keys listed in the panel tooltips and docs/TDD.md section 11; `P`
playtests, `Ctrl+S` saves through the dev server); `?post=0` disables the post stack (bloom, vignette, grain)
to isolate a rendering problem; `?dof=1` enables depth of field. Only some poses have their own art; see `PlayerAnimator`
(`src/render/animator.ts`) for which frames `fall`, `wallslide`, `dash`, `crouch`, `slide` and `dead` borrow.

## Common issues

| Symptom | Likely cause |
|---|---|
| Black canvas, `frames` growing | Camera not looking at Z=0, or scene empty; check `Stage.addReferenceScene` equivalents |
| Black canvas, `frames` = 0 | WebGL context failed; check console for `THREE.WebGLRenderer` errors |
| `errors` non-empty | Read the message; uncaught exceptions in the frame loop stop rendering |
| `droppedFrames` climbing | Sim step too slow or frame loop blocked; profile `World.step` |
| Motion stutters at steady fps | Render interpolation broken; check `alpha` use in `App.present` |
| Player passes through geometry | Sim bug: write a replay test that reproduces it before fixing |
| Sprite feet slide during animation | Atlas pivot wrong; fix the recipe in `tools/recut`, not the renderer |
| Boot fails with `boot failed: ...` in `errors` | An atlas or backdrop fetch failed; run `npm run assets` and `npm run validate` |
| Prop or backdrop missing but no error | Level `art` names a frame/stem the validator did not see; check `npm run validate` output |
| Visible seam or dark bar where a backdrop repeats | `edgeFade`/`erase` in `art-source/<level>/backdrops.json`, then `npm run assets` |
| Editor save reports 404 | The level id is not in `src/content/manifest.json`; add it, restart the dev server |
| Editor save reports problems | The level would fail `npm run validate`; the panel's problem list names the object |
| Editor decor hit box is off the art | The atlas frame's pivot is not centred; hit boxes follow the pivot fraction, so check the recipe |

## Reporting

After a session report: what was tested, screenshots captured, contents of `__batoman.errors` and the
console, pass/fail per feature, and for each failure which layer (sim / render / app) owns it.

## PR screenshots (`npm run shots`)

E2E keeps writing its own frames to `e2e-screenshots/` for the CI artifact. Pull request pictures are a separate command:

```bash
npm run shots                         # pr-shots/head/: title, level-1-start, level-1-mid, editor, level-1-walk.webm
npm run shots -- --baseline v2        # same filenames in pr-shots/baseline/
npm run shots -- --slug my-change     # copy into docs/pr-assets/my-change/ for the PR body
```

Checkable rules (the same list is in `AGENTS.md`):

- Viewport is 1280×720, SwiftShader, one page at a time. Before and after use the same filenames.
- Gameplay stills open with `?lockstep=1&ticksPerFrame=0`. If `window.__batoman.advance` exists, the mid shot is `advance(160)` and the start shot is `advance(8)`. If it does not, those flags are ignored and the same inputs are replayed on the production clock. The command must succeed when `advance` is absent.
- Open PR #27 (`infra/e2e-deterministic`) is what adds `advance`. Do not import it and do not wait on it. After it merges, `advance` lands on the exact tick, so enemy phase matches across machines. Until then, one `npm run shots -- --baseline <ref>` run still lines the pair up: both sides replay, and tick 160 plus a full 8-tick frame still falls before the first enemy shot at tick 172. `manifest.json` records `mode`, `simTicks`, and `playerX`. Compare a pair only when both sides used the same mode.
- The walk clip omits the lockstep query so the video shows the run on the production clock.
- Commit the files the body shows under `docs/pr-assets/<slug>/`. After that commit, `npm run shots -- --links <slug>` prints markdown pinned to the full commit SHA: `https://github.com/kzap/batoman-game/raw/<40-char-sha>/docs/pr-assets/<slug>/<file>.png`. A branch name in that URL breaks when the branch is deleted and shifts if the branch is force-pushed. If the files are not in HEAD yet, the command prints the two-step flow (commit, then `--links`) and does not invent a URL. A relative path does not render: GitHub resolves PR-body links against `main`, and these PRs target `v2`. The `e2e-screenshots` artifact zip does not render inline. A webm URL is a download link; inline playback needs a GitHub attachment.
