# Codex Session Instructions

## Startup Checklist
1. Read [README.md](README.md) for project overview.
2. Read [package.json](package.json) for available npm scripts.
3. Follow all development standards in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
4. Follow all testing standards in [docs/TESTING.md](docs/TESTING.md).

## Documentation Rules
- Keep [README.md](README.md) and docs updated after every task.
- If current documentation has clearly weak decisions, challenge them and propose better alternatives.
- User decides whether documentation guidelines are changed.

## Git Workflow Rules
- Default workflow is a user-created branch (not `main`).
- If currently on `main`, ask user to create a branch before implementing task changes.
- If considering `git worktree`, always ask explicitly first and explain why worktree would help.
- Before any commit, `npm run verify` must pass. Targeted tests are not a substitute for the full verification gate.
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
