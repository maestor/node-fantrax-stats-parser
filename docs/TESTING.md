# 🧪 Testing Requirements

## Coverage Gates ✅

All new code **must maintain 100% test coverage:**

- **100% statements coverage**
- **100% branch coverage**
- **100% function coverage**
- **100% line coverage**

**Enforcement:** `npm run verify` must pass before any commit.

### Cloudflare R2 Storage Testing

The Cloudflare R2 integration (January 2025) introduced cloud storage functionality that is fully tested through:

- **Manual AWS SDK mock** (`src/__mocks__/@aws-sdk/client-s3.ts`) - Allows Jest to test R2 code paths
- **Dedicated R2 test suite** (`services-r2.test.ts`) - Tests temp file handling and error scenarios
- **R2-specific test cases** in helpers, routes, and storage test suites

**Excluded from coverage:**
- **r2-client.ts only**: Thin wrapper around AWS SDK - tested via integration and covered by consuming code tests

All R2 code paths in application logic (helpers, routes, services, storage) achieve 100% coverage through mocking.

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

### Mocking AWS SDK for R2 Tests

The AWS SDK is mocked via manual mock in `src/__mocks__/@aws-sdk/client-s3.ts`:

```typescript
// Manual mock - automatically used by Jest
export class S3Client {
  constructor(_config: unknown) {}
  send = jest.fn();
}

export class GetObjectCommand {
  constructor(public input: { Bucket: string; Key: string }) {}
}
```

For R2-specific tests, mock the storage layer:

```typescript
const mockStorage = {
  readFile: jest.fn(),
  fileExists: jest.fn(),
  getLastModified: jest.fn(),
};

jest.mock("../storage", () => ({
  isR2Enabled: jest.fn(() => true),
  getStorage: jest.fn(() => mockStorage),
}));
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
    ├── helpers.test.ts      # 100 tests - Core utilities & scoring (includes R2 mode)
    ├── mappings.test.ts     # 47 tests - Data transformation
    ├── routes.test.ts       # 52 tests - API endpoints (includes R2 mode)
    ├── services.test.ts     # 23 tests - Business logic
    ├── services-r2.test.ts  # 3 tests - R2 temp file handling
    ├── storage.test.ts      # 17 tests - Storage abstraction
    └── fixtures.ts          # Test data
```

**Total: 276 tests across 9 test suites**

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
- Do propose mocking strategies (see AWS SDK mock example above)
- Do document why it's difficult and seek guidance

**For external SDK integrations:**
- Create manual mocks in `src/__mocks__/` directory
- Mock at the module boundary (e.g., mock AWS SDK, not your wrapper)
- Test your wrapper code through the mocked SDK
- Only exclude the thinnest possible adapter layer (e.g., `r2-client.ts`)

---

## Testing Checklist (before committing)

- [ ] All new code has test coverage
- [ ] `npm run verify` passes (lint + typecheck + build + coverage)
- [ ] No coverage thresholds lowered
- [ ] Test names clearly describe what's being tested
- [ ] Edge cases and error conditions tested
