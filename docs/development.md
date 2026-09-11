# Development

[README](../README.md) covers startup; [AGENTS](../AGENTS.md) owns delivery/review rules. Use [package.json](../package.json) for scripts and engine versions. This API uses package-level ESM with NodeNext; Jest has a separate compatibility configuration.

## Local environment

Copy [.env.example](../.env.example) to `.env`. The server defaults to port 3000; `PORT` overrides it. Use local SQLite (`TURSO_DATABASE_URL=file:local.db`) for development, and `USE_REMOTE_DB=false` for local imports. R2 credentials are needed only for storage operations.

[Deployment](deployment.md) owns remote DB, R2, and authentication settings. [Snapshots](snapshots.md) owns snapshot settings. `RAW_UPLOAD` controls whether default `csv/temp` imports upload raw files or run the normal normalization/import pipeline; see [importing](importing.md).

## Source ownership

| Path | Responsibility |
| --- | --- |
| `src/app.ts`, `src/server.ts`, `src/index.ts` | API composition and entrypoints |
| `src/auth.ts`, `src/cache.ts`, `src/openapi.ts` | Global auth, caching and schema serving |
| `src/features/<feature>/` | Feature routes, services, types, and domain helpers |
| `src/features/meta/` | Metadata/discovery endpoints |
| `src/config/` | Editable code-based settings, teams, seasons, CSV/Fantrax configuration |
| `src/shared/`, `src/http/` | Cross-feature helpers/types and HTTP primitives |
| `src/db/` | Schema, queries, client boundary |
| `src/infra/` | R2 and snapshot storage |
| `src/playwright/` | Operational Fantrax/forum tools |
| `scripts/` | Import, migration, storage, and other CLI entrypoints |
| `src/__tests__/` | Runtime/domain tests and temporary-DB harness |

New features normally start with `routes.ts`, `service.ts`, `types.ts`; add mapping/scoring/etc. files only for substantial subareas. Keep feature-owned helpers in their feature even when another module imports them. Do not grow root files or `shared/` into unrelated business logic.

## Code conventions

- Prefer async/await, explicit types, focused functions, and named constants.
- Derive unions from constants, validate shapes with `satisfies`, and accept readonly arrays where inputs are not mutated.
- Centralize database row casts at a named trust boundary; validate request unions with existing guards before treating them as valid domain values.
- Use `console.info` / `console.error`; `console.log` / `console.warn` fail the zero-warning lint gate, including operational Playwright utilities.
- `knip.json` owns production entrypoints. Mark necessary test-only exports `/** @internal */`; do not retain unreachable production exports just because tests use them.

## OpenAPI contract

Update [openapi.yaml](../openapi.yaml) in the same commit as route, parameter, or response-shape changes. Add/remove paths and update matching parameter/schema definitions. The sibling UI generates types from the served schema; stale contracts can silently leave consumers out of sync.

`src/__tests__/openapi.test.ts` checks registered route coverage. Route integration suites validate real DB-backed responses through `openapi-schema.ts`; lightweight route tests cover non-DB cases. Preview via `npm run dev` and `http://localhost:3000/api-docs`; run relevant tests before review.

The UI's `npm run generate:types` reads the hosted schema by default. For an unpublished paired change, explicitly use the intended local schema or wait for its deployment; never regenerate against an older hosted version by accident. See [UI development](../../fantrax-stats-parser-ui/docs/development.md#api-types).

## Verification and tooling

`npm run verify` runs lint:check → typecheck → unused → build → test:coverage. Reserve it for after review acceptance under AGENTS. Build output is `lib/`; `npm start` builds before serving. `lint:fix`, `unused:fix`, and `format` modify source, so inspect their diffs.

[Testing](testing.md) owns test strategy and coverage. Project-local skills are vendored from `maestor/agent-skills`; load only the matching skill and required references instead of restating its workflow here.
