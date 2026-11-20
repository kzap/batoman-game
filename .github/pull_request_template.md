## Phase

<!-- Phase N: name. Link the plan section. -->

## Summary

<!-- What changed and why, in a few sentences. -->

## Exit criteria

<!-- Copy the phase's exit criteria from PLAN.md and tick each one with evidence. -->

- [ ]
- [ ]

## Evidence

<!-- Test output, budget report, screenshots for visual phases. -->

## Review

- [ ] `npm run ci` passes locally
- [ ] Commits are signed off for DCO (`git commit -s`)
- [ ] Self-reviewed with the `code-review` skill; findings addressed or listed below
- [ ] No raw art added to `public/`; new heavy files went to `art-source/`
- [ ] Docs updated where behaviour changed

## DCO

Every commit needs a `Signed-off-by:` trailer. `git commit -s` adds it. If you have not pushed yet,
`git commit --amend -s` (or `git rebase --exec 'git commit --amend --no-edit -s'`) fixes an unsigned
commit. If the unsigned commit is already on the remote, do not force-push; ask a maintainer.

## Notes for reviewer

<!-- Anything you want eyes on; known gaps deferred to later phases. -->
