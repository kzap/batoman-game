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

E2E specs live in `tests/e2e/*.spec.ts` (`smoke.spec.ts`, `level.spec.ts`). They run against `vite preview`
on port 4173 with software WebGL (`--use-angle=swiftshader`) so they behave the same on CI runners, one
worker at a time (parallel SwiftShader pages halve each other's frame rate). `level.spec.ts` writes
screenshots to `e2e-screenshots/` (start, debug overlay, one-way section, mover section); look at them after
a render change. The frame budget floor is 20 fps under SwiftShader; the measured value is logged.

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
| `status` | `playing`, `complete`, or `gameover` |
| `replay(fixture)` | restart and feed a replay fixture (`tests/replay/fixtures/*.json`) instead of the keyboard |
| `errors` | uncaught errors and unhandled rejections captured in-page |

A healthy session has `errors: []`, `simTicks` growing at roughly `2 x frames` at 60 fps while `status` is
`playing` (it freezes after completion or game over until a jump restarts), and
`droppedFrames` staying near 0 after the first second.

### Workflow

1. Navigate to `http://localhost:5173`; wait for `window.__batoman.ready === true`.
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
| Fire | Z / J (tap; charged shot arrives with combat) |
| Debug overlay | backtick: stats bottom-left plus collider outlines |
| Restart | jump after LEVEL COMPLETE / GAME OVER |

Poses reported in `player.pose`: `idle run jump fall wallslide dash crouch slide hurt dead`.

Query flags: `?post=0` disables the post stack (bloom, vignette, grain) to isolate a rendering problem;
`?dof=1` enables depth of field. Only some poses have their own art; see `PlayerAnimator`
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

## Reporting

After a session report: what was tested, screenshots captured, contents of `__batoman.errors` and the
console, pass/fail per feature, and for each failure which layer (sim / render / app) owns it.
