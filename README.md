# BatoMan

> A Filipino-inspired cyberpunk side-scrolling platformer - Neo-Maynila, 2147.

Play as **BatoMan**, a Tondo street kid with a plasma-buster prosthetic arm, fighting through
NSA-controlled districts to dismantle Project ASWANG and confront Dr. Epal.

This branch (`v2`) is a ground-up remake as a 2.5D platformer: a deterministic 2D simulation rendered with
Three.js. The original Phaser build is preserved at the `v1-archive` tag and on `main` until v2 is
playable. See [PLAN.md](PLAN.md) for the phase plan and current status.

---

## Running locally

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
npx playwright install chromium   # once, for e2e tests
npm run dev                        # http://localhost:5173
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Typecheck, content validation, production build to `dist/`, payload budget check |
| `npm run preview` | Serve `dist/` on port 4173 |
| `npm run lint` | ESLint (also enforces layer boundaries) |
| `npm run typecheck` | `tsc --noEmit` for `src/` and `tools/` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:replay` | Headless sim replay tests |
| `npm run replay:record` | Re-record the replay fixtures from the scripted routes (after a level or tuning change) |
| `npm run replay:trace -- <level>` | Print where a route's steps finish, for authoring levels and routes |
| `npm run build:e2e` | Production build plus `VITE_E2E_LOCKSTEP=1` (required before e2e; `npm run build` omits it) |
| `npm run test:e2e` | Playwright gate against that `dist/`. Asserts on sim ticks |
| `npm run test:e2e:perf` | Frame-budget floor calibrated for hosted runners; writes `perf-results.json` |
| `npm run validate` | Content checks: no raw art or unpipelined images in `public/`, manifest parses |
| `npm run ci` | Lint, unit, replay, build, and the e2e gate |

Gate e2e loads gameplay with `?lockstep=1` (e2e build only) and checks sim ticks or player state.
`window.__batoman.advance(n)` steps exactly `n` ticks. One smoke test stays on the real-time clock.

---

## Project structure

```
src/
  core/      pure TS: math, clock, events, collision, input, FSM, rng
  game/      gameplay rules on top of core; headless (player, enemies/, projectiles, world, camera)
  render/    Three.js stage, sprites, level and entity views, GPU particles, post
  app/       frame loop, DOM HUD, shell/ (menus, pause, save, score), audio/ (buses, procedural sfx, music), test hooks, styles
  editor/    in-browser level editor (?edit=1), loaded on demand
  content/   level JSON, manifest, validators
tools/       offline asset pipeline and validators (Node)
tests/       unit/ replay/ e2e/
art-source/  raw AI art; never served to the browser
public/      generated assets only (atlases, backdrops, audio; all gitignored, built by `npm run assets`)
docs/        PRD.md, TDD.md, ART.md, STORY.md
```

Dependencies flow one way: `core <- game <- render/app <- editor`. ESLint fails the build if `core` or `game` import
Three.js or touch the DOM.

Levels: `?level=level-4` loads another manifest level (`level-1`, `level-3`, `level-4`, `level-6`); `?edit=1` opens the current level in the editor, whose
`Ctrl+S` writes `src/content/levels/<id>.json` through the dev server after validating it.

Controls: arrows or A/D move, Down or S crouches, `Space`, `W` or `Up` jumps (down + jump drops through
platforms), `Shift` or `X` dashes, `Z` or `J` fires; hold `Z` for 0.8 s and release for a piercing nova.
`Esc` or `P` pauses, `Enter` confirms in menus, `M` and `N` toggle music and sound effects. The title menu
and the pause menu open Controls, where Enter on an action then a key adds or removes that key (one to four
keys per action; the last key cannot be removed). Reset to defaults restores the layout above. `Esc`,
`Enter`, `P`, `M`, `N` and backtick cannot be bound. Level 1 ends at the ASWANG prototype; the exit opens
when it falls. Progress (unlocked levels, best times, audio options, key bindings) is saved in `localStorage`.

Music sources live in `art-source/audio/` and are transcoded to Opus by `npm run assets` (via
`ffmpeg-static`); sound effects are synthesised in the browser, so there are no sample files.

---

## Contributing

Every pull request targets `v2`, from a `phase/N-slug`, `content/<level>`, or `infra/...` branch. The
author squash-merges once a teammate other than the author has left a review or comment on the PR
thread, that feedback is addressed, and the hosted checks are green. Andre's OK is not required for
each merge. What counts as a review, which checks must pass, and the changes that still need Andre
are in [CONTRIBUTING.md](CONTRIBUTING.md). Read [PLAN.md](PLAN.md) for the phase you are touching and
[docs/TDD.md](docs/TDD.md) for the conventions. The
[three-dev](.claude/skills/three-dev/SKILL.md) skill summarises the rules for agents and humans alike.

Before opening a PR:

```bash
npm run ci
```

Commits must pass the DCO check. `git commit -s` adds the `Signed-off-by:` trailer. A local commit missing
it can be fixed with `git commit --amend -s` before the branch is on the remote. Do not rebase or
force-push a branch that is already on the remote. The squash commit message must keep a
`Signed-off-by:` line.

Conventions that matter most:

- New sim behaviour gets a unit test first, then a replay test.
- Bugs found in the browser are reproduced in the lowest layer that can express them (unit > replay > e2e).
- Nothing under `art-source/` may be referenced from `public/` or `src/`. The budget check fails the build
  if raw art leaks.
- Payload budgets live in `tools/config.ts`. Raise them in a PR with a stated reason.

---

## Tech stack

| | |
|---|---|
| Renderer | Three.js 0.186 (postprocessing from Phase 4) |
| Sim | Deterministic fixed-step (120 Hz), hand-rolled Actor/Solid AABB physics |
| Language | TypeScript 5.9, strict |
| Bundler | Vite 7 |
| Tests | Vitest 5, Playwright 1.63 |

---

## PR screenshots

`npm run shots` builds `dist/`, serves it, and writes the title, Level 1 start, Level 1 mid, and the editor to `pr-shots/head/`, plus a short walk clip. `npm run shots -- --baseline <ref>` captures the same frames from another commit so a before/after pair lines up. Commit the pictures a PR body shows under `docs/pr-assets/<slug>/`, then `npm run shots -- --links <slug>` prints markdown pinned to that commit's SHA. How to embed them so GitHub renders them is in [AGENTS.md](AGENTS.md).
