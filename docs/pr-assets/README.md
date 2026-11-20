# PR assets

Pngs and short clips that a pull request body embeds. `npm run shots -- --slug <name>` copies a capture into `docs/pr-assets/<name>/`.

Commit that folder with the PR. `pr-shots/` stays local and gitignored.

In the PR body, link a png with an absolute raw URL that includes the head branch:

```markdown
![Level 1 mid](https://github.com/kzap/batoman-game/raw/<branch>/docs/pr-assets/<name>/level-1-mid.png)
```

That is what renders on GitHub. A relative path resolves against `main` and does not render on a PR into `v2`. CI artifact zips do not render inline. A webm plays inline only as a GitHub attachment.

The rules for agents are in [AGENTS.md](../../AGENTS.md).
