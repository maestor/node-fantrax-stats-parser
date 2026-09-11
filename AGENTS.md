# Agent Instructions

This is the sole agent initialization entrypoint. Load supporting docs and skills on demand; do not add tool-specific instruction mirrors.

Explicit user instructions override repository and skill defaults.

## Read on demand

- Start with [README.md](README.md) and the task map in [docs/README.md](docs/README.md); read only relevant guides/source, not the whole docs tree.
- [package.json](package.json) owns scripts/dependencies; code/config owns exact APIs and thresholds.
- Never read, search, or check `docs/researches/**` unless the user points to a specific document or another document explicitly instructs reading that specific research file. A folder/index link alone is not permission. Research is special-purpose analysis, not development requirements or architecture guidance.
- `docs/plans/` contains gitignored working plans; load only the relevant approved plan for the active task.

## Skills

Use matching `.agents/skills/` only: `project-documentation` for docs, `git-pr-workflow` for delivery, `intelligence-testing` for behavior protection, `api-contract-sync` for contracts/types/fixtures, and `local-first-verification` for checks. Load their references on demand.

## Delivery

- Work on a non-main branch; follow `git-pr-workflow` for branch creation, push, and PR handoff. The user creates the PR.
- Implement, run relevant iterative checks, then pause for user review. Do not run final verify or commit until the user accepts the current batch.
- After acceptance, `npm run verify` must pass before non-docs commits; targeted tests are not a substitute. Docs/workflow-text-only changes can skip the full gate.
- Complete the accepted commit phase before providing copy-pasteable PR notes. Use capitalized conventional prefixes (`Feature:`, `Fix:`, `Docs:`, `Chore:`) and sentence-style capitalization.

## Documentation

Update the canonical topic when behavior, operations, commands, or contributor rules change; link to it elsewhere. Keep README short and use [docs/README.md](docs/README.md) for task routing. Preserve operational exceptions and domain decisions; omit generic tutorials, duplicated runbooks, and mirrored source APIs. Challenge weak decisions for user review.

Use lowercase kebab-case topic filenames; preserve conventional `README.md`, `AGENTS.md`, and `SKILL.md` entrypoints. The sibling UI follows its own repository rules.
