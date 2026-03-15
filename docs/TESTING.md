# 🧪 Testing Requirements

## Coverage Gates ✅

All new code **must maintain 100% test coverage:**

- **100% statements coverage**
- **100% branch coverage**
- **100% function coverage**
- **100% line coverage**

**Enforcement:** `npm run verify` must pass before any commit.

**Excluded from coverage:**

- **`src/__tests__/**`**: Test-only fixtures and harness helpers
- **db/client.ts only**: Thin wrapper around Turso/libSQL client — tested via integration

---

## Frameworks

- **Jest** - Unit and integration tests
- **ts-jest** - TypeScript transformation
- **node-mocks-http** - HTTP request/response mocking
- **Temporary SQLite/libSQL file DBs** - Route/service/query integration coverage without production snapshots or mocked DB queries

---

## Running Tests

### All tests with coverage

```bash
npm run test:coverage
```

### Watch mode (development)

```bash
npm run test:watch
```

### DB-backed integration tests

```bash
npm run test:integration
```

### Full quality gate

```bash
npm run verify  # Runs lint, typecheck, unused export check, build, and test:coverage
```

---

## Preferred Strategy

- Keep 100% coverage intact for now, but do not add mock-heavy tests just to satisfy the threshold.
- For changes that cross `routes` + `services` + `db/queries`, prefer a DB-backed integration test before adding more delegation assertions.
- When a DB-backed integration test already covers a route or service happy path end-to-end, delete the overlapping mocked happy-path test instead of keeping both.
- In the service-unit suites, keep aggregation, merge, sorting, and error-path coverage; remove tests that only prove query fan-out, default parameter forwarding, or other wiring already exercised by route integration.
- Treat omitted-season selection and combined default-window behavior as route-integration territory, not mocked service wiring.
- Keep focused unit tests for pure scoring logic, CSV-import mapping, auth parsing, cache normalization, and snapshot cache behavior.
- Once season selection, season-label formatting, or row-normalization behavior is already asserted through a live route response, prefer the integration suite over duplicating the same expectation in a thin helper/query happy-path test.
- For OpenAPI schema conformance, prefer validating real route responses, using the integration suite for DB-backed endpoints and only lightweight route tests for non-DB cases.
- The integration harness lives in `src/__tests__/integration-db.ts` and uses `src/db/schema.ts` so tests and the migration script share the same schema source.

---

## Common Patterns

### Async Functions

Many functions are async (database queries, service calls, route handlers, etc.). Always use `await`:

```typescript
// ❌ Wrong
test("gets available seasons", () => {
  const result = availableSeasons();
  expect(result).toEqual([2023, 2024]);
});

// ✅ Correct
test("gets available seasons", async () => {
  const result = await availableSeasons();
  expect(result).toEqual([2023, 2024]);
});
```

### Mocking the Database Layer

Use this for narrow unit tests only. If the behavior under change spans routes/services/query composition, prefer the temporary SQLite integration harness instead.

Mock at the module boundary (`../db/queries` or `../db/client`):

```typescript
jest.mock("../db/queries", () => ({
  getAvailableSeasonsFromDb: jest.fn(),
}));

import { getAvailableSeasonsFromDb } from "../db/queries";

const mockGetSeasons = getAvailableSeasonsFromDb as jest.MockedFunction<
  typeof getAvailableSeasonsFromDb
>;

test("returns seasons from DB", async () => {
  mockGetSeasons.mockResolvedValue([2023, 2024]);
  const result = await availableSeasons();
  expect(result).toEqual([2023, 2024]);
});
```

### Mocking the DB Client Directly

For testing query functions in `db/queries.ts`:

```typescript
jest.mock("../db/client", () => {
  const mockExecute = jest.fn();
  return {
    getDbClient: jest.fn(() => ({ execute: mockExecute })),
  };
});
```

---

## Test Organization

Tests are located in `src/__tests__/`:

```
src/
└── __tests__/
    ├── auth.test.ts      # API key authentication
    ├── cache.test.ts     # Response caching & ETags
    ├── db.schema.test.ts # Schema migration/backfill behavior for fantrax_entities
    ├── helpers.goalies.test.ts # Goalie scoring helpers
    ├── helpers.players.test.ts # Player scoring helpers
    ├── helpers.test.ts   # Shared helper utilities
    ├── fantrax-entities.test.ts # Canonical Fantrax identity merge/upsert helpers
    ├── integration-db.ts # Temp DB + env isolation helpers for integration tests
    ├── mappings.players.test.ts # CSV-to-player transformation coverage
    ├── mappings.goalies.test.ts # CSV-to-goalie transformation coverage
    ├── openapi-schema.ts # Shared OpenAPI schema validators for route tests
    ├── queries.*.test.ts # Database query suites (roster stats, career rows, results/metadata)
    ├── r2-retry.test.ts # Snapshot R2 retry/backoff classification and limits
    ├── routes.integration.helpers.ts # Shared helpers for route integration suites
    ├── routes.integration.test.ts # Entry point for the categorized route integration suites
    ├── routes.integration.*.ts # Domain-focused route integration modules (seasons, players, goalies, career, leaderboard)
    ├── routes.test.ts    # Route guard/cache edge cases and lightweight schema checks
    ├── snapshot-generation.test.ts # Snapshot scope/report selection helpers
    ├── services.career.fixtures.ts # Shared career-service row builders
    ├── services.*.test.ts # Domain-focused service unit suites (season/combined, career detail/list, leaderboard)
    ├── snapshots.test.ts # Snapshot loading, R2 fallback, cache behavior
    ├── transactions.import.test.ts # Transaction entity matching, grouping, and DB import behavior
    ├── transactions.test.ts # Transaction file naming, URL building, and year-selection helpers
    └── fixtures.ts       # Shared test data
```

Keep this directory updated whenever a new module or integration boundary is added. Snapshot behavior now has its own dedicated suites because snapshot loading covers local filesystem, cache, and R2 fallback branches while `r2-retry.test.ts` pins down transient upload classification/backoff behavior, route-db integration now has a dedicated suite so endpoint behavior can be validated with less internal mocking, helper scoring coverage is split by skaters/goalies while season-availability behavior rides on the route integration suite, canonical Fantrax identity behavior is split between helper-level merge/upsert tests and a DB-backed schema migration suite, transaction helper coverage pins down season/file naming and Fantrax history URL generation, transaction import coverage now separately pins down entity matching, grouping, commissioner-fix exclusion, and season reimport behavior, service-unit coverage is split by season/combined, career, and leaderboard behavior, mapping coverage stays focused on CSV player/goalie transforms, and query coverage is split by roster/career/results responsibilities so the larger suites stay readable without reasserting every live route happy path.

---

## Unused Export Guard

- `npm run unused` runs Knip in production mode and fails on unused exported runtime helpers.
- Coverage does not replace this check. A helper can still have direct unit-test coverage while being unreachable from real entry points.
- If an export exists only for tests, mark it with `/** @internal */` rather than leaving it as an accidental public export.

---

## Test Requirements for New Code

**Every contribution must include tests for:**

1. **All new functions** - Unit tests covering happy path + edge cases
2. **Modified functions** - Update existing tests, add new cases for new behavior
3. **Route/service/db behavior changes** - Prefer DB-backed integration tests when the logic crosses module boundaries
4. **New API endpoints** - Route handler tests + integration tests
5. **Error handling** - Test error cases explicitly
6. **Async operations** - Test promise resolution and rejection

**If you can't test something:**

- Don't exclude it from coverage without discussion
- Don't lower coverage thresholds (100% is required)
- Do propose integration or mocking strategies
- Do document why it's difficult and seek guidance

**For external SDK integrations:**

- Mock at the module boundary (e.g., mock `../db/client`, not the libSQL SDK)
- Test your thin wrapper code through the mocked dependency
- Test higher-level DB behavior through the temp SQLite integration harness when possible
- Only exclude the thinnest possible adapter layer (e.g., `db/client.ts`)

---

## Testing Checklist (before committing)

- [ ] All new code has test coverage
- [ ] `npm run unused` passes or intentional test-only exports are marked `@internal`
- [ ] `npm run verify` passes (lint + typecheck + build + coverage)
- [ ] No coverage thresholds lowered
- [ ] Test names clearly describe what's being tested
- [ ] Edge cases and error conditions tested
