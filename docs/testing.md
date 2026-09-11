# Testing

Use `intelligence-testing` for real usage stories and the highest-signal failing test. [AGENTS](../AGENTS.md) owns review acceptance and final verification.

## Commands and gates

| Command | Purpose |
| --- | --- |
| `npm test` | Jest suite |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Runtime coverage gate |
| `npm run test:integration` | DB-backed tests in-band with temporary SQLite files |
| `npm run test:playwright:regular` | Separate Node/Chromium regular-import recovery tests |
| `npm run verify` | Lint, types, Knip, build, coverage after acceptance |

[jest.config.cjs](../jest.config.cjs) owns the 100% statement/branch/function/line gates and exact exclusions. Do not lower thresholds or add coverage exclusions without discussion. Coverage includes runtime/domain modules; operational `src/playwright/**`, test infrastructure, entrypoint wrappers, and the thin DB client are excluded according to that config.

Jest uses ts-jest, `NODE_OPTIONS=--experimental-vm-modules`, and `tsconfig.test.json` for compatibility with package-level ESM. Tests live under `src/__tests__/`.

## Choose the layer

- For routes → services → queries, prefer real temporary SQLite integration tests over mocked delegation assertions. `integration-db.ts` isolates DB/environment state and uses the same `src/db/schema.ts` as migrations.
- Validate real route responses against OpenAPI through `openapi-schema.ts`; use lightweight route checks for non-DB cases.
- Once integration tests protect happy paths, remove duplicate query fan-out/default-forwarding/service wiring tests. Omitted-season/default-window selection, season labels, and row normalization belong in route integration when observable there.
- Keep focused units for scoring, CSV mapping, auth parsing, cache normalization, snapshots, and meaningful aggregation/merge/sort/error cases.
- Mock external boundaries narrowly (`db/queries` or `db/client` as appropriate), not entire cross-layer behavior. Use temp DBs for higher-level persistence behavior.
- Cover changed behavior, realistic edge cases, promise failures, and new routes. Reuse existing integration helpers rather than duplicating fixtures. Do not invent mock-heavy tests solely to satisfy coverage.
- Do not import operational `src/playwright/**` entrypoints into Jest. Extract pure parsing/normalization into a non-CLI module when it needs runtime unit coverage.

## Scraper recovery

`npm run test:playwright:regular` runs the real regular-season CLI against local fixture pages with Chromium. Install Chromium with `npm run playwright:install` first. It uses temporary auth/mapping/output files and makes no live Fantrax requests or DB/R2 imports.

Coverage includes export-click/download timeouts, browser closure, retry exhaustion, and completed-CSV preservation. These operational checks stay outside Jest and the runtime coverage gate.

## Coverage gaps and exports

If realistic coverage is difficult, explain the gap and propose integration or boundary-mocking options before changing exclusions. A covered helper can still be unused at runtime: `npm run unused` checks production exports separately. [Development](development.md#code-conventions) owns the `@internal` convention.
