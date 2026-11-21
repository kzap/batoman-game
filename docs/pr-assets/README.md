# PR assets

Pngs and short clips that a pull request body embeds. `npm run shots -- --slug <name>` copies a capture into `docs/pr-assets/<name>/`.

Commit that folder with the PR. `pr-shots/` stays local and gitignored.

In the PR body, link a png with an absolute raw URL pinned to the full commit SHA that contains the file:

```markdown
![Level 1 mid](https://github.com/kzap/batoman-game/raw/<40-char-sha>/docs/pr-assets/<name>/level-1-mid.png)
```

`npm run shots -- --links <name>` prints that markdown after the files are committed. Until then it prints the two-step flow and does not invent a URL. A branch name in the URL breaks when the branch is deleted after merge, and it changes if the branch is force-pushed. A relative path resolves against `main` and does not render on a PR into `v2`. CI artifact zips do not render inline. A webm URL is a download link; inline playback needs a GitHub attachment.

The rules for agents are in [AGENTS.md](../../AGENTS.md).
