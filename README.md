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

**Note:** The API reads all data from the database. CSV files are only needed as the import source.

## Endpoints

`/teams` - Available teams list (item format `{ id: '1', name: 'colorado', presentName: 'Colorado Avalanche' }`, may also include optional `nameAliases` array and `firstSeason` number for expansion teams)

`/last-modified` - Returns the timestamp of the last data import (format: `{ lastModified: '2026-01-30T15:30:00.000Z' }`). The timestamp is stored in the database and updated automatically by the import script. Useful for polling to detect when data has been updated. Returns `null` if no import has been run.

`/seasons` - Available seasons list (item format `{ season: 2012, text: '2012-2013' }`)

- Report type can be provided as a path segment:
- `/seasons/regular`, `/seasons/playoffs`, or `/seasons/both` (default: `regular` when omitted)
- Note: `both` is accepted for compatibility and behaves like `regular` for seasons.

`/players/season/:reportType/:season` - Get player stats for a single season

`/players/combined/:reportType` - Get player stats combined (repository data starting from 12-13 season). Includes a 'seasons' array with individual season stats, each of which also has its own per-season `score`, `scoreAdjustedByGames`, and `scores` metadata.

Report type values:

- `regular` / `playoffs`: return the corresponding dataset.
- `both`: merges `regular` + `playoffs` stats together, then calculates scores after merging.

`/goalies/season/:reportType/:season` - Get goalie stats for a single season

`/goalies/combined/:reportType` - Get goalie stats combined (repository data starting from 12-13 season, goal against average and save percentage NOT included as combined!). Includes a 'seasons' array with individual season stats, each of which also has its own per-season `score`, `scoreAdjustedByGames`, and `scores` metadata (including per-season `gaa` and `savePercent` when available).

For `goalies/*` endpoints with `reportType=both`, `gaa` and `savePercent` are omitted (they cannot be combined reliably across regular + playoffs).

`/leaderboard/playoffs` - All-time playoff leaderboard. Returns each team's count of championships, finals, conference finals, 2nd round appearances, and 1st round appearances, sorted by best record. Each entry includes a `tieRank` boolean (true when the entry's record matches the previous entry's record). Item format: `{ teamId, teamName, championships, finals, conferenceFinals, secondRound, firstRound, tieRank }`.

`/leaderboard/regular` - All-time regular season leaderboard, aggregated across all seasons, sorted by total points (then total wins). Protected endpoint. Each entry includes a `tieRank` boolean (true when the entry's record matches the previous entry's record) and `regularTrophies` (count of seasons the team finished rank 1 in the regular standings, only counted once playoffs data is available for that year). Item format: `{ teamId, teamName, seasons, wins, losses, ties, points, divWins, divLosses, divTies, winPercent, divWinPercent, regularTrophies, tieRank }`.

Every API except `/teams` and `/last-modified` have optional query params:
`teamId` (default: `1`) - if provided, check other than this repo maintainers data. teamId's are defined in `constants.ts` file `TEAMS` definition.

## Documentation

- [Testing Requirements](docs/TESTING.md)
- [Development Guide](docs/DEVELOPMENT.md)

## Testing

```
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run verify        # Full quality gate (lint + typecheck + build + coverage)
```

Coverage reports are generated in the `coverage/` directory. The `npm run verify` command runs ESLint, TypeScript compilation, production build, and Jest with enforced 100% global coverage thresholds.

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
- Install Playwright’s Chromium browser binaries (first time only):

```
npx playwright install chromium
```

### 1) Login (saves auth state)

Run:

```
npm run playwright:login
```

This opens a real browser so you can log in manually, then saves the session to `src/playwright/.fantrax/fantrax-auth.json` (gitignored).

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
- After downloading, the script runs `./scripts/import-temp-csv.sh` automatically when output dir is `./csv/temp/`.
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
- After downloading, the script runs `./scripts/import-temp-csv.sh` automatically when output dir is `./csv/temp/`.
- Filenames follow: `{teamSlug}-{teamId}-playoffs-YYYY-YYYY.csv`.

Useful options:

- `--year=2025` (override which season to download)
- `--headed` (default is headless)
- `--slowmo=250` (slows down actions for debugging)
- `--pause=500` (sleep between teams; default `250`)
- `--out=./csv/temp/` (override output dir; can also set `CSV_OUT_DIR`)

### 4) Normalize + move downloaded files into `csv/<teamId>/`

The Playwright importer downloads raw Fantrax CSVs. To convert them into the format this API expects and move them into the main dataset layout, run:

```
./scripts/import-temp-csv.sh --dry-run
./scripts/import-temp-csv.sh
```

## Fantrax CSV handling

Fantrax exports often include an extra first column and an `Age` column that this API doesn’t use. The scripts below normalize the CSVs into the format this API expects.

### Clean a single CSV

- Script: `scripts/handle-csv.sh`
- Usage: `./scripts/handle-csv.sh input.csv [output.csv]`

What it does:

- Removes the first column (often an internal Fantrax `ID` column)
- Removes the `Age` column
- Converts section headers into the format the parser expects (`"Skaters"`, `"Goalies"`)

### Import files from `csv/temp`

- Script: `scripts/import-temp-csv.sh`
- Assumes input files in `csv/temp/` are named:
  - `{teamName}-{teamId}-{regular|playoffs}-YYYY-YYYY.csv`

It will:

- Read matching files from `csv/temp/`
- Clean them using `scripts/handle-csv.sh`
- Write the cleaned CSVs to the API layout:
  - `csv/<teamId>/{regular|playoffs}-YYYY-YYYY.csv`
- Create `csv/<teamId>/` if it doesn't exist
- Upload to R2 if `USE_R2_STORAGE=true` (CSV backup)
- Import into database (`npm run db:import:stats:current`)
- Clean up temp files after successful DB import

Preview without writing:

```
./scripts/import-temp-csv.sh --dry-run
```

Import (write cleaned files):

```
./scripts/import-temp-csv.sh
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

**CSV files** are the import source. They can be stored locally in `csv/<teamId>/` and optionally backed up to Cloudflare R2. CSV files are NOT used at runtime by the API.

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

# Filter by season (startFrom parameter)
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/seasons?startFrom=2020"
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/players/combined/regular?startFrom=2020"
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/goalies/combined/playoffs?startFrom=2018"

# Same endpoints via /api
curl https://ffhl-stats-api.vercel.app/api/health
curl https://ffhl-stats-api.vercel.app/api/seasons
```

## Cloud Storage (Cloudflare R2)

CSV files can be backed up to Cloudflare R2 for team sharing and archival. R2 is **not** used at runtime by the API — it's purely for managing CSV files.

### Configuration (environment variables for R2 scripts)

```bash
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=ffhl-stats-csv
```

### Managing R2 Data

**Upload CSV files to R2:**

```bash
npm run r2:upload          # Upload all files
npm run r2:upload:current  # Upload only current season
npm run r2:upload:dry      # Preview without uploading
```

**Download CSV files from R2 (for local development):**

```bash
npm run r2:download                   # Download new files (skips existing)
npm run r2:download:force             # Overwrite all existing files
npm run r2:download:dry               # Preview without downloading
npm run r2:download -- --team=1       # Download only team 1
npm run r2:download -- --force        # Force overwrite existing files
```

**Automatic upload during import:**

When `USE_R2_STORAGE=true`, the import pipeline automatically uploads to R2 and imports into the database:

```bash
./scripts/import-temp-csv.sh  # Cleans CSVs, uploads to R2, imports to DB
```

## Database (Turso/SQLite)

The API reads all data from a Turso (libSQL/SQLite) database. CSV files are imported into the database via the import pipeline.

### Local development

No Turso account needed. The database scripts default to a local SQLite file (`local.db`):

```bash
npm run db:migrate        # Create database schema
npm run db:import:stats         # Import all CSV files into local database
npm run db:import:stats:current # Import only current season into local database
```

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
```

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
  const response = await fetch('https://your-api.com/last-modified', {
    headers: { 'X-API-Key': 'your-api-key' }
  });
  const data = await response.json();

  if (data.lastModified !== lastKnownTimestamp) {
    console.log('Data updated! Refetching stats...');
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
   - `scoreAdjustedByGames` uses the same scoring fields and weights as the main `score`, but works on per‑game values instead of totals (for example, `goalsPerGame = goals / games`).
   - Players and goalies with fewer than `MIN_GAMES_FOR_ADJUSTED_SCORE` games (configured in `src/constants.ts`, default 1) always get `scoreAdjustedByGames = 0` to avoid one‑game outliers appearing at the top.
   - For eligible players, per‑game values for each stat are normalized in the same way as totals (including per‑game plusMinus), then averaged into a 0–100 score.
   - For eligible goalies, only per‑game `wins`, `saves`, and `shutouts` are used; advanced stats (`gaa`, `savePercent`) do not contribute to `scoreAdjustedByGames`.
   - Finally, among all eligible players or goalies in the result set, the best `scoreAdjustedByGames` is normalized to exactly 100, and all other positive `scoreAdjustedByGames` values are scaled proportionally relative to that best per‑game score. Items below the minimum games threshold always remain at 0.

5. **Position‑based scoring (players only)**
   - In addition to the overall `score`, players also receive position-based scores where they are compared only against players of the same position (Forward "F" or Defenseman "D").
   - `position`: The player's position ("F" or "D").
   - `scoreByPosition`: Overall score compared to same position only (0–100 scale).
   - `scoreByPositionAdjustedByGames`: Per-game adjusted score compared to same position only.
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

- Improve API docs/contract (e.g. publish an OpenAPI spec)
- Standardize request validation + error response shape

Feel free to suggest feature / implementation polishing with writing issue or make PR if you want to contribute!
