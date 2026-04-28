# Codex Session Instructions

## Startup Checklist
1. Read [README.md](README.md) for project overview, quick start, and the documentation map.
2. Read [package.json](package.json) for available npm scripts.
3. Follow all development standards in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
4. Follow all testing standards in [docs/TESTING.md](docs/TESTING.md).
5. Follow [docs/AGENT_SKILLS.md](docs/AGENT_SKILLS.md) for the project's default Codex skill workflow.
6. Read the relevant topic doc when the task touches that area:
   - [docs/IMPORTING.md](docs/IMPORTING.md) for Fantrax and FFHL draft import workflows
   - [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Vercel, Turso, R2, auth, and caching
   - [docs/SNAPSHOTS.md](docs/SNAPSHOTS.md) for snapshot generation and storage
   - [docs/SCORING.md](docs/SCORING.md) for player and goalie scoring behavior
   - [docs/RATING.md](docs/RATING.md) for finals leaderboard rate behavior

## Documentation Rules
- Keep [README.md](README.md) and docs updated after every task.
- Keep [README.md](README.md) concise as the front door: overview, quick start, API doc entrypoints, and links to deeper docs.
- Put deep operational detail into focused docs under `docs/` instead of rebuilding a 1,000-line README.
- Avoid duplicating the same long runbook across [README.md](README.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and topic docs.
- Keep detailed Codex skill workflow in [docs/AGENT_SKILLS.md](docs/AGENT_SKILLS.md) and link to it instead of re-explaining the same skill rules in multiple files.
- If current documentation has clearly weak decisions, challenge them and propose better alternatives.
- User decides whether documentation guidelines are changed.

## Git Workflow Rules
- Default workflow is a user-created branch (not `main`).
- If currently on `main`, ask user to create a branch before implementing task changes.
- If considering `git worktree`, always ask explicitly first and explain why worktree would help.
- Before any non-docs commit, `npm run verify` must pass. Docs-only changes do not require the full verification gate. Targeted tests are not a substitute for the full verification gate when runtime code changes.
- Commit message prefixes should use capitalized conventional labels.
- New features must use the prefix `Feature: `.
- Non-feature commits should use a capitalized prefix such as `Fix:`, `Docs:`, `Chore:`, etc.
- Use sentence-style capitalization after the colon: capitalize the first word, but do not title-case the whole message unless normal capitalization requires it. Example: `Feature: Add career player and goalie listings`.

## Task Completion and Handoff
- You may commit independently on the working branch.
- After finishing implementation, ask the user to review.
- After user accepts changes, complete a commit phase on the current branch before offering PR notes.
- After the commit phase, offer PR notes as a copy-pasteable code block.
- User handles final PR flow.
