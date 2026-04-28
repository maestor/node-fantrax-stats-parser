# Agent Skills Workflow

## Default Skill Set

This project uses the backend/basic Codex skill set from [`maestor/agent-skills`](https://github.com/maestor/agent-skills):

- `intelligence-testing`
- `api-contract-sync`
- `local-first-verification`

## Automatic Usage Rules

Use these skills by default during future development work:

- `intelligence-testing`: every time work involves testing, test coverage scope, or deciding the right test layer. Start from a real usage story, write the highest-signal failing test first, and prefer behavior or integration coverage over duplicated mock wiring when the changed behavior crosses boundaries.
- `api-contract-sync`: every time a task changes route shapes, request or response contracts, OpenAPI, generated types, shared DTOs, fixtures, or client expectations. Treat the contract source of truth as the first edit.
- `local-first-verification`: every time a task needs verification planning before handoff, review, or commit. Start with the cheapest meaningful local check, escalate only when needed, and still finish with `npm run verify` before every commit because that is a repository rule.

When project-specific instructions conflict with a generic skill, follow this repository's docs first and use the skill as the decision-making lens behind them.

## Documentation Ownership

Keep the detailed skill workflow in this file.

- `README.md` should only mention that these skills are part of the default workflow and link here.
- `docs/DEVELOPMENT.md` should reference this file for day-to-day AI-assisted workflow expectations.
- `docs/TESTING.md` should reference this file while keeping repository-specific testing rules here in-repo.
- `AGENTS.md` should point sessions here so future Codex work picks up the same defaults automatically.
