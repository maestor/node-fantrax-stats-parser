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
- if PR-ready, provide a separate clickable GitHub PR link and notes in one fenced code block

`git push` is downstream of a successful local commit, not a concurrent action.

Keep the GitHub PR link outside the fenced block so it stays clickable and opens the compare page directly.

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
