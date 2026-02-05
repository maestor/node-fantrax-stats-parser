# 🧪 Testing Requirements

## Coverage Gates ✅

All new code **must maintain these minimum coverage thresholds:**

- **≥98% statements coverage**
- **≥97% branch coverage**
- **≥99% function coverage**
- **≥98% line coverage**

**Enforcement:** `npm run verify` must pass before any commit.

### What Changed from 100%?

This project originally had 100% test coverage. The Cloudflare R2 integration (January 2025) introduced infrastructure code that's difficult to unit test:

- **r2-client.ts**: Excluded from coverage (AWS SDK wrapper - tested via integration)
- **R2 code paths**: Lines in helpers.ts (54-55, 110-113), routes.ts (190-195), services.ts (56-66)

These paths execute only when `USE_R2_STORAGE=true` and require mocking the AWS S3 SDK, which is complex and provides limited value. They will be tested through:
- Integration testing during actual R2 deployment
- Manual verification in staging environment
- End-to-end Playwright tests (future enhancement)

**Justification:** Infrastructure/adapter code wrapping external SDKs is commonly excluded from coverage when properly isolated and integration-tested.

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

After R2 integration, many functions became async. Always use `await` and make test functions async:

```typescript
// ❌ Wrong
test('gets available seasons', () => {
  const result = availableSeasons();
  expect(result).toEqual([2023, 2024]);
});

// ✅ Correct
test('gets available seasons', async () => {
  const result = await availableSeasons();
  expect(result).toEqual([2023, 2024]);
});
```

### Testing Rejected Promises

```typescript
// For error objects
await expect(someAsyncFunction()).rejects.toThrow('Error message');

// For undefined throws (edge case)
await expect(someAsyncFunction()).rejects.toBeUndefined();
```

### Mocking Storage Layer

When testing code that uses storage abstraction:

```typescript
import * as storage from "./storage";

const mockStorage = {
  readFile: jest.fn().mockResolvedValue("csv content"),
  fileExists: jest.fn().mockResolvedValue(true),
  getLastModified: jest.fn().mockResolvedValue(new Date()),
};

jest.spyOn(storage, "getStorage").mockReturnValue(mockStorage);
```

---

## Test Organization

Tests are located in `src/__tests__/`:

```
src/
└── __tests__/
    ├── auth.test.ts         # 28 tests - API key authentication
    ├── cache.test.ts        # 12 tests - Response caching & ETags
    ├── csvIntegrity.test.ts # 11 tests - CSV validation
    ├── helpers.test.ts      # 95 tests - Core utilities & scoring
    ├── mappings.test.ts     # 47 tests - Data transformation
    ├── routes.test.ts       # 48 tests - API endpoints
    ├── services.test.ts     # 23 tests - Business logic
    ├── storage.test.ts      # 17 tests - Storage abstraction
    └── fixtures.ts          # Test data
```

**Total: 264 tests across 8 test suites**

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
- Don't lower coverage thresholds without explicit approval
- Do propose mocking strategies or alternative approaches
- Do document why it's difficult and seek guidance

---

## Testing Checklist (before committing)

- [ ] All new code has test coverage
- [ ] `npm run verify` passes (lint + typecheck + build + coverage)
- [ ] No coverage thresholds lowered
- [ ] Test names clearly describe what's being tested
- [ ] Edge cases and error conditions tested
