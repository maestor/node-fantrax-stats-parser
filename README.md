# FFHL Stats API

## Purpose

Lightweight API to serve NHL fantasy league (FFHL) team stats as JSON. Data is stored in a Turso (SQLite) database and served via a scoring engine that ranks players and goalies. Raw data is originally exported from [Fantrax](https://www.fantrax.com) as CSV files, then imported into the database. The API supports multiple fantasy teams.

[UI written by Angular which uses this API.](https://github.com/maestor/fantrax-stats-parser-ui)

[UI showcase which uses this API.](https://ffhl-stats.vercel.app/)

## Installation and use

```bash
1. Install Node (>=24 <25 recommended)
2. Clone repo
3. npm install
4. Set up local database:
   npm run db:migrate
5. Get CSV data (choose one):
   a. Download from R2: cp .env.example .env && edit .env with R2 credentials && npm run r2:download
   b. Or use existing CSV files in csv/ directory
6. Import CSV data into local database:
   npm run db:import:stats
7. npm run dev
8. Go to endpoints mentioned below
```

**Note:** CSV files are only the import source. The API reads live data from Turso and can also serve generated JSON snapshots for read-mostly endpoints. The stats import pipeline also maintains a canonical `fantrax_entities` registry keyed by Fantrax ID so future joins can rely on a stable global player/goalie identity table.
Transaction imports now also normalize `csv/transactions/*.csv` into dedicated database tables for claim/drop events and trade source blocks, while keeping the CSV files as the raw source of truth.

## Endpoints

See [https://ffhl-stats-api.vercel.app/api-docs](https://ffhl-stats-api.vercel.app/api-docs) for the interactive API reference (Swagger UI).
The OpenAPI spec is also available as JSON at [https://ffhl-stats-api.vercel.app/openapi.json](https://ffhl-stats-api.vercel.app/openapi.json).

The API includes team-scoped season/combined leaderboards plus career endpoints for list, detail, and highlight lookups:
`/career/players`, `/career/goalies`, `/career/player/{id}`, `/career/goalie/{id}`, and `/career/highlights/{type}`.
Leaderboard routes are `/leaderboard/regular`, `/leaderboard/playoffs`, and `/leaderboard/transactions`.
The highlights route supports `skip` / `take` paging and the route tokens `most-teams-played`, `most-teams-owned`, `same-team-seasons-played`, `same-team-seasons-owned`, `most-stanley-cups`, `reunion-king`, `stash-king`, `regular-grinder-without-playoffs`, `most-trades`, `most-claims`, and `most-drops`.
Each career highlight page also includes `minAllowed`, the backend threshold used for that highlight leaderboard.
`reunion-king` items include a `reunions` array of `{ date, type }` entries, where `type` is `claim` or `trade`.
`regular-grinder-without-playoffs` items include the played fantasy `teams` list in addition to `regularGames`.
Transaction highlight items include total `transactionCount` plus a per-team `teams` breakdown with per-team `count` values sorted descending; `most-trades` uses the fantasy team that traded the player away.
Current highlight minimums are: `most-teams-played` 4, `most-teams-owned` 5, `same-team-seasons-played` 8, `same-team-seasons-owned` 10, `most-stanley-cups` 2, `reunion-king` 2, `stash-king` 10, `regular-grinder-without-playoffs` 60, `most-trades` 4, and `most-claims` / `most-drops` 3.

### Viewing docs locally

Start the dev server (`npm start`), then open [http://localhost:3000/api-docs](http://localhost:3000/api-docs).

### Updating the spec

The spec is hand-crafted in `openapi.yaml` at the repo root — there is no code generation. To update it:

1. Edit `openapi.yaml` (copy an existing path/schema block as a template)
2. Run `npm test` — the YAML smoke test, route coverage test, and schema conformance tests must all pass
3. Restart the dev server and visit `/api-docs` to preview the changes

**Key files:**

- `openapi.yaml` — the spec source
- `src/openapi.ts` — route handlers that serve `/openapi.json` and `/api-docs`
- `src/index.ts` — registers the two public routes

## Documentation

- [Testing Requirements](docs/TESTING.md)
- [Development Guide](docs/DEVELOPMENT.md)

## Testing

```
npm test              # Run all tests
npm run test:integration # Run DB-backed integration tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run unused        # Detect unused production exports
npm run verify        # Full quality gate (lint + typecheck + unused exports + build + coverage)
```

Coverage reports are generated in the `coverage/` directory. The `npm run verify` command runs ESLint, TypeScript compilation, Knip export analysis, production build, and Jest with enforced 100% global coverage thresholds. For route/service/database behavior, the suite now also includes DB-backed integration tests that run against a temporary SQLite database with isolated snapshot storage, so behavior can be validated with less internal mocking. OpenAPI schema conformance is also checked against live route responses for the DB-backed endpoints instead of relying only on handcrafted mocked payloads, and the larger helper/service/mapping/query unit suites are split into focused files so the 100%-coverage surface stays readable. Season selection, season-label formatting, and route-visible row normalization now lean on those live route responses instead of duplicating the same happy-path expectations in thin helper/query unit tests.

## CI

This repository runs a GitHub Actions workflow on:

- every pull request to `main`
- every push to `main`

The CI check runs the full verification command:

```
npm run verify
```

That command runs lint, TypeScript build, and Jest with the enforced global coverage thresholds. The workflow definition is in `.github/workflows/ci.yml`.

## Import Fantrax data

This repo includes a small, local-only Playwright-based importer that:

- logs into Fantrax once and saves a reusable auth state file
- downloads each team’s roster stats CSV into `csv/temp/` (regular season and playoffs via separate scripts)

It’s intended to be run locally (not in CI / not in production).

### Prerequisites

- `npm install`
- Playwright scripts now run `playwright install chromium` automatically before launch, so browser binaries are installed or refreshed as needed.

### 1) Login (saves auth state)

Run:

```
npm run playwright:login
```

This first ensures Chromium is installed, then opens a real browser so you can log in manually and saves the session to `src/playwright/.fantrax/fantrax-auth.json` (gitignored).

### 2) Sync league IDs (local mapping)

Run:

```
npm run playwright:sync:leagues
```

This scrapes your Fantrax league archive + each season’s Rules page and writes a local mapping file to `src/playwright/.fantrax/fantrax-leagues.json` (gitignored).

The mapping includes:

- `leagueId` per season
- `regularStartDate` / `regularEndDate`
- `playoffsStartDate` / `playoffsEndDate`

This repo does **not** store Fantrax league IDs (or scraped dates) in source control.

Optional:

- `--league="Finnish Fantasy Hockey League"` to select the exact league name from the archive if your account has multiple leagues.

### 2b) Sync playoffs teams (local mapping)

Run:

```
npm run playwright:sync:playoffs
```

This opens each season’s Fantrax Playoffs bracket page and writes a local mapping file to `src/playwright/.fantrax/fantrax-playoffs.json` (gitignored).

The mapping includes, per season year:

- which `TEAMS` entries made playoffs (must be 16 teams)
- each playoff team's `startDate` and `endDate` for their playoff run
- each playoff team's `roundReached` (1–4) and `isChampion` flag

If the script can't determine exactly 16 playoff teams for a season (or can't parse the bracket periods), it will skip that season and print a `Manual needed:` message.

Useful options:

- `--year=2024` (only sync a single season)
- `--timeout=120000` (increase timeouts for slow Fantrax page loads)
- `--debug` (prints bracket hint lines when parsing fails)
- `--import-db` (after syncing, upsert playoff round results into the local database)

### 2c) Sync regular season standings (local mapping)

Run:

```
npm run playwright:sync:regular
```

This opens each season's Fantrax COMBINED standings page and writes a local mapping file to `src/playwright/.fantrax/fantrax-regular.json` (gitignored).

The mapping includes, per season year:

- each team's `wins`, `losses`, `ties`, `points`
- division record: `divWins`, `divLosses`, `divTies`
- `isRegularChampion` flag — `true` for the rank-1 team, **only if** `fantrax-playoffs.json` already contains data for that year (a season still in progress has no champion yet)

Useful options:

- `--year=2024` (only sync a single season)
- `--headed` (default is headless)
- `--slowmo=250` (slows down actions for debugging)
- `--timeout=120000` (increase timeouts for slow Fantrax page loads)
- `--import-db` (after syncing, upsert results into the local database)

After syncing, you can import separately without re-scraping:

```
npm run db:import:regular-results
```

Set `USE_REMOTE_DB=true` in `.env` to target a remote Turso database instead of `local.db`.

### 3) Download regular-season roster CSVs

Run:

```
npm run playwright:import:regular
```

Notes:

- Output directory defaults to `./csv/temp/`.
- The season year must exist in your local synced mapping file (`fantrax-leagues.json`).
- If `--year` is omitted, the importer defaults to the most recent season year in `fantrax-leagues.json`.
- After downloading, the importer runs `npm run parseAndUploadCsv` automatically when output dir is `./csv/temp/`.
- Set `RAW_UPLOAD=true` to make Playwright import run `parseAndUploadRawCsv` instead (uploads raw `csv/temp` files to `rawFiles/` in R2 and cleans temp files).
- If `--year=YYYY` is provided, the post-import parse/upload/import pipeline is restricted to that same season only.
- The post-import parse/upload/import pipeline is restricted to `regular` files only.
- Filenames follow: `{teamSlug}-{teamId}-regular-YYYY-YYYY.csv`.

The importer uses roster-by-date mode and includes both `startDate` and `endDate` based on the synced season period dates, to ensure the correct timeframe is selected.

Useful options:

- `--year=2025` (override which season to download)
- `--headed` (default is headless)
- `--slowmo=250` (slows down actions for debugging)
- `--pause=500` (sleep between teams; default `250`)
- `--out=./csv/temp/` (override output dir; can also set `CSV_OUT_DIR`)

### 3b) Download playoffs roster CSVs

Run:

```
npm run playwright:import:playoffs
```

Notes:

- Requires the playoffs mapping file from step 2b (`fantrax-playoffs.json`).
- Output directory defaults to `./csv/temp/`.
- If `--year` is omitted, the importer defaults to the most recent season year in `fantrax-playoffs.json`.
- After downloading, the importer runs `npm run parseAndUploadCsv` automatically when output dir is `./csv/temp/`.
- Set `RAW_UPLOAD=true` to make Playwright import run `parseAndUploadRawCsv` instead (uploads raw `csv/temp` files to `rawFiles/` in R2 and cleans temp files).
- If `--year=YYYY` is provided, the post-import parse/upload/import pipeline is restricted to that same season only.
- The post-import parse/upload/import pipeline is restricted to `playoffs` files only.
- Filenames follow: `{teamSlug}-{teamId}-playoffs-YYYY-YYYY.csv`.

Useful options:

- `--year=2025` (override which season to download)
- `--headed` (default is headless)
- `--slowmo=250` (slows down actions for debugging)
- `--pause=500` (sleep between teams; default `250`)
- `--out=./csv/temp/` (override output dir; can also set `CSV_OUT_DIR`)

### 3c) Download transaction CSVs

Run:

```
npm run playwright:import:transactions
```

Notes:

- Uses the season-to-league mapping from step 2 (`fantrax-leagues.json`).
- Output directory defaults to `./csv/transactions/`.
- If `--year` is omitted, the importer defaults to the most recent mapped season year in `fantrax-leagues.json`.
- Use `--all` to download every mapped season in one run.
- Filenames follow: `claims-YYYY-YYYY.csv` and `trades-YYYY-YYYY.csv`.
- Transaction files are refreshed in place so the current season can be scraped repeatedly without manual cleanup.
- Each file download retries automatically by default (`--retries=2`, meaning 3 total attempts).
- If run without `--year` or `--all` and output dir is the default `./csv/transactions/`, the importer also runs `npm run db:import:transactions` automatically after scraping.
- If `USE_R2_STORAGE=true` and output dir is the default `./csv/transactions/`, the importer runs `npm run r2:upload:transactions` automatically after scraping.

Useful options:

- `--year=2025` (download one season only)
- `--all` (download all mapped seasons)
- `--headed` (default is headless)
- `--slowmo=250` (slows down actions for debugging)
- `--pause=500` (sleep between downloads; default `250`)
- `--retries=4` (retry a failed download 4 extra times)
- `--retry-delay=5000` (wait 5s between retries; default `2000`)
- `--out=./csv/transactions/` (override output dir; auto-upload is skipped for custom output dirs)

### 3d) Import transaction CSVs into the database

Run:

```bash
npm run db:import:transactions
```

Notes:

- Defaults to current-season incremental import, so only current-season rows at or after the latest imported timestamp are reprocessed.
- Use `--full` to force a full current-season replace.
- Use `--all` for a full all-seasons rebuild.
- Use `--season=YYYY` for a full import of one explicit season.
- Also supports `--current-only`, `--dry-run`, and `--dir=/custom/path`.
- Stores claim/drop groups in `claim_events` + `claim_event_items`, with `claim_event_items` also mirroring `season`, `team_id`, and `occurred_at` for direct feed-style queries.
- Stores trade rows in `trade_source_blocks` + `trade_block_items`.
- Ignores `Lineup Change` rows.
- Treats `(Drop)` rows inside trade CSVs as normal drop events, not as trade assets.
- Ignores commissioner-fix one-way trade blocks.
- Resolves player links through `fantrax_entities` first, then same-season fantasy-team context from `players` / `goalies` when duplicate names exist, with latest `last_seen_season` as the fallback for merged-history duplicate Fantrax IDs.
- Leaves unresolved player rows in the database with null `fantrax_entity_id` plus explicit match metadata.

### 4) Normalize + move downloaded files into `csv/<teamId>/`

The Playwright importer downloads raw Fantrax CSVs. To convert them into the format this API expects and move them into the main dataset layout, run:

```
./scripts/import-temp-csv.sh --dry-run
./scripts/import-temp-csv.sh
./scripts/import-temp-csv.sh --report-type=regular
./scripts/import-temp-csv.sh --report-type=playoffs
```

## Fantrax CSV handling

Fantrax exports often include an `Age` column and may include an `ID` column as the first data column. The scripts below normalize the CSVs into the format this API expects.

### Clean a single CSV

- Script: `scripts/handle-csv.sh`
- Usage: `./scripts/handle-csv.sh input.csv [output.csv]`

What it does:

- Keeps first-column `ID` values when present (e.g. `*00qs7*`) and removes only empty placeholder first columns used in section marker rows
- Removes the `Age` column
- Converts section headers into the format the parser expects (`"Skaters"`, `"Goalies"`)
- Forces known malformed goalie row `*06mqq*` to normalized goalie position `G` when it appears inside the `Goalies` section

ID behavior:

- When an `ID` column is present, import parses it and stores it in DB/API as:
  - `id` for skaters
  - `id` for goalies
- The import pipeline expects Fantrax's leading `ID` column to be preserved.
- Rows with a missing Fantrax ID are skipped during DB import and reported after the import completes; the rest of the file still imports.
- Rows with `0` games are imported into the database, but player/goalie API responses currently filter them out.

### Import files from `csv/temp`

- Script: `scripts/import-temp-csv.sh`
- Supports `--keep-temp`, `--season=YYYY`, and `--report-type=regular|playoffs|both` filters
- Assumes input files in `csv/temp/` are named:
  - `{teamName}-{teamId}-{regular|playoffs}-YYYY-YYYY.csv`

It will:

- Read matching files from `csv/temp/`
- Clean them using `scripts/handle-csv.sh`
- Write the cleaned CSVs to the API layout:
  - `csv/<teamId>/{regular|playoffs}-YYYY-YYYY.csv`
- Create `csv/<teamId>/` if it doesn't exist
- Upload to R2 if `USE_R2_STORAGE=true` (CSV backup)
- Import into database (`npm run db:import:stats`) and regenerate API snapshots
- Clean up temp files after successful DB import, unless `--keep-temp` is used
- If `--season` is omitted, all matched seasons are uploaded/imported
- If `--report-type` is omitted, `both` is the default and all matched report types are uploaded/imported

Preview without writing:

```
./scripts/import-temp-csv.sh --dry-run
```

Import (write cleaned files):

```
./scripts/import-temp-csv.sh
./scripts/import-temp-csv.sh --keep-temp
```

Import a single season only:

```
./scripts/import-temp-csv.sh --season=2018
```

Import only one report type:

```
./scripts/import-temp-csv.sh --report-type=regular
./scripts/import-temp-csv.sh --report-type=playoffs
./scripts/import-temp-csv.sh --report-type=both
./scripts/import-temp-csv.sh --season=2018 --report-type=playoffs
```

## Deployment (Vercel)

This API can be deployed to Vercel as Serverless Functions.

Hosted demo (API-key protected): https://ffhl-stats-api.vercel.app/

### Routing

This repository includes Vercel `routes` so you can call the API from the root (recommended). Internally, requests are served by Vercel Serverless Functions under `/api/*`. The hosted demo supports both root-style URLs and `/api/*` URLs (no redirects required).

Examples (both styles work):

- `GET /seasons` and `GET /api/seasons`
- `GET /health` and `GET /api/health`

### Vercel project settings

- **Framework Preset**: Other
- **Build Command**: `npm run build`
- **Output Directory**: (leave empty)

Required environment variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and API key configuration.

### Data storage

**Production:** The API reads from a Turso (SQLite) database. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Vercel environment variables.

**Local development:** The API reads from a local SQLite file (`local.db`), created by running `npm run db:migrate` and `npm run db:import:stats`.

**CSV files** are the import source. They can be stored locally in `csv/<teamId>/` and optionally backed up to Cloudflare R2. Runtime responses come from Turso or generated JSON snapshots, not from CSV files.

Multi-team CSV layout (local or R2):

- `<teamId>/regular-YYYY-YYYY.csv`
- `<teamId>/playoffs-YYYY-YYYY.csv`

Team configuration is defined in `src/constants.ts` (`TEAMS` and `DEFAULT_TEAM_ID`).


### Example requests

```
curl https://ffhl-stats-api.vercel.app/health
curl https://ffhl-stats-api.vercel.app/seasons

# Hosted demo: data endpoints may require an API key
curl -H "x-api-key: <your-key>" https://ffhl-stats-api.vercel.app/seasons

# Check when data was last updated
curl -H "x-api-key: <your-key>" https://ffhl-stats-api.vercel.app/last-modified

# Team selection (optional, defaults to teamId=1)
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/seasons?teamId=1"
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/seasons/playoffs?teamId=1"
curl -H "x-api-key: <your-key>" https://ffhl-stats-api.vercel.app/teams

# Deep route example
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/players/combined/playoffs?teamId=1"

# Leaderboards
curl -H "x-api-key: <your-key>" https://ffhl-stats-api.vercel.app/leaderboard/regular
curl -H "x-api-key: <your-key>" https://ffhl-stats-api.vercel.app/leaderboard/playoffs
curl -H "x-api-key: <your-key>" https://ffhl-stats-api.vercel.app/leaderboard/transactions

# Filter by season (startFrom parameter)
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/seasons?startFrom=2020"
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/players/combined/regular?startFrom=2020"
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/goalies/combined/playoffs?startFrom=2018"

# Same endpoints via /api
curl https://ffhl-stats-api.vercel.app/api/health
curl https://ffhl-stats-api.vercel.app/api/seasons
```

### Leaderboard response notes

- `GET /leaderboard/regular` returns all-time aggregate stats plus:
  - `seasons`: per-season regular results (includes `season`, `regularTrophy`, W/L/T, points, division record, and per-season percentages)
- `GET /leaderboard/playoffs` returns all-time aggregate playoff rounds plus:
  - `seasons`: one item per season year
  - each item has `season`, `round`, and `key`
  - if a season has no DB row for that team, it is returned as `round: 0` and `key: "notQualified"`
- `GET /leaderboard/transactions` returns all-time claim/drop/trade totals plus:
  - `seasons`: one item per season year with `claims`, `drops`, and `trades`
  - `trades` counts distinct team participations by `season + occurredAt`

## Cloud Storage (Cloudflare R2)

Cloudflare R2 can be used for two separate purposes:

- CSV backup and sharing
- generated API snapshot storage for read-mostly endpoints

### Configuration (environment variables for R2 scripts)

```bash
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=ffhl-stats-csv
USE_R2_SNAPSHOTS=false
# R2_SNAPSHOT_BUCKET_NAME=ffhl-stats-snapshots  # Optional; defaults to R2_BUCKET_NAME
# R2_SNAPSHOT_PREFIX=snapshots                  # Optional object prefix
# R2_SNAPSHOT_MAX_ATTEMPTS=4                    # Optional retry cap for transient snapshot R2 failures
# R2_SNAPSHOT_RETRY_BASE_DELAY_MS=250           # Optional exponential backoff base delay for snapshot R2 retries
# SNAPSHOT_DIR=generated/snapshots              # Optional local snapshot directory
# SNAPSHOT_CACHE_TTL_MS=60000                   # Optional in-memory snapshot cache ttl
```

### Managing R2 Data

**Upload CSV files to R2:**

```bash
npm run r2:upload          # Upload all files
npm run r2:upload:current  # Upload only current season
npm run r2:upload -- --season=2018 # Upload only 2018-2019 files
npm run r2:upload -- --report-type=regular # Upload only regular files
npm run r2:upload:dry      # Preview without uploading
```

**Upload raw temp CSV files to `rawFiles/` in R2 (force overwrite + cleanup):**

```bash
npm run r2:upload:raw                  # Upload csv/temp -> rawFiles/<teamId>/..., remove uploaded temp files
npm run r2:upload:raw -- --season=2025 # Upload only one season's raw files
npm run r2:upload:raw -- --report-type=playoffs
npm run r2:upload:raw -- --keep-temp   # Upload raw files but keep csv/temp files
npm run r2:upload:raw:dry              # Preview without uploading/removing
```

**Upload transaction CSV files to `transactions/` in R2:**

```bash
npm run r2:upload:transactions                  # Upload all transaction CSVs from csv/transactions
npm run r2:upload:transactions -- --season=2025 # Upload only one season
npm run r2:upload:transactions -- --current-only
npm run r2:upload:transactions:dry
```

**Download CSV files from R2 (for local development):**

```bash
npm run r2:download                   # Download new files (skips existing)
npm run r2:download:force             # Overwrite all existing files
npm run r2:download:dry               # Preview without downloading
npm run r2:download -- --team=1       # Download only team 1
npm run r2:download -- --force        # Force overwrite existing files
```

`npm run r2:download` skips runtime snapshot objects under the configured snapshot prefix.

**Download transaction CSV files from `transactions/` in R2 to `csv/transactions/`:**

```bash
npm run r2:download:transactions                  # Download all transaction CSVs
npm run r2:download:transactions -- --season=2025 # Download only one season
npm run r2:download:transactions -- --current-only
npm run r2:download:transactions:force
```

**Download raw temp CSV files from `rawFiles/` in R2 to `csv/temp/`:**

```bash
npm run r2:download:raw      # Download all rawFiles into csv/temp (force overwrite)
npm run r2:download:raw:dry  # Preview rawFiles download
npm run r2:download:raw -- --dry-run --force
```

**Automatic upload during import:**

When `USE_R2_STORAGE=true`, the import pipeline automatically uploads to R2 and imports into the database:

```bash
npm run parseAndUploadCsv  # Loads .env, cleans CSVs, uploads to R2, imports to DB
npm run parseAndUploadRawCsv # Loads .env, uploads raw csv/temp files to rawFiles/, removes uploaded temp files
```

The transaction scraper also auto-uploads when `USE_R2_STORAGE=true` and files are written to the default `csv/transactions/` directory:

```bash
npm run playwright:import:transactions
```

## API snapshots

Read-mostly endpoints can be served from generated JSON snapshots. This is intended to cut Turso traffic and reduce response time for historical payloads.

Currently snapshotted response families are:

- `/career/players`
- `/career/goalies`
- `/career/highlights/{type}` for every supported highlight type, including the transaction-based `most-trades`, `most-claims`, and `most-drops`
- `/leaderboard/regular`
- `/leaderboard/playoffs`
- `/leaderboard/transactions`
- `/players/combined/{reportType}?teamId=<id>` when `startFrom` is omitted or matches the team's default start season
- `/goalies/combined/{reportType}?teamId=<id>` when `startFrom` is omitted or matches the team's default start season

Behavior:

- `db:import:stats` refreshes `import_metadata.last_modified` and then runs `npm run snapshot:generate -- --scope=stats`
- `db:import:stats -- --report-type=regular` regenerates `regular` and `both` combined player/goalie snapshots
- `db:import:stats -- --report-type=playoffs` regenerates `playoffs` and `both` combined player/goalie snapshots
- `db:import:playoff-results` refreshes only `/leaderboard/playoffs`
- `db:import:regular-results` refreshes only `/leaderboard/regular`
- `db:import:transactions` refreshes `import_metadata.last_modified` and then refreshes only `/leaderboard/transactions`
- snapshots are written locally to `generated/snapshots/`
- if `USE_R2_SNAPSHOTS=true`, the same generation step uploads each snapshot JSON to `R2_SNAPSHOT_BUCKET_NAME` (or `R2_BUCKET_NAME`) under `R2_SNAPSHOT_PREFIX/...`, then uploads `manifest.json` last
- snapshot uploads store `Content-Type: application/json` plus `generated-at` object metadata
- transient snapshot R2 failures (including TLS/network hiccups) are retried automatically with exponential backoff; tune with `R2_SNAPSHOT_MAX_ATTEMPTS` and `R2_SNAPSHOT_RETRY_BASE_DELAY_MS`
- when R2 snapshot upload is enabled, the generator logs each successful object upload with progress counters so long runs show forward movement
- at runtime the API tries local snapshots first, then R2, and finally falls back to live DB queries
- successful responses expose `x-stats-data-source: snapshot` or `x-stats-data-source: db`
- career and career-highlight snapshots are intentionally manual-only after stats imports; existing snapshots continue serving until you regenerate them

Manual generation:

```bash
npm run snapshot:generate
npm run snapshot:generate -- --scope=stats --report-type=regular
npm run snapshot:generate -- --scope=career --scope=career-highlights
npm run snapshot:generate -- --scope=transactions
```

## Database (Turso/SQLite)

The API reads all data from a Turso (libSQL/SQLite) database. CSV files are imported into the database via the import pipeline.

Stats imports also maintain a global `fantrax_entities` table with one row per Fantrax ID. Each row stores the canonical Fantrax `name`, `position`, and the `first_seen_season` / `last_seen_season` bounds derived from imported data. `npm run db:migrate` backfills this table when upgrading an older database or rebuilding an empty registry, and later `db:import:stats` runs keep it incrementally in sync with cheap UPSERTs instead of full refreshes. Career endpoints now prefer canonical name/position data from this registry while still aggregating season/team stats from `players` and `goalies`.
Transaction imports use that same registry to link claim/drop/trade player rows whenever possible. Matching prefers exact `name + position`, then same-season fantasy-team context, and finally the candidate with the latest `last_seen_season` when duplicate Fantrax IDs appear to represent merged player history. Normalized transaction storage lives in four tables: `claim_events`, `claim_event_items`, `trade_source_blocks`, and `trade_block_items`. `claim_event_items` also mirrors `season`, `team_id`, and `occurred_at` from its parent event so most claim/drop lookups can read straight from the item table.

### Local development

No Turso account needed. The database scripts default to a local SQLite file (`local.db`):

```bash
npm run db:migrate        # Create database schema
npm run db:import:stats         # Import all CSV files into local database
npm run db:import:stats:current # Import only current season into local database
npm run db:import:stats -- --season=2018 # Import only 2018-2019 into local DB
npm run db:import:stats -- --report-type=playoffs # Import only playoffs
npm run db:import:transactions  # Incrementally import current-season transaction rows
npm run db:import:transactions -- --full
npm run db:import:transactions -- --all
npm run db:import:transactions -- --season=2025
```

If you already have production data in Turso and want to replace local SQLite with it:

```bash
# .env must contain remote TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
npm run db:pull:remote
npm run db:backups:clean # optional: remove local DB backups when no longer needed
```

This command creates a timestamped backup of an existing `local.db` in `.backups/` first, then copies remote schema + data into `local.db`.

### Production (Turso hosted)

Set these environment variables in `.env`:

```bash
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-auth-token
USE_REMOTE_DB=true
```

Then import to remote:

```bash
npm run db:import:stats         # Import all CSV files into remote Turso
npm run db:import:stats:current # Import only current season into remote Turso
npm run db:import:stats -- --season=2018 # Import only 2018-2019 into remote Turso
npm run db:import:stats -- --season=2018 --report-type=regular # Import only regular from one season
npm run db:import:transactions  # Incrementally import current-season transaction rows into remote Turso
npm run db:import:transactions -- --all
```

Successful imports regenerate only the snapshot scopes they directly affect. Career and career-highlight snapshots are manual unless you run `npm run snapshot:generate` with the matching scopes.

Get credentials from the [Turso dashboard](https://turso.tech).

## API key authentication (production)

This service supports a simple API-key check for production usage.

- **How it works**: when enabled, requests to data endpoints (`/teams`, `/last-modified`, `/seasons`, `/players/*`, `/goalies/*`) must include an API key.
- **Unauthenticated** health endpoints remain public: `/health` and `/healthcheck`.

### Configuration (env vars)

- `API_KEY` - Single API key.
- `API_KEYS` - Comma-separated list of valid API keys.
- `REQUIRE_API_KEY` - Optional override (`true`/`false`). If not set, auth is required when at least one key is configured.
- `API_KEY_HEADER` - Optional header name (default `x-api-key`).

### Client usage

Send the key either as a header:

```
curl -H "x-api-key: <your-key>" http://localhost:3000/seasons
```

Or as Bearer auth:

```
curl -H "Authorization: Bearer <your-key>" http://localhost:3000/seasons
```

### Parameters

`reportType` - Required for most endpoints (players/goalies routes). For `/seasons`, it’s optional and can be provided as `/seasons/regular` or `/seasons/playoffs` (default: `regular`).

`teamId` - Optional query param. Selects which team dataset to use. If missing or unknown, defaults to `DEFAULT_TEAM_ID`.

`season` - Optional. Needed only in single season endpoint. Starting year of the season want to check. If not specified, latest available season will show.

`startFrom` - Optional. Filter results to start from a specific season (inclusive). Works with `/seasons` endpoint to filter which seasons are returned, and with combined endpoints (`/players/combined`, `/goalies/combined`) to filter which seasons are included in aggregation. Starting year of the first season to include. If not specified, all available seasons are included. Example: `startFrom=2020` returns data from 2020-2021 season onwards.

## Caching

Data endpoints (`/teams`, `/last-modified`, `/seasons`, `/players/*`, `/goalies/*`) are cached in two layers:

- **In-memory per instance**: results are memoized to avoid repeated database queries.
- **Edge-friendly HTTP caching**: successful `200` responses include `ETag` and `Cache-Control: s-maxage=...`, and clients/CDNs can use `If-None-Match` to get `304` responses.

Because this API uses header-based API keys, responses include `Vary: authorization, x-api-key` by default to keep caching safe.

### Using `/last-modified` for Change Detection

Consumer applications can poll the `/last-modified` endpoint to detect when data has been updated:

```typescript
let lastKnownTimestamp: string | null = null;

async function checkForUpdates() {
  const response = await fetch("https://your-api.com/last-modified", {
    headers: { "X-API-Key": "your-api-key" },
  });
  const data = await response.json();

  if (data.lastModified !== lastKnownTimestamp) {
    console.log("Data updated! Refetching stats...");
    lastKnownTimestamp = data.lastModified;
    await refetchAllStats();
  }
}

// Poll every 5 minutes
setInterval(checkForUpdates, 5 * 60 * 1000);
```

The endpoint supports ETag-based caching, so repeated requests with the same data return `304 Not Modified` responses with minimal overhead.

## Scoring algorithm

Each player and goalie item returned by the stats endpoints includes a computed `score` field, an additional games-adjusted `scoreAdjustedByGames` field, plus a per-stat breakdown in a `scores` object.

- **Range and precision**: `score` and `scoreAdjustedByGames` are numbers between 0 and 100, rounded to two decimals.
- **Player scoring fields**: `goals`, `assists`, `points`, `plusMinus`, `penalties`, `shots`, `ppp`, `shp`, `hits`, `blocks`.
- **Goalie scoring fields**: `wins`, `saves`, `shutouts`, and when available `gaa` (goals against average) and `savePercent`.

Scoring is calculated in three steps:

1. **Per‑stat normalization**
   - For most non‑negative fields (goals, assists, points, penalties, shots, ppp, shp, hits, blocks), scoring normalizes from a baseline of 0 up to the maximum value observed in the current result set. A value of 0 maps to 0, the maximum maps to 100, and values in between are placed linearly between them.
   - For `plusMinus`, scoring uses the minimum and maximum values observed in the result set, and the minimum can be negative. The worst `plusMinus` maps to 0, the best to 100, and values in between are placed linearly between them (for example, with max = 20 and min = -10, `plusMinus` 5 is halfway between and scores 50.0 for that component).
   - For goalies, base stats (`wins`, `saves`, `shutouts`) use **dampened scoring** to avoid extreme gaps when only 2-3 goalies exist. Instead of linear scaling, scoring uses `Math.pow(value / max, 0.5) * 100` (square root dampening). This compresses the score range while preserving rank order (e.g., with max 26 wins, 14 wins scores 73.4 instead of 53.8). The dampening exponent is configured by `GOALIE_SCORING_DAMPENING_EXPONENT` in `src/constants.ts`.
   - For goalies, `savePercent` and `gaa` are scored relative to the best value in the dataset using more stable scaling rather than raw min/max. For `savePercent`, a fixed baseline defined by `GOALIE_SAVE_PERCENT_BASELINE` in `src/constants.ts` (default .850) maps to 0 points and the best save% in the result set maps to 100, with other values placed linearly between; for `gaa`, the lowest GAA maps to 100 and other goalies are down‑weighted linearly based on how much worse they are than the best, up to a configurable cutoff defined by `GOALIE_GAA_MAX_DIFF_RATIO` in `src/constants.ts` (default 0.75, meaning 75% worse = 0 points). This avoids extreme 0/100 scores when all available goalies have very similar advanced stats.

2. **Overall score (per item)**
   - For each item, scores from all scoring fields are summed and divided by the number of fields that actually contributed for that item (for goalies this means `gaa` and `savePercent` are only counted when present).
   - The result is clamped to the `[0, 100]` range and rounded to two decimals.

3. **Best‑in‑set normalization**
   - After per-item scores are computed, the best `score` in the current result set is always mapped to exactly 100.
   - All other positive `score` values are scaled proportionally relative to that best score, preserving ordering (for example, if one player originally scored 80 and the best scored 90, they end up at roughly 88.89 after normalization).

4. **Games‑adjusted score (`scoreAdjustedByGames`)**
   - `scoreAdjustedByGames` is a pace metric. It uses per-game values instead of totals.
   - Players and goalies with fewer than `MIN_GAMES_FOR_ADJUSTED_SCORE` games (configured in `src/constants.ts`, default 1) still get `scoreAdjustedByGames = 0`.
   - To avoid one-game spikes dominating rare categories, each eligible per-game stat is stabilized toward the pool-average rate for that category before scoring. The pool-average rate is weighted by total games in the current result set.
   - Stabilization strength is controlled by category-specific prior-game constants in `src/constants.ts`:
     `PLAYER_ADJUSTED_SCORE_PRIOR_GAMES` for skaters and `GOALIE_ADJUSTED_SCORE_PRIOR_GAMES` for goalies.
   - Rare stats such as `shp` use a stronger prior than common stats such as `shots`, so short-sample spikes are dampened more aggressively while real pace over larger samples still shows through.
   - For players, stabilized per-game values are normalized using the same stat rules as the main score (including `plusMinus` range scoring). For goalies, `scoreAdjustedByGames` uses stabilized per-game `wins`, `saves`, and `shutouts`; advanced stats (`gaa`, `savePercent`) still do not contribute.
   - Finally, among all eligible players or goalies in the result set, the best stabilized `scoreAdjustedByGames` is normalized to exactly 100, and all other positive adjusted scores are scaled proportionally relative to that best stabilized pace score. Items below the minimum games threshold always remain at 0.

5. **Position‑based scoring (players only)**
   - In addition to the overall `score`, players also receive position-based scores where they are compared only against players of the same position (Forward "F" or Defenseman "D").
   - `position`: The player's position ("F" or "D").
   - `scoreByPosition`: Overall score compared to same position only (0–100 scale).
   - `scoreByPositionAdjustedByGames`: Stabilized per-game pace score compared to the same position only.
   - `scoresByPosition`: Per-stat breakdown (e.g., `scoresByPosition.goals`) compared to same position only.
   - This allows fairer comparisons since forwards and defensemen typically have different stat profiles.
   - Position-based scores are included in both single-season and combined endpoints, including each entry in the `seasons` array for combined data.

In addition to the overall `score`, each item exposes a `scores` object containing the normalized 0–100 value for every individual scoring stat before weights are applied (for example, `scores.goals`, `scores.hits`, `scores.wins`, `scores.savePercent`, `scores.gaa`). This makes it easy to see which categories drive a player's or goalie's total score.

For the combined endpoints (`/players/combined` and `/goalies/combined`), the root-level items are scored using their full combined stats across all seasons, and each entry in the `seasons` array also includes its own per-season `score`, `scoreAdjustedByGames`, and `scores` object computed exactly as in the single-season endpoints, but normalized within that specific season.

### Weights

By default every scoring field has weight `1.0` (full value), so they all contribute equally.

Weights are defined in `src/constants.ts`:

- `PLAYER_SCORE_WEIGHTS` controls player fields.
- `GOALIE_SCORE_WEIGHTS` controls goalie fields.

Each weight is a decimal between 0 and 1. Lowering a weight reduces the impact of that stat on the final `score` without changing the 0–100 range. To change the scoring model, adjust these weight constants and restart the server.

## Technology

Written with [TypeScript](https://www.typescriptlang.org/), using [micro](https://github.com/zeit/micro) with [NodeJS](https://nodejs.org) for routing. Data stored in [Turso](https://turso.tech) (libSQL/SQLite). CSV import uses [csvtojson](https://github.com/Keyang/node-csvtojson) for parsing source files.

## Future roadmap

- Reorganize `src/` iteratively so the root keeps only obvious entrypoints while domain code moves under stable `config` / `features` / `db` / `infra` / `playwright` / `shared` buckets. Status: planning completed, implementation not started. See [docs/plans/2026-03-15-reorganizing-codebase.md](docs/plans/2026-03-15-reorganizing-codebase.md).
- Standardize request validation + error response shape
- Tighten OpenAPI spec: type `scores` and `scoresByPosition` object keys as fixed stat-field enums (requires upgrading spec to OpenAPI 3.1 for `propertyNames` support)
- Add paging or search-first loading for large career lists to reduce initial payload size further

Feel free to suggest feature / implementation polishing with writing issue or make PR if you want to contribute!
