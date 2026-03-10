# 📋 Development Guide

## Prerequisites

- **Node.js**: 24.x or later (uses native fetch, stable WebSocket support)
- **npm**: 10.x or later
- **TypeScript**: 5.9+ (via devDependencies)

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
- ✅ Build successfully to lib/
- ✅ Pass all tests with 100% coverage

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
   npm run verify  # Must pass - runs all quality gates
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
3. `npm run build` - Production build (outputs to lib/)
4. `npm run test:coverage` - Full test suite with coverage gates

**Must pass before every commit.** No exceptions.

---

## npm Scripts Reference

### Development

- `npm run dev` - Start development server with hot reload (nodemon)
- `npm start` - Start production server
- `npm run build` - Build for production (TypeScript → JavaScript)

### Code Quality

- `npm run lint:check` - Run ESLint (read-only)
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run typecheck` - TypeScript type checking without build
- `npm run format` - Format code with Prettier

### Testing

- `npm test` - Run all tests once
- `npm run test:watch` - Run tests in watch mode (development)
- `npm run test:coverage` - Run tests with coverage report
- `npm run verify` - **Full quality gate** (lint + typecheck + build + coverage)

### CSV Data Import

- `npm run playwright:install` - Installs or refreshes Playwright's Chromium browser binaries
- `npm run playwright:sync:leagues` - Scrape and save league IDs + season dates mapping
- `npm run playwright:sync:playoffs` - Scrape and save playoff bracket data (schemaVersion 3: includes `roundReached` and `isChampion` per team). Use `--import-db` to upsert results into the local database after syncing.
- `npm run playwright:sync:regular` - Scrapes regular season standings (W/L/T/Pts/division record) for all seasons from Fantrax and saves to `src/playwright/.fantrax/fantrax-regular.json`. Sets `isRegularChampion: true` on the rank-1 team only if `fantrax-playoffs.json` already contains data for that year (season not yet complete = no champion). Flags: `--headed`, `--year=XXXX`, `--import-db`, `--slowmo=N`, `--timeout=N`
- `npm run playwright:import:regular` - Import regular season data via Playwright. If output is `csv/temp`, post-import script defaults to `parseAndUploadCsv`; set `RAW_UPLOAD=true` to use `parseAndUploadRawCsv` instead. Post-import remains restricted to regular files (and `--year=YYYY` when provided).
- `npm run playwright:import:playoffs` - Import playoffs data via Playwright. If output is `csv/temp`, post-import script defaults to `parseAndUploadCsv`; set `RAW_UPLOAD=true` to use `parseAndUploadRawCsv` instead. Post-import remains restricted to playoffs files (and `--year=YYYY` when provided).
- All `playwright:*` scripts run `playwright:install` automatically first so browser updates do not break local runs.
- `./scripts/handle-csv.sh input.csv [output.csv]` - Normalizes Fantrax CSV format. Preserves first-column Fantrax `ID` values when present and removes only empty placeholder first columns + `Age`.
- `./scripts/import-temp-csv.sh [--dry-run] [--keep-temp] [--season=YYYY] [--report-type=regular|playoffs|both]` - Cleans files from `csv/temp/`, writes them to `csv/<teamId>/`, optionally uploads to R2, and imports to DB. By default it removes successfully imported source files from `csv/temp/`; use `--keep-temp` to preserve them. If `--season` is omitted it processes all matched seasons; if `--report-type` is omitted, `both` is the default.

### Fantrax IDs in imports

- Fantrax roster CSVs may include an `ID` column with values like `*00qs7*`.
- Import parses these IDs and stores them as:
  - `id` for skaters
  - `id` for goalies
- The import pipeline expects Fantrax's leading `ID` column to be preserved.
- Rows with a missing Fantrax ID are skipped during DB import and reported after the import completes; the rest of the file still imports.
- Rows with `0` games are imported into the database, but player/goalie API queries currently filter them out.

### Database (Turso/SQLite)

- `/teams` and `regular` / `both` season availability are derived from `src/constants.ts`, not runtime DB lookups. Only playoff season availability remains DB-backed.
- `npm run db:migrate` - Create/update database schema and performance indexes, including career lookup indexes on `player_id` and `goalie_id`
- `npm run db:pull:remote` - Replace `local.db` by pulling full schema + data from remote Turso (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in `.env`); creates timestamped backup in `.backups/`
- `npm run db:backups:clean` - Remove all files under `.backups/`
- `npm run db:import:stats` - Import all CSV files into database (local by default; set `USE_REMOTE_DB=true` in `.env` for remote). Regenerates API snapshots after a successful import.
- `npm run db:import:stats -- --season=YYYY` - Import only one season into database (local by default; set `USE_REMOTE_DB=true` in `.env` for remote). Regenerates API snapshots after a successful import.
- `npm run db:import:stats:current` - Import only current season into database. Regenerates API snapshots after a successful import.
- `npm run db:import:stats -- --report-type=regular|playoffs` - Import only one report type into database. Regenerates API snapshots after a successful import.
- `npm run db:import:playoff-results` - Import playoff round results from `fantrax-playoffs.json` into database (set `USE_REMOTE_DB=true` to target remote Turso). Regenerates API snapshots after a successful import.
- `npm run db:import:regular-results` - Imports regular season standings from `fantrax-regular.json` into the `regular_results` table. Set `USE_REMOTE_DB=true` to target remote Turso. Regenerates API snapshots after a successful import.
- `npm run snapshot:generate` - Generate JSON snapshots for historical endpoints and default combined responses into `generated/snapshots/`. If `USE_R2_SNAPSHOTS=true`, uploads them to R2 too.
- Snapshot-backed routes expose `x-stats-data-source: snapshot|db` so you can inspect whether a successful response came from a snapshot or a live DB path.

### R2 Storage (CSV backup + optional API snapshots)

- `npm run r2:upload` - Upload all CSV files to R2
- `npm run r2:upload -- --season=YYYY` - Upload only one season to R2
- `npm run r2:upload:current` - Upload only current season to R2
- `npm run r2:upload -- --report-type=regular|playoffs` - Upload only one report type to R2
- `npm run r2:download` - Download CSV files from R2. Snapshot objects under the configured snapshot prefix are ignored.
- `npm run r2:upload:raw` - Force-upload raw `csv/temp/*.csv` to `rawFiles/<teamId>/...` and remove uploaded temp files
- `npm run r2:download:raw` - Download all `rawFiles/` objects from R2 into `csv/temp/` (force overwrite)
- `npm run parseAndUploadRawCsv` - Post-import raw pipeline: upload `csv/temp` to `rawFiles/` and clean uploaded temp files

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

- **Route coverage test** (`openapi.test.ts`): Compares registered routes in `src/index.ts` against `paths` in `openapi.yaml`. Fails if any route is undocumented or if the spec has a stale path with no matching route.
- **Schema conformance tests** (`routes.test.ts`): Validates that route handler responses match the response schemas declared in `openapi.yaml` using ajv. Fails if a response shape diverges from the spec.

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
# USE_R2_STORAGE=true               # Enables R2 upload in import pipeline
# USE_R2_SNAPSHOTS=false            # Upload/read generated API snapshots via R2
# R2_SNAPSHOT_BUCKET_NAME=          # Optional; defaults to R2_BUCKET_NAME
# R2_SNAPSHOT_PREFIX=snapshots      # Optional object prefix for snapshot JSONs
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

### File Organization

- Source code: `src/`
- Tests: `src/__tests__/`
- Database layer: `src/db/`
- CSV/data mappings: `src/mappings.ts` (used by import scripts)
- Build output: `lib/` (gitignored)
- Import scripts: `scripts/`
