# 📋 Development Guide

## Prerequisites

- **Node.js**: 24.x or later (uses native fetch, stable WebSocket support)
- **npm**: 10.x or later
- **TypeScript**: 5.9+ (via devDependencies). The repo now runs as package-level ESM with `module: nodenext`, while Jest uses its own compatibility config for the test suite.

---

## First-Time Setup

```bash
# Clone repository
git clone https://github.com/maestor/node-fantrax-stats-parser.git
cd node-fantrax-stats-parser

# Install dependencies
npm install

# Run verification (ensures everything works)
npm run verify
```

This should:

- ✅ Pass ESLint checks (no warnings)
- ✅ Pass TypeScript compilation
- ✅ Pass Knip export checks
- ✅ Build successfully to lib/
- ✅ Pass all tests with 100% coverage

---

## Documentation Map

- [../README.md](../README.md) - project overview, quick start, API doc links, grouped endpoint examples
- [AGENT_SKILLS.md](AGENT_SKILLS.md) - default Codex skill set and project-local install/usage rules
- [TESTING.md](TESTING.md) - testing strategy and coverage rules
- [IMPORTING.md](IMPORTING.md) - Fantrax and FFHL draft import runbooks, CSV handling
- [DEPLOYMENT.md](DEPLOYMENT.md) - Vercel, Turso, R2, auth, caching
- [SNAPSHOTS.md](SNAPSHOTS.md) - snapshot-backed endpoints and generation rules
- [SCORING.md](SCORING.md) - player and goalie scoring behavior
- [RATING.md](RATING.md) - finals leaderboard rate behavior

Keep the README concise. Put deep operational detail in the topic docs above instead of growing the top-level readme again.

---

## Agent Skills Workflow

The repository keeps its default Codex backend skills under `.agents/skills/`.

- Use `intelligence-testing` whenever work changes tests or needs a decision about test coverage scope.
- Use `api-contract-sync` whenever route shapes, OpenAPI, generated types, fixtures, or consumer expectations change.
- Use `local-first-verification` whenever choosing local checks before review, handoff, or commit.

Keep the detailed workflow in [AGENT_SKILLS.md](AGENT_SKILLS.md). This file stays focused on repository development rules instead of repeating the full skill playbook.

---

## Development Workflow

### Daily Development Loop

1. **Create feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes incrementally**
   - Write failing test first (TDD approach recommended)
   - Implement feature to make test pass
   - Run tests in watch mode: `npm run test:watch`

3. **Before committing**

   ```bash
   npm run verify  # Required for non-docs changes; docs-only commits can skip it
   ```

4. **Commit with descriptive message**

   ```bash
   git add .
   git commit -m "Feature: Add XYZ functionality"
   ```

5. **Push and create PR** (if working with others)

### Quality Gate: npm run verify

**This single command enforces all quality standards:**

```bash
npm run verify
```

**What it runs:**

1. `npm run lint:check` - ESLint with 0 warnings allowed
2. `npm run typecheck` - TypeScript compilation check
3. `npm run unused` - Knip check for unused production exports
4. `npm run build` - Production build (outputs to lib/)
5. `npm run test:coverage` - Full test suite with coverage gates

**Must pass before every non-docs commit.** Docs-only commits can skip the full verification gate.

---

## npm Scripts Reference

### Development

- `npm run dev` - Start development server with hot reload via `tsx watch`
- `npm start` - Start production server
- `npm run build` - Build for production (TypeScript → JavaScript)

### Code Quality

- `npm run lint:check` - Run ESLint (read-only)
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run typecheck` - TypeScript type checking without build
- `npm run unused` - Run Knip against production exports
- `npm run unused:fix` - Let Knip remove unused production exports locally
- `npm run format` - Format code with Prettier

### Testing

- `npm test` - Run all tests once
- `npm run test:integration` - Run DB-backed integration tests in-band against a temporary SQLite database
- `npm run test:watch` - Run tests in watch mode (development)
- `npm run test:coverage` - Run tests with coverage report
- `npm run verify` - **Full quality gate** (lint + typecheck + unused exports + build + coverage)

### Operational Data Workflows

- [IMPORTING.md](IMPORTING.md) covers Playwright sync/import flows, FFHL draft scraping, `csv/temp` normalization, and Fantrax ID handling
- [DEPLOYMENT.md](DEPLOYMENT.md) covers Turso, R2, auth, caching, local-vs-remote import targets, and the `db:*` / `r2:*` operational commands
- [SNAPSHOTS.md](SNAPSHOTS.md) covers `npm run snapshot:generate`, snapshot scopes, and `x-stats-data-source`

Most data-operation scripts are documented in those topic docs instead of being duplicated here. Keep this file focused on development workflow and code standards.

### Utilities

- `npm run clean` - Remove lib/ directory

---

## OpenAPI Spec Maintenance

**`openapi.yaml` must be updated in the same commit as the code change — always. No exceptions.**

The frontend generates TypeScript types from this file using `openapi-typescript`. A stale spec means stale frontend types with no compile error — the only safeguard is keeping the spec accurate at commit time.

### When to update the spec

| Change                 | Required spec update                                              |
| ---------------------- | ----------------------------------------------------------------- |
| New endpoint           | Add path block with all parameters and response schemas           |
| Changed response shape | Update the matching `components/schemas` entry                    |
| Deleted endpoint       | Remove the path block                                             |
| Changed parameter      | Update `components/parameters` or the path-level param definition |

### How to verify locally

1. `npm start` — builds and starts the server
2. Open [http://localhost:3000/api-docs](http://localhost:3000/api-docs) to preview the spec in Swagger UI
3. `npm test` — the YAML smoke test + route coverage test + schema conformance tests must all pass

### Automated enforcement

Two test suites in `src/__tests__/` enforce spec accuracy:

- **Route coverage test** (`openapi.test.ts`): Compares registered routes in `src/app.ts` against `paths` in `openapi.yaml`. Fails if any route is undocumented or if the spec has a stale path with no matching route.
- **Schema conformance tests** (`routes.integration.test.ts` plus lightweight checks in `routes.test.ts`): Validate that route handler responses match the response schemas declared in `openapi.yaml` using a shared ajv helper. Most endpoints are checked through live DB-backed responses instead of handcrafted mocked payloads.

When a test fails after your change, update `openapi.yaml` to match the new route/shape before committing.

---

## Environment Variables

### Local Development (.env file)

```bash
# API Server
PORT=3000
NODE_ENV=development

# API Authentication (optional for local dev)
API_KEY=your-test-key-here
# API_KEYS=key1,key2,key3  # Multiple keys comma-separated
REQUIRE_API_KEY=false     # Set to true to require API keys

# Turso Database (required for API)
TURSO_DATABASE_URL=file:local.db   # Local SQLite for development
# TURSO_AUTH_TOKEN=                 # Not needed for local file

# Controls target database for db:import scripts (default: false = local.db)
USE_REMOTE_DB=false

# R2 Storage (optional — only needed for r2:upload/r2:download scripts)
# R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
# R2_ACCESS_KEY_ID=your_access_key_id
# R2_SECRET_ACCESS_KEY=your_secret_access_key
# R2_BUCKET_NAME=ffhl-stats-csv
# USE_R2_STORAGE=true               # Enables R2 upload in import pipelines (stats import-temp flow + transaction scrape when using default csv/transactions output)
# USE_R2_SNAPSHOTS=false            # Upload/read generated API snapshots via R2
# R2_SNAPSHOT_BUCKET_NAME=          # Optional; defaults to R2_BUCKET_NAME
# R2_SNAPSHOT_PREFIX=snapshots      # Optional object prefix for snapshot JSONs
# R2_SNAPSHOT_MAX_ATTEMPTS=4        # Optional retry cap for transient snapshot R2 failures
# R2_SNAPSHOT_RETRY_BASE_DELAY_MS=250 # Optional exponential backoff base delay for snapshot R2 retries
# SNAPSHOT_DIR=generated/snapshots  # Optional local snapshot directory
# SNAPSHOT_CACHE_TTL_MS=60000       # Optional in-memory snapshot cache ttl
# RAW_UPLOAD=false
#   Optional Playwright post-import toggle when --out=csv/temp
#   true  -> run parseAndUploadRawCsv (upload raw csv/temp to R2 rawFiles/ + cleanup)
#   false -> run parseAndUploadCsv (normalize/move/import pipeline)
```

### Production (Vercel)

Set these in Vercel Dashboard → Project Settings → Environment Variables:

- `API_KEY` or `API_KEYS` - Required for production
- `REQUIRE_API_KEY=true` - Enforce authentication
- `TURSO_DATABASE_URL` - Turso database URL (e.g., `libsql://your-db.turso.io`)
- `TURSO_AUTH_TOKEN` - Turso authentication token

---

## Code Style

### Enforced by Tooling

- **ESLint**: TypeScript ESLint rules, no warnings allowed (`--max-warnings 0`)
- **Prettier**: Auto-formatting on save (recommended VSCode settings)
- **TypeScript**: Strict mode enabled

#### Console output rules (ESLint `no-console`)

`src/playwright/**/*.ts` files are CLI utilities and have a strict rule: only `console.info` and `console.error` are allowed — `console.log` and `console.warn` are ESLint **errors**. The rest of `src/` has `no-console: warn`, which also fails `lint:check` due to `--max-warnings 0`.

## Unused export checks

- `knip.json` defines production entry points for the API, Vercel handlers, scripts, and Playwright import utilities.
- `npm run unused` runs `knip --production --include exports` to catch exported helpers/utilities that are no longer reachable from real entry points.
- Test-only exports may stay exported when necessary, but they must be marked with `/** @internal */` so production export analysis does not treat them as public surface.

**Rule of thumb for any `src/` file:** use `console.info` for informational output and `console.error` for errors. Never use `console.log` or `console.warn`.

### Conventions

- Use `async/await` over promise chains
- Prefer explicit types over `any`
- Extract magic numbers to constants
- Use descriptive variable names
- Keep functions focused and small
- Comment complex logic (but prefer self-documenting code)

### TypeScript patterns

**Derive types from constants — don't duplicate them:**

```ts
// ✅ Single source of truth
export const REPORT_TYPES = [
  "playoffs",
  "regular",
  "both",
] as const satisfies readonly Report[];
export type Report = (typeof REPORT_TYPES)[number];

// ❌ Two things to keep in sync
export type Report = "playoffs" | "regular" | "both";
export const REPORT_TYPES: Report[] = ["playoffs", "regular", "both"];
```

**Use `satisfies` to validate constant shapes without widening types:**

```ts
// ✅ Validates all values are numbers; literal types are preserved
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
} as const satisfies Record<string, number>;
```

**Add `readonly` to array parameters that are not mutated:**

```ts
// ✅ Communicates intent; callers can pass as-const arrays without a type error
const getMaxByField = <T, K>(items: readonly T[], fields: readonly K[]) => { ... };
```

**Cast DB rows through a named helper — don't scatter double-casts:**

```ts
// ✅ Single trust boundary, one place to update if the DB client improves
function castRows<T>(rows: unknown[]): T[] {
  return rows as T[];
}
return castRows<PlayerRow>(result.rows).map(mapPlayerRow);

// ❌ Noisy, intent unclear
return (result.rows as unknown as PlayerRow[]).map(mapPlayerRow);
```

**Validate before casting union types — use existing guards:**

```ts
// ✅ Cast only happens in the valid branch
if (!reportTypeAvailable(req.params.reportType as Report)) {
  return 400;
}
const report = req.params.reportType as Report;

// ❌ Cast before validation
const report = req.params.reportType as Report;
if (!reportTypeAvailable(report)) {
  return 400;
}
```

### Project structure

```text
src/
  index.ts
  server.ts
  openapi.ts
  auth.ts
  cache.ts
  config/
  features/
    career/
    fantrax/
    leaderboard/
    meta/
    stats/
    transactions/
  db/
  infra/
    r2/
    snapshots/
  playwright/
  shared/
  __tests__/

scripts/
```

### Where new code goes

- Keep `src/` root limited to obvious app entrypoints and global runtime modules such as `index.ts`, `server.ts`, `openapi.ts`, `auth.ts`, and `cache.ts`.
- Put new business or API functionality under `src/features/<feature>/` instead of creating new root files.
- Add feature-owned route handlers to `src/features/<feature>/routes.ts`.
- Add feature-owned query/business logic to `src/features/<feature>/service.ts`.
- Keep feature-specific types beside that feature in `src/features/<feature>/types.ts`.
- Put API metadata/discovery endpoints that are not tied to one domain model in `src/features/meta/`.
- Keep editable code-based project settings in `src/config/`. This is the project's lightweight settings surface instead of a database-backed admin UI.
- Put truly cross-feature helpers in `src/shared/`, such as common HTTP constants, team/season helpers, and shared types.
- Keep `src/shared/` strict. If logic clearly belongs to one feature, leave it in that feature even if another module imports it.
- Put database schema, queries, and DB-only helpers in `src/db/`.
- Put infrastructure integrations in `src/infra/`, such as snapshot storage and R2-specific retry helpers.
- Keep local Fantrax scraping/import tooling in `src/playwright/`.
- Keep operational scripts and CLI entrypoints in `scripts/`.

### Feature folder expectations

- A small feature may only need `routes.ts`, `service.ts`, and `types.ts`.
- Add extra files only when the feature has a clear sub-area, such as `mapping.ts`, `scoring.ts`, `entities.ts`, or `files.ts`.
- Prefer adding a new folder under `src/features/` for a new capability instead of growing `shared/` or the `src/` root.
