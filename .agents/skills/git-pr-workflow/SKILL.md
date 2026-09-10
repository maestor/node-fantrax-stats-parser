---
name: git-pr-workflow
description: "Use when a task should follow a consistent working-branch, review, verify, commit, push, PR-handoff, or post-merge workspace-cleanup flow across repositories. For cleanup, verifies the active branch's complete net diff is present in main, updates main, and removes only that local branch after any size of squash merge."
---

# Git PR Workflow

## Overview

Use this skill when the repository should follow a predictable Git and handoff workflow instead of re-explaining the same steps in every `AGENTS.md`.

The goal is to keep delivery flow consistent across repositories:

- do not work on `main`
- use a sensible working branch with repo-appropriate naming
- implement in coherent batches
- pause for user review before the final verification gate
- run the real verification gate after acceptance
- commit with consistent prefixes
- push the ready branch
- finish with a clickable GitHub compare link plus copy-pasteable PR notes for the user to create the PR
- after a PR merge, return the repository to an up-to-date `main` and remove that PR's local working branch

Read [references/workflow-checklist.md](./references/workflow-checklist.md) when deciding branch naming, docs-only verification exceptions, the expected PR-notes shape, or post-merge cleanup details.

## Core Rules

- Repo-specific workflow rules still win when they are stricter or more specific.
- Explicit user instructions in chat override the default workflow.
- Before editing, confirm the current branch is not `main`.
- If the repo documents branch naming conventions, follow them.
- If no repo convention exists, use a clear branch name with a conventional prefix.
- Use targeted checks while implementing, but reserve the final verification gate for after user review and acceptance.
- Commit in reasonable, coherent batches. A single PR may contain multiple commits.
- Use capitalized conventional commit prefixes such as `Feature:`, `Fix:`, `Docs:`, `Chore:`, `Refactor:`, or `Test:`.
- Treat dependent Git write operations as a strict sequence, not parallel work.
- Never run `git add`, `git commit`, and `git push` in parallel or in one combined step; each depends on the previous step succeeding and should be checked in order.
- After acceptance, verification, and commit, push the branch unless the user explicitly wants to stop before push.
- End with a separate clickable GitHub compare link and copy-pasteable PR notes in a single fenced code block unless the branch is intentionally not PR-ready. The user creates every PR; do not open, create, submit, or automate a PR through a browser or other tool.
- Treat requests such as `clean workspace`, `clean up merged branches`, and `post-merge cleanup` as a request for the targeted cleanup workflow below. Scope it to the currently active working branch; never scan, inspect, or delete unrelated local branches.

## Token Discipline

- Do not narrate every Git command.
- Report only:
  - branch state and branch choice when relevant
  - review pause status
  - final verification result
  - commits created
  - whether the branch was pushed
  - compare link and PR notes, or the reason they were intentionally omitted
- Expand only when branch hygiene, verification exceptions, or push readiness is non-obvious.

## Workflow

### 1. Start from branch hygiene

Before implementation:

- inspect the current branch
- if on `main`, create or switch to a working branch before editing
- if the repo already defines branch naming rules, follow them

Prefer short, descriptive branch names such as:

- `feature/player-card-charts`
- `bugfix/search-empty-state`
- `docs/api-readme-refresh`
- `chore/update-tooling`

For repositories that already standardize on prefixes like `feature/`, `bugfix/`, `chore/`, `docs/`, `refactor/`, or `test/`, preserve that convention.

### 2. Implement in coherent batches

Keep work grouped into meaningful units:

- one feature slice
- one bug fix
- one docs refresh
- one test batch
- one refactor concern

Do not wait until the very end to think about commit boundaries.

### 3. Use iterative checks while working

While implementing, run only the checks needed to stay honest:

- focused tests
- typecheck
- lint
- targeted verification for the touched behavior

These are implementation checks, not the final gate.

### 4. Pause for user review before the final gate

After the batch is ready:

- summarize the implemented change briefly
- ask the user to review
- do not run the final `verify` gate yet unless the user has already accepted the batch
- if review feedback arrives, iterate and return to the review pause as needed

This review pause is part of the workflow, not an optional courtesy.

### 5. Run the final verification gate after acceptance

After the user explicitly accepts the batch:

- run the repo's real verification gate, usually `npm run verify`
- if it fails, fix the issue and rerun the necessary checks until it passes

Docs-only changes may skip the full gate only when the touched files are limited to docs or workflow text and the repo treats that as a valid exception.

Read [references/workflow-checklist.md](./references/workflow-checklist.md) for the usual docs-only and repo-config exception boundaries.

### 6. Commit in ready batches

Once the accepted batch is verified, commit it unless the user explicitly wants to hold commits.

Use a strict order for Git write actions:

1. stage the intended files
2. inspect the staged scope if anything is non-obvious
3. create the commit
4. push only after the commit succeeds

Do not parallelize or overlap any of those steps. If staging, commit creation, or push fails, stop and resolve that specific failure before moving on.

Use commit messages like:

- `Feature: Add park visit summary cards`
- `Fix: Correct goalie playoff ranking sort`
- `Docs: Refresh local setup notes`
- `Chore: Tighten verify script inputs`

Use sentence-style capitalization after the colon.

When a commit is substantial enough to benefit from an extended description:

- add a short commit body
- reuse the same bullet points you plan to include later under the PR-notes `Summary` section for that commit
- keep only the bullets in the commit body, not the `Title`, `Summary`, `Verification`, or `Notes` headings
- if the PR will contain multiple commits, keep each commit body scoped to the bullets that belong to that commit

### 7. Push and prepare handoff

When the branch is accepted, verified, and committed:

- push the branch
- if more implementation is still planned on the same branch, say so clearly
- if the branch is PR-ready, provide a separate clickable GitHub compare link and copy-pasteable PR notes for the user to create the PR
- after PR notes, briefly say: “After this PR is merged, while still on `<branch-name>`, say `clean workspace` to verify its patches, update `main`, and remove the local branch.”

Push is always downstream of a successful commit. Do not start push work until commit output confirms the new commit exists locally.

PR notes should usually include:

- `Title`
- `Summary`
- `Verification`

The `Summary` bullets in PR notes should match the extended commit description bullets for the related commit when that commit has a body.

Wrap the notes in one fenced code block so they are easy to copy.

Place the clickable GitHub compare link outside the fenced code block so the user can open it and create the PR manually. Do not create or automate the PR.

### 8. Clean the workspace after merged PRs

When the user asks to clean the workspace after a PR has been merged:

1. Check `git status --short` and record the active branch. Stop if the worktree has tracked or untracked changes, if the branch is `main` or detached, or if another worktree has the branch checked out. Do not enumerate or inspect other local branches.
2. Run `git fetch origin`.
3. Verify the branch's complete net diff, not its individual commits. Find `git merge-base origin/main <branch>`, create a temporary detached worktree at `origin/main`, then pipe `git diff --binary <merge-base> <branch>` into `git -C <temporary-worktree> apply --reverse --check`. Proceed only if the reverse check succeeds, then remove the temporary worktree. This verifies that all effects of the active branch are already present in `origin/main`, regardless of how many commits were combined in the remote squash merge.
4. If the reverse check fails, remove the temporary worktree, stop, and explain that the active branch's complete change cannot be reversed cleanly from `origin/main`.
5. After verification succeeds, run `git switch main`, `git pull --ff-only origin main`, then delete only the recorded target with `git branch -D <branch>`.
6. Finish on a clean, up-to-date local `main` and report only that target branch was removed.

This narrow use of `git branch -D` is for the active branch with verified branch-level patch containment only. Do not use reset, rebase, stash, or discard work as part of cleanup, and never infer permission to remove any other branch.

## Anti-Patterns

- starting implementation on `main`
- inventing a one-off branch name when the repo already has a convention
- treating targeted tests as a substitute for the final verify gate
- running final verify before the user has reviewed the batch
- building one giant end-of-task commit when the work had obvious batch boundaries
- parallelizing `git add`, `git commit`, and `git push`
- skipping the compare link or PR notes without saying why
- creating or automating a PR instead of handing the compare link and notes to the user
- mixing docs-only exceptions into runtime-code changes without calling out the difference
- scanning, evaluating, or reporting unrelated local branches during targeted cleanup
- force-deleting any branch other than the active branch with verified branch-level patch containment
- stashing or discarding changes during routine workspace cleanup

## Expected Behavior When This Skill Is Used

When applying this skill to a task:

1. Check branch state before editing.
2. Use a repo-appropriate working branch.
3. Implement in coherent batches with iterative checks.
4. Pause for user review before the final verification gate.
5. After acceptance, run the real verification gate.
6. Stage and commit in strict sequence with consistent prefixes.
7. Push only after the commit succeeds, then provide a clickable compare link plus fenced PR notes for the user to create the PR.
8. For post-merge cleanup, verify the active branch's complete net diff is present in `origin/main`, leave the repo on current `main`, and remove only that active branch, including after a multi-commit squash merge.
