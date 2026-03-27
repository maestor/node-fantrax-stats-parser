See @README.md for project overview, quick start, and the documentation map, and @package.json for available npm commands for this project.

# Project documentation
- All development standards and instructions are in @docs/DEVELOPMENT.md
- All testing standards and instructions are in @docs/TESTING.md
- Use @docs/IMPORTING.md for Fantrax and FFHL draft import workflows
- Use @docs/DEPLOYMENT.md for Vercel, Turso, R2, auth, and caching
- Use @docs/SNAPSHOTS.md for snapshot generation and storage
- Use @docs/SCORING.md for player and goalie scoring details

Keep @README.md and project documentation updated after every task.
Keep @README.md concise as the front door and move deep operational detail into focused docs under @docs/.
Avoid duplicating the same long runbook in multiple docs when one topic doc can be the clear source of truth.

Ask every time explicitly with explanations if want to use git worktree instead of user created branch in the main workflow.

Challenge user if documentation have some clearly bad decisions and propose better, user make decision if guidelines updated.

User created branch in the main workflow is the default way to work on a task. If we are in main, ask user create one. There can commit independently, ask user review after you finish the task. After user have accepted the changes, offer PR notes as copypasteable code block and user will handle rest.
