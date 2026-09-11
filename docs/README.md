# Development Docs

Read only the guide matching the task. [README](../README.md) owns quick start and API entrypoints; [AGENTS](../AGENTS.md) owns delivery rules.

| Task | Read |
| --- | --- |
| Code organization, local configuration, OpenAPI maintenance | [Development](development.md) |
| Test strategy, coverage, DB integration, scraper recovery | [Testing](testing.md) |
| Fantrax/forum scraping, CSV normalization, transactions, draft linking | [Importing](importing.md) |
| Vercel, database targets/backups, R2, auth, caching | [Deployment](deployment.md) |
| Snapshot scopes, regeneration, fallback | [Snapshots](snapshots.md) |
| Advance the active season | [Season change](season-change.md) |
| Player/goalie scores | [Scoring](scoring.md) |
| Finals win rates and matchup factors | [Rating](rating.md) |
| UI consumer integration | [Sibling UI docs](../../fantrax-stats-parser-ui/docs/README.md) |

`docs/researches/` holds special-purpose analyses, separate from project development. Never read, search, or check its contents unless the user points to a specific document or another document explicitly instructs reading that specific file. This directory description is not an instruction to open it. Research conclusions do not become project requirements automatically.

`docs/plans/` is gitignored working memory; load only the relevant approved plan. Keep topic filenames lowercase kebab-case, `README.md` for indexes, one canonical home per rule, and relative cross-links. Code/config and OpenAPI own exact interfaces; avoid duplicating them in prose.
