# Contributing

Every pull request targets `v2`. The person who opens it squash-merges it once the hosted checks are
green and another teammate has reviewed it. Andre's OK is not required for each merge.

Read [PLAN.md](PLAN.md) for the phase you are touching and [docs/TDD.md](docs/TDD.md) for the
conventions. The [three-dev](.claude/skills/three-dev/SKILL.md) skill summarises the rules for agents
and humans alike.

## Branches

Branch from `v2` with one of these names:

- `phase/N-slug` for a plan phase. A phase that is too large to review splits into `phase/N.1`,
  `phase/N.2`, each still targeting `v2`.
- `content/<level>` for level art and data-only dressing.
- `infra/...` for tooling, CI, and repo process.

One change per pull request. Do not rebase or force-push a branch that is already on the remote.

## Review

A review is a review or a comment on the PR thread from a teammate other than the author. A formal
Approve is not required. A chat ping does not count, and the author ticking the checklist box does
not count. The author's own pass, including a self-review with the `code-review` skill, does not
count. Suggested lanes:

| Lane | Reviewer |
|---|---|
| Gameplay and QA | Quinn |
| Infra and tooling | Ari |
| Art and audio | Sining |
| Docs and plan | Tala |

Address that feedback, then record the reviewer on the PR checklist as `Reviewed by: @<teammate>`.

## Merge

The author squash-merges into `v2` once the feedback is addressed and the hosted checks are green.
The squash commit message must keep a `Signed-off-by:` line.

Green means every hosted check is passing. Today that is lint/unit/replay/build, e2e, perf
(blocking), and DCO. Once [#34](https://github.com/kzap/batoman-game/pull/34) lands, green is
`ci-gate` plus DCO.

Do not merge while any hosted check is red, even when the failure is not yours. Flag it to Ari.

`git commit -s` adds the `Signed-off-by:` trailer on each commit. A local commit missing it can be
fixed with `git commit --amend -s` before the branch is pushed. After the branch is on the remote,
do not rebase or force-push it.

Andre's OK is still required for:

- repo settings
- changing the default branch
- deleting branches
- spending money

## Before opening a PR

```bash
npm run ci
```

Conventions that matter most:

- New sim behaviour gets a unit test first, then a replay test.
- Bugs found in the browser are reproduced in the lowest layer that can express them (unit > replay > e2e).
- Nothing under `art-source/` may be referenced from `public/` or `src/`. The budget check fails the build
  if raw art leaks.
- Payload budgets live in `tools/config.ts`. Raise them in a PR with a stated reason.
