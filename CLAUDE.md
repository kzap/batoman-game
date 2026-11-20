# Claude

Follow [AGENTS.md](AGENTS.md). Game code: [.claude/skills/three-dev/SKILL.md](.claude/skills/three-dev/SKILL.md). Browser checks: [.claude/skills/game-testing/SKILL.md](.claude/skills/game-testing/SKILL.md).

PR descriptions, checkable on the body text:

- The first text is a TLDR of 2 or 3 lines saying what changed and why.
- After that, the body is bullets, screenshots, one optional mermaid fence, and the review checklist.
- A visible change has pngs from `npm run shots`, committed under `docs/pr-assets/<slug>/`, embedded as `https://github.com/kzap/batoman-game/raw/<branch>/docs/pr-assets/<slug>/<file>.png`.
- A mermaid fence is present when architecture, data flow, or a state machine changed, and absent when they did not.
- Every commit has a `Signed-off-by:` trailer from `git commit -s`.
