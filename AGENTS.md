# Codex Session Instructions

## Startup Checklist
1. Read [README.md](README.md) for project overview, quick start, and the documentation map.
2. Read [package.json](package.json) for available npm scripts.
3. Follow [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
4. Follow [docs/TESTING.md](docs/TESTING.md).
5. Follow [docs/AGENT_SKILLS.md](docs/AGENT_SKILLS.md) for the project's default Codex skill workflow.
6. Read the relevant topic doc when the task touches that area:
   - [docs/IMPORTING.md](docs/IMPORTING.md)
   - [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
   - [docs/SNAPSHOTS.md](docs/SNAPSHOTS.md)
   - [docs/SCORING.md](docs/SCORING.md)
   - [docs/RATING.md](docs/RATING.md)

## Shared Skills
- Use `$project-documentation` when updating `README.md`, `docs/**`, contributor guidance, or repository workflow docs.
- Use `$git-pr-workflow` for the standard branch, review, final-verify, commit, push, and PR-notes flow.
- Keep the detailed project skill workflow in [docs/AGENT_SKILLS.md](docs/AGENT_SKILLS.md) instead of re-explaining it here.

## Documentation Rules
- Keep [README.md](README.md) and docs updated after every task when needed.
- Keep [README.md](README.md) concise as the front door: overview, quick start, API doc entrypoints, and links to deeper docs.
- Put deep operational detail into focused docs under `docs/` instead of rebuilding a large README.
- Avoid duplicating the same long runbook across [README.md](README.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and topic docs.
- If current documentation has clearly weak decisions, challenge them and propose better alternatives. User decides whether documentation guidelines are changed.

## Repo-Specific Workflow Overrides
- Before any non-docs commit, `npm run verify` must pass. Docs-only changes do not require the full verification gate.
- Targeted tests are not a substitute for the full verification gate when runtime code changes.
- After finishing implementation, ask the user to review.
- After user acceptance, complete a commit phase on the current branch before offering PR notes.
- User handles final PR flow.

## Commit Message Style
- New features must use the prefix `Feature: `.
- Non-feature commits should use a capitalized prefix such as `Fix:`, `Docs:`, `Chore:`, and similar conventional labels.
- Use sentence-style capitalization after the colon: capitalize the first word, but do not title-case the whole message unless normal capitalization requires it.
