# 🧪 Testing Requirements

## Coverage Gates ✅

All new code **must maintain 100% test coverage:**

- **100% statements coverage**
- **100% branch coverage**
- **100% function coverage**
- **100% line coverage**

**Enforcement:** `npm run verify` must pass before any commit.

**Excluded from coverage:**

- **db/client.ts only**: Thin wrapper around Turso/libSQL client — tested via integration

---

## Frameworks

- **Jest** - Unit and integration tests
- **ts-jest** - TypeScript transformation
- **node-mocks-http** - HTTP request/response mocking

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

### Full quality gate

```bash
npm run verify  # Runs lint, typecheck, build, and test:coverage
```

---

## Common Patterns

### Async Functions

Many functions are async (database queries, resolveTeamId, etc.). Always use `await`:

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
    ├── helpers.test.ts   # Core utilities, scoring, DB-backed helpers
    ├── mappings.test.ts  # Data transformation (CSV parsing for import, combined data mapping)
    ├── queries.test.ts   # Database query layer
    ├── routes.test.ts    # API endpoint handlers
    ├── snapshots.test.ts # Snapshot loading, R2 fallback, cache behavior
    ├── services.test.ts  # Business logic (DB → scored data)
    └── fixtures.ts       # Shared test data
```

Keep this directory updated whenever a new module or integration boundary is added. Snapshot behavior now has its own dedicated suite because it includes local filesystem, cache, and R2 fallback branches.

---

## Test Requirements for New Code

**Every contribution must include tests for:**

1. **All new functions** - Unit tests covering happy path + edge cases
2. **Modified functions** - Update existing tests, add new cases for new behavior
3. **New API endpoints** - Route handler tests + integration tests
4. **Error handling** - Test error cases explicitly
5. **Async operations** - Test promise resolution and rejection

**If you can't test something:**

- Don't exclude it from coverage without discussion
- Don't lower coverage thresholds (100% is required)
- Do propose mocking strategies
- Do document why it's difficult and seek guidance

**For external SDK integrations:**

- Mock at the module boundary (e.g., mock `../db/client`, not the libSQL SDK)
- Test your wrapper code through the mocked dependency
- Only exclude the thinnest possible adapter layer (e.g., `db/client.ts`)

---

## Testing Checklist (before committing)

- [ ] All new code has test coverage
- [ ] `npm run verify` passes (lint + typecheck + build + coverage)
- [ ] No coverage thresholds lowered
- [ ] Test names clearly describe what's being tested
- [ ] Edge cases and error conditions tested
