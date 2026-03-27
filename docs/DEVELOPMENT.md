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
3. `npm run unused` - Knip check for unused production exports
4. `npm run build` - Production build (outputs to lib/)
5. `npm run test:coverage` - Full test suite with coverage gates

**Must pass before every commit.** No exceptions.

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

### CSV Data Import

- `npm run playwright:install` - Installs or refreshes Playwright's Chromium browser binaries
- `npm run playwright:sync:leagues` - Scrape and save league IDs + season dates mapping
- `npm run playwright:sync:playoffs` - Scrape and save playoff bracket data (schemaVersion 3: includes `roundReached` and `isChampion` per team). Ongoing current-season brackets are supported as long as Fantrax shows a valid prefix like 16 teams in round 1, then 8 / 4 / 2 in later visible rounds. Use `--import-db` to upsert results into the local database after syncing.
- `npm run playwright:sync:regular` - Scrapes regular season standings (W/L/T/Pts/division record) for all seasons from Fantrax and saves to `src/playwright/.fantrax/fantrax-regular.json`. Sets `isRegularChampion: true` on the rank-1 team only if `fantrax-playoffs.json` already contains data for that year (season not yet complete = no champion). Flags: `--headed`, `--year=XXXX`, `--import-db`, `--slowmo=N`, `--timeout=N`
- `npm run playwright:sync:draft -- --url=https://ffhl.kld.im/threads/...` - Scrapes the maintained first post from a public FFHL entry-draft forum topic and saves `entry-draft-{season}.json` into `src/playwright/.fantrax/drafts/`. No Fantrax auth or browser install is required; supports `--out=/custom/dir`. Traded-pick owner abbreviations are resolved from parenthetical notes, non-team reward notes like `(mestari)` are ignored, and 2013 placeholder rows with `SKIPATTU` are emitted as `playerName: null`.
- `npm run playwright:sync:opening-draft -- --url=https://ffhl.kld.im/threads/...` - Scrapes the maintained first post from the public FFHL opening-draft topic and saves `opening-draft.json` into `src/playwright/.fantrax/drafts/`. No Fantrax auth or browser install is required; supports `--out=/custom/dir`. Full team names are resolved through `TEAMS`, `(via Team Name)` notes set the original owner team, and multi-hop `via` chains use the last team as the original owner.
- `npx tsx scripts/db-import-drafts.ts` - One-off importer for the scraped FFHL draft JSON files. Imports every `entry-draft-{season}.json` into `entry_draft_picks` and `opening-draft.json` into `opening_draft_picks`, defaults to `src/playwright/.fantrax/drafts/`, supports `--dir=/custom/dir`, `--season=YYYY`, `--opening-only`, and `--dry-run`, replaces entry rows by imported `season`, and fully refreshes the opening-draft table on each run. `--season=YYYY` leaves opening-draft rows untouched, while `--opening-only` leaves entry-draft rows untouched.
- `npm run playwright:import:regular` - Import regular season data via Playwright. If output is `csv/temp`, post-import script defaults to `parseAndUploadCsv`; set `RAW_UPLOAD=true` to use `parseAndUploadRawCsv` instead. Post-import remains restricted to regular files (and `--year=YYYY` when provided).
- `npm run playwright:import:playoffs` - Import playoffs data via Playwright. Without `--year`, it defaults to the most recent mapped season and only downloads teams whose mapped playoff `endDate` is yesterday or later, giving one local follow-up day after elimination. With `--year=YYYY`, it downloads all mapped playoff teams for that season unless `--remaining-teams` is also passed. If output is `csv/temp`, post-import script defaults to `parseAndUploadCsv`; set `RAW_UPLOAD=true` to use `parseAndUploadRawCsv` instead. Post-import remains restricted to playoffs files (and `--year=YYYY` when provided).
- `npm run playwright:import:transactions` - Download season transaction CSVs (`claims-YYYY-YYYY.csv`, `trades-YYYY-YYYY.csv`) into `csv/transactions/`. Defaults to the most recent mapped season, supports `--year=YYYY` and `--all`, refreshes files in place, retries failed downloads by default (`--retries`, `--retry-delay`), auto-runs `db:import:transactions` after a plain no-arg scrape when the default output dir is used, and auto-runs `r2:upload:transactions` when `USE_R2_STORAGE=true` and the default output dir is used.
- All `playwright:*` scripts run `playwright:install` automatically first so browser updates do not break local runs.
- `./scripts/handle-csv.sh input.csv [output.csv]` - Normalizes Fantrax CSV format. Preserves first-column Fantrax `ID` values when present, removes only empty placeholder first columns + `Age`, and fixes the known malformed goalie row `*06mqq*` to goalie position `G` inside the `Goalies` section.
- `scripts/csv.ts` intentionally supports two import shapes: sectioned Fantrax roster exports (`"Skaters"` / `"Goalies"`) for stats imports and ordinary header-row CSVs for transaction imports.
- `./scripts/import-temp-csv.sh [--dry-run] [--keep-temp] [--season=YYYY] [--report-type=regular|playoffs|both]` - Cleans files from `csv/temp/`, writes them to `csv/<teamId>/`, optionally uploads to R2, and imports to DB. By default it removes successfully imported source files from `csv/temp/`; use `--keep-temp` to preserve them. If `--season` is omitted it processes all matched seasons; if `--report-type` is omitted, `both` is the default. When it auto-runs `r2:upload` / `db:import:stats`, those chained steps are limited to the team IDs imported from that `csv/temp` run.

### Fantrax IDs in imports

- Fantrax roster CSVs may include an `ID` column with values like `*00qs7*`.
- Import parses these IDs and stores them as:
  - `id` for skaters
  - `id` for goalies
- The import pipeline expects Fantrax's leading `ID` column to be preserved.
- Rows with a missing Fantrax ID are skipped during DB import and reported after the import completes; the rest of the file still imports.
- Rows with `0` games are imported into the database, except playoff placeholder rows with `Status "-"` and `0` GP, which are skipped during DB import; player/goalie API queries still filter the remaining `0`-game rows out.

### Database (Turso/SQLite)

- `/teams` and `regular` / `both` season availability are derived from code-owned config and shared utilities (`src/config/settings.ts` and `src/shared/seasons.ts`), not runtime DB lookups. Only playoff season availability remains DB-backed.
- `npm run db:migrate` - Create/update database schema and performance indexes, including career lookup indexes on `player_id` and `goalie_id`
- `entry_draft_picks` and `opening_draft_picks` store FFHL forum draft history as lightweight pick rows keyed by fantasy team IDs. Entry drafts are season-scoped; opening draft rows have no season column and currently back the `/draft/original` API.
- `fantrax_entities` is the canonical global Fantrax identity registry (`fantrax_id`, `name`, `position`, `first_seen_season`, `last_seen_season`). `db:migrate` backfills it when upgrading an older database or rebuilding an empty registry, and `db:import:stats` keeps it current with incremental UPSERTs so import order does not change the seen-season range semantics. Career queries now prefer canonical metadata from this table instead of trusting the first stats row for a player/goalie.
- Goalie API responses preserve display precision for rate stats: `gaa` is serialized with two decimals and `savePercent` with three, while the database still stores numeric `REAL` values without trailing-zero padding. If a goalie has played games, zero rates are returned as `0.00` / `0.000`; zero placeholders on non-played rows remain omitted.
- Transaction CSV imports normalize into `claim_events` / `claim_event_items` and `trade_source_blocks` / `trade_block_items`. Claim/drop and trade storage are intentionally separate, transaction CSV files remain the raw source of truth in `csv/transactions/` / R2, and player links are best-effort via `fantrax_entities` plus same-season fantasy-team context from `players` / `goalies`, with latest `last_seen_season` as the fallback for merged-history duplicate Fantrax IDs. `claim_event_items` mirrors `season`, `team_id`, and `occurred_at` from `claim_events` so common claim/drop queries can hit one table directly.
- `/leaderboard/transactions` combines normalized transaction data with roster history. Claims and drops come from `claim_event_items`, trades count distinct team participations by `season + occurred_at`, and `players` / `goalies` count distinct Fantrax entity IDs from the `players` / `goalies` tables (deduped across regular/playoff rows within a season). The route is snapshot-capable through `npm run snapshot:generate -- --scope=transactions`.
- Transaction-driven career highlights (`reunion-king`, `most-trades`, `most-claims`, `most-drops`) also read the normalized transaction tables directly. `reunion-king` counts every matched claim or trade-in back to a fantasy team after that player/goalie's first matched drop from the same team and returns those return events as `reunions`. Claim/drop counts come from matched `claim_event_items`, while `most-trades` counts matched `trade_block_items` by `from_team_id` so the team breakdown represents trading players away. These payloads are part of the `career-highlights` snapshot scope.
- `/career/highlights/{type}` page payloads include `minAllowed` so clients can read the active backend threshold dynamically instead of duplicating those cutoffs in frontend copy/translations.
- `npm run db:pull:remote` - Replace `local.db` by pulling full schema + data from remote Turso (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in `.env`); creates timestamped backup in `.backups/`
- `npm run db:backups:clean` - Remove all files under `.backups/`
- `npm run db:import:stats` - Import all CSV files into database (local by default; set `USE_REMOTE_DB=true` in `.env` for remote). Regenerates only combined player/goalie snapshots after a successful import.
- `npm run db:import:stats -- --season=YYYY` - Import only one season into database (local by default; set `USE_REMOTE_DB=true` in `.env` for remote). Regenerates only combined player/goalie snapshots after a successful import.
- `npm run db:import:stats:current` - Import only current season into database. Regenerates only combined player/goalie snapshots after a successful import.
- `npm run db:import:stats -- --report-type=regular|playoffs` - Import only one report type into database. Regenerates only the matching combined snapshots plus `both`.
- `npm run db:import:stats -- --team-id=<id>` - Import only selected fantasy team IDs. Repeat `--team-id` or pass a comma-separated list to target multiple teams.
- `npm run db:import:transactions` - Incrementally import current-season transaction rows from `csv/transactions/` into database (local by default; set `USE_REMOTE_DB=true` in `.env` for remote). Updates `import_metadata.last_modified` and refreshes only the transactions snapshot. Supports `--full`, `--all`, `--season=YYYY`, `--current-only`, `--dry-run`, and `--dir=/custom/path`.
- `npm run db:import:playoff-results` - Import playoff round results from `fantrax-playoffs.json` into database (set `USE_REMOTE_DB=true` to target remote Turso). Regenerates only the playoff leaderboard snapshot after a successful import.
- `npm run db:import:regular-results` - Imports regular season standings from `fantrax-regular.json` into the `regular_results` table. Set `USE_REMOTE_DB=true` to target remote Turso. Regenerates only the regular leaderboard snapshot after a successful import.
- `npm run snapshot:generate` - Generate JSON snapshots into `generated/snapshots/`. Supports `--scope=transactions|leaderboard-regular|leaderboard-playoffs|stats|career|career-highlights|all`; if `stats` is included, `--report-type=regular|playoffs|both|all` limits which combined report snapshots are rebuilt and repeated `--team-id=<id>` flags can narrow stats regeneration to specific fantasy teams. If `USE_R2_SNAPSHOTS=true`, uploads each generated JSON payload to the configured snapshot bucket/prefix, adds `generated-at` metadata, uploads `manifest.json` last, retries transient R2/TLS failures with exponential backoff, and logs successful uploads with progress counters.
- Snapshot-backed routes expose `x-stats-data-source: snapshot|db` so you can inspect whether a successful response came from a snapshot or a live DB path.

### R2 Storage (CSV backup + optional API snapshots)

- `npm run r2:upload` - Upload all CSV files to R2
- `npm run r2:upload -- --season=YYYY` - Upload only one season to R2
- `npm run r2:upload:current` - Upload only current season to R2
- `npm run r2:upload -- --report-type=regular|playoffs` - Upload only one report type to R2
- `npm run r2:upload -- --team-id=<id>` - Upload only selected fantasy team IDs. Repeat `--team-id` or pass a comma-separated list to target multiple teams.
- `npm run r2:download` - Download CSV files from R2. Snapshot objects under the configured snapshot prefix are ignored.
- `npm run r2:upload:transactions` - Upload `csv/transactions/*.csv` to `transactions/` in R2. Supports `--season=YYYY`, `--current-only`, `--dry-run`, and `--force`.
- `npm run r2:download:transactions` - Download `transactions/*.csv` from R2 into `csv/transactions/`. Supports `--season=YYYY`, `--current-only`, `--dry-run`, and `--force`.
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
