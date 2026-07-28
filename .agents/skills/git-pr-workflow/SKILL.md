---
name: git-pr-workflow
description: Use when a task should follow a consistent working-branch, review, verify, commit, push, and PR-handoff flow across repositories. Helps enforce branch hygiene before edits, use repo-aware branch naming, pause for user review before the final verification gate, commit in coherent batches with consistent prefixes, and finish with pushed changes plus a clickable GitHub PR link and copy-pasteable PR notes.
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
- finish with a clickable GitHub PR link plus copy-pasteable PR notes

Read [references/workflow-checklist.md](./references/workflow-checklist.md) when deciding branch naming, docs-only verification exceptions, or the expected PR-notes shape.

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
- End with a separate clickable GitHub PR link and copy-pasteable PR notes in a single fenced code block unless the branch is intentionally not PR-ready.

## Token Discipline

- Do not narrate every Git command.
- Report only:
  - branch state and branch choice when relevant
  - review pause status
  - final verification result
  - commits created
  - whether the branch was pushed
  - PR link and PR notes, or the reason they were intentionally omitted
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
- if the branch is PR-ready, provide a separate clickable GitHub PR link and copy-pasteable PR notes

Push is always downstream of a successful commit. Do not start push work until commit output confirms the new commit exists locally.

PR notes should usually include:

- `Title`
- `Summary`
- `Verification`

The `Summary` bullets in PR notes should match the extended commit description bullets for the related commit when that commit has a body.

Wrap the notes in one fenced code block so they are easy to copy.

Place the clickable GitHub PR link outside the fenced code block so the user can open GitHub directly and create the PR from the compare page.

## Anti-Patterns

- starting implementation on `main`
- inventing a one-off branch name when the repo already has a convention
- treating targeted tests as a substitute for the final verify gate
- running final verify before the user has reviewed the batch
- building one giant end-of-task commit when the work had obvious batch boundaries
- parallelizing `git add`, `git commit`, and `git push`
- skipping the PR link or PR notes without saying why
- mixing docs-only exceptions into runtime-code changes without calling out the difference

## Expected Behavior When This Skill Is Used

When applying this skill to a task:

1. Check branch state before editing.
2. Use a repo-appropriate working branch.
3. Implement in coherent batches with iterative checks.
4. Pause for user review before the final verification gate.
5. After acceptance, run the real verification gate.
6. Stage and commit in strict sequence with consistent prefixes.
7. Push only after the commit succeeds, then provide a clickable PR link plus fenced PR notes when ready.
