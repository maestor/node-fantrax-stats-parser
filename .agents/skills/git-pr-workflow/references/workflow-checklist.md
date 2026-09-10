# Git PR Workflow Checklist

Use this reference when a repo should follow the same task-delivery flow without repeating it in every `AGENTS.md`.

## Pre-Work Branch Check

Before editing:

- inspect the current branch
- if on `main`, create or switch to a working branch first
- check whether the repo already defines branch naming conventions
- keep unrelated user changes intact

## Branch Naming

If the repo already documents a branch naming scheme, follow it.

Good common prefixes:

- `feature/`
- `bugfix/`
- `chore/`
- `docs/`
- `refactor/`
- `test/`

Good examples:

- `feature/park-visit-form`
- `bugfix/random-record-empty-state`
- `docs/testing-guide-refresh`
- `chore/verify-script-cleanup`

Choose the prefix from the dominant concern of the batch, not from every small side effect.

## Review Pause

Before the final verification gate:

- finish the current implementation batch
- summarize what changed
- pause for user review
- wait for explicit acceptance

If the user requests changes, iterate and return to the same review pause.

## Verification Gate

After acceptance:

- run the repo's final gate, usually `npm run verify`
- treat targeted checks as support for implementation, not as the final gate
- if the gate fails, fix the issue and rerun until it passes

Common exception:

- docs-only or workflow-only changes may skip the full gate when the touched files are limited to documentation or repo workflow text and the repo treats that as safe

Use the repo's stricter rule if it defines one.

## Commit Strategy

Commit in coherent batches when they are ready.

Dependent Git write steps are sequential:

1. run `git add` for the intended files
2. sanity-check staged scope when needed
3. run `git commit`
4. run `git push` only after the commit succeeds

Never run `git add`, `git commit`, and `git push` in parallel. If one step fails, fix it before moving to the next step.

Typical commit prefixes:

- `Feature:`
- `Fix:`
- `Docs:`
- `Chore:`
- `Refactor:`
- `Test:`

Message style:

- capitalize the first word after the colon
- keep the rest in normal sentence style
- avoid vague messages like `Fix stuff`

Commit body style:

- when the commit is substantial enough to need an extended description, add a short body
- use the same bullets you expect to place later under PR-notes `Summary` for that commit
- do not include `Title`, `Summary`, `Verification`, or `Notes` headings in the commit body
- if multiple commits roll into one PR, keep each commit body limited to its own bullets

## Push And Handoff

When the batch is accepted, verified, and committed:

- push the branch
- state clearly if more work is still planned before PR
- if PR-ready, provide a separate clickable GitHub compare link and notes in one fenced code block for the user to create the PR
- after the notes, include this brief next-step hint: “After this PR is merged, while still on `<branch-name>`, say `clean workspace` to verify its patches, update `main`, and remove the local branch.”

`git push` is downstream of a successful local commit, not a concurrent action.

Keep the GitHub compare link outside the fenced block so it stays clickable and opens the compare page directly. The user creates every PR; do not open, create, submit, or automate a PR through a browser or other tool.

Suggested PR-notes shape:

```md
Title
- Short PR title

Summary
- Main change
- Important follow-up detail

Verification
- `npm run verify`
- Any scoped checks worth mentioning
```

When a related commit includes an extended description, the PR-notes `Summary` bullets should mirror those commit-body bullets.

## Post-Merge Workspace Cleanup

Use this when the user says `clean workspace`, `clean up merged branches`, `cleanup after merge`, or equivalent wording.

The desired end state is the latest `main`, with only the currently active working branch removed. This workflow verifies the branch's complete net diff, so it supports squash merges of any number of commits without relying on commit ancestry or external PR queries.

1. Check `git status --short` and record the current branch as the one and only target. If the worktree is not clean, or the branch is `main`, detached, or checked out by another worktree, stop. Do not list or inspect other local branches.
2. Run `git fetch origin`.
3. Find `git merge-base origin/main <branch>`. Create a temporary detached worktree at `origin/main`, then run `git diff --binary <merge-base> <branch> | git -C <temporary-worktree> apply --reverse --check`. Continue only when the reverse check succeeds. It verifies that the complete active-branch change is already present in `origin/main`, regardless of how many commits the squash merge combined. Always remove the temporary worktree after the check.
4. If the reverse check fails, remove the temporary worktree, stop, and explain that the active branch's complete change cannot be reversed cleanly from `origin/main`.
5. Run `git switch main`, then `git pull --ff-only origin main`. If either action cannot complete safely, stop and report the reason.
6. Delete only the recorded target with `git branch -D <branch>`. If deletion fails, leave it intact and report the reason. Otherwise, finish on clean, up-to-date `main` and report only that target was removed.

Important boundaries:

- A missing `origin/<branch>` is not used as evidence of merge status; remote-branch deletion is outside this workflow.
- `git branch -D` is allowed only for the active branch after branch-level patch-containment verification. It is necessary because squash merges do not retain the original branch tip in `main`'s ancestry.
- Do not use `git reset`, `git clean`, `git stash`, or destructive recovery commands for this workflow.
- A target checked out by another worktree must be retained; report it rather than trying to remove it.

## Lean AGENTS.md Pattern

To avoid repeating this workflow in every repo, keep `AGENTS.md` short:

- point to the shared workflow skill
- keep only repo-specific overrides in the repo
- document local branch naming quirks, verify exceptions, or push constraints only when they differ from the shared default

Good candidates to keep repo-local:

- required branch prefixes unique to the repo
- exact verify command if it is not `npm run verify`
- generated-file rules
- deployment or push constraints
- exceptions around docs-only, E2E-only, or plan-only changes
