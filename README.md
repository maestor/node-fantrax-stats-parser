# node-fantrax-stats-parser

## Purpose

Lightweight API to parse NHL fantasy league team stats and print combined seasons results by player (regular season &amp; playoffs separately) as JSON. CSV files are exported manually from [Fantrax](https://www.fantrax.com). The API supports multiple fantasy teams by storing each team’s CSV exports under `csv/<teamId>/` and selecting the team via an optional `teamId` query param.

[UI written by Angular which uses this API.](https://github.com/maestor/fantrax-stats-parser-ui)

[UI showcase which uses this API.](https://ffhl-stats.vercel.app/)

## Installation and use

```
1. Install Node (>=24 <25 recommended)
2. Clone repo
3. npm install
4. npm run dev
5. Go to endpoints mentioned below
```

## Endpoints

`/teams` - Available teams list (item format `{ id: '1', name: 'colorado' }`)

`/seasons` - Available seasons list (item format `{ season: 2012, text: '2012-2013' }`)
   - Report type can be provided as a path segment:
      - `/seasons/regular` or `/seasons/playoffs` (default: `regular` when omitted)
   - Optional query params:
      - `teamId` (default: `1`)

`/players/season/:reportType/:season/:sortBy` - Get player stats for a single season

`/players/combined/:reportType/:sortBy` - Get player stats combined (repository data starting from 12-13 season). Includes a 'seasons' array with individual season stats, each of which also has its own per-season `score`, `scoreAdjustedByGames`, and `scores` metadata.

`/goalies/season/:reportType/:season/:sortBy` - Get goalie stats for a single season

`/goalies/combined/:reportType/:sortBy` - Get goalie stats combined (repository data starting from 12-13 season, goal against average and save percentage NOT included as combined!). Includes a 'seasons' array with individual season stats, each of which also has its own per-season `score`, `scoreAdjustedByGames`, and `scores` metadata (including per-season `gaa` and `savePercent` when available).

## Testing

```
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

Coverage reports are generated in the `coverage/` directory. This repo enforces strict global thresholds (including 100% statements).

## CI

This repository runs a GitHub Actions workflow on:

- every pull request to `main`
- every push to `main`

The CI check runs the full verification command:

```
npm run verify:coverage
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
- each playoff team’s `startDate` and `endDate` for their playoff run

If the script can’t determine exactly 16 playoff teams for a season (or can’t parse the bracket periods), it will skip that season and print a `Manual needed:` message.

Useful options:

- `--year=2024` (only sync a single season)
- `--timeout=120000` (increase timeouts for slow Fantrax page loads)
- `--debug` (prints bracket hint lines when parsing fails)

### 3) Download regular-season roster CSVs

Run:

```
npm run playwright:import:regular -- --year=2025
```

Notes:

- Output directory defaults to `./csv/temp/`.
- The season year must exist in your local synced mapping file (`fantrax-leagues.json`).
- Filenames follow: `{teamSlug}-{teamId}-regular-YYYY-YYYY.csv`.

The importer uses roster-by-date mode and includes both `startDate` and `endDate` based on the synced season period dates, to ensure the correct timeframe is selected.

Useful options:

- `--headed` (default is headless)
- `--slowmo=250` (slows down actions for debugging)
- `--pause=500` (sleep between teams; default `250`)
- `--out=./csv/temp/` (override output dir; can also set `CSV_OUT_DIR`)

### 3b) Download playoffs roster CSVs

Run:

```
npm run playwright:import:playoffs -- --year=2025
```

Notes:

- Requires the playoffs mapping file from step 2b (`fantrax-playoffs.json`).
- Output directory defaults to `./csv/temp/`.
- Filenames follow: `{teamSlug}-{teamId}-playoffs-YYYY-YYYY.csv`.

Useful options:

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

### CSV integrity checks (schema)

This API validates the **normalized** CSV schema to detect Fantrax format changes early.

- Validation is performed **once per CSV file per server instance** before parsing.
- The check verifies the expected section markers and header rows (`"Skaters"` / `"Goalies"` and their column headers).
- If a file fails validation, the API responds with **HTTP 500** and a descriptive error message so you can re-run the normalization scripts.

This is intentionally strict: the goal is to fail fast if the upstream export format changes.

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
- Create `csv/<teamId>/` if it doesn’t exist
- Not delete anything from `csv/temp/`

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

### CSV data files

The CSV files in `csv/` are bundled into the deployed function via `vercel.json` (`includeFiles`). The runtime reads CSVs from `process.cwd()/csv`.

Multi-team layout:

- `csv/<teamId>/regular-YYYY-YYYY.csv`
- `csv/<teamId>/playoffs-YYYY-YYYY.csv`

Team configuration is defined in `src/constants.ts` (`TEAMS` and `DEFAULT_TEAM_ID`). If a team is configured but its `csv/<teamId>/` folder is missing, the API returns HTTP `422` for endpoints that need CSV access.

### Example requests

```
curl https://ffhl-stats-api.vercel.app/health
curl https://ffhl-stats-api.vercel.app/seasons

# Hosted demo: data endpoints may require an API key
curl -H "x-api-key: <your-key>" https://ffhl-stats-api.vercel.app/seasons

# Team selection (optional, defaults to teamId=1)
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/seasons?teamId=1"
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/seasons/playoffs?teamId=1"
curl -H "x-api-key: <your-key>" https://ffhl-stats-api.vercel.app/teams

# Deep route example
curl -H "x-api-key: <your-key>" "https://ffhl-stats-api.vercel.app/players/combined/playoffs/games?teamId=1"

# Same endpoints via /api
curl https://ffhl-stats-api.vercel.app/api/health
curl https://ffhl-stats-api.vercel.app/api/seasons
```

## API key authentication (production)

This service supports a simple API-key check for production usage.

- **How it works**: when enabled, requests to data endpoints (`/seasons`, `/players/*`, `/goalies/*`) must include an API key.
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

`teamId` - Optional query param. Selects which team dataset to use (CSV folder `csv/<teamId>/`). If missing or unknown, defaults to `DEFAULT_TEAM_ID`.

`season` - Optional. Needed only in single season endpoint. Starting year of the season want to check. If not specified, latest available season will show.

`sortBy` - Optional. Sort results by specific stats field. Currently available options: games, goals, assists, points, penalties, ppp, shp for both. shots, plusMinus, hits, blocks for players only and wins, saves, shutouts for goalies only. If not specified, sort by points (players) and by wins (goalies).

## Caching

Data endpoints (`/teams`, `/seasons`, `/players/*`, `/goalies/*`) are cached in two layers:

- **In-memory per instance**: results are memoized to avoid repeated filesystem reads and CSV parsing.
- **Edge-friendly HTTP caching**: successful `200` responses include `ETag` and `Cache-Control: s-maxage=...`, and clients/CDNs can use `If-None-Match` to get `304` responses.

Because this API uses header-based API keys, responses include `Vary: authorization, x-api-key` by default to keep caching safe.

## Scoring algorithm

Each player and goalie item returned by the stats endpoints includes a computed `score` field, an additional games-adjusted `scoreAdjustedByGames` field, plus a per-stat breakdown in a `scores` object.

- **Range and precision**: `score` and `scoreAdjustedByGames` are numbers between 0 and 100, rounded to two decimals.
- **Player scoring fields**: `goals`, `assists`, `points`, `plusMinus`, `penalties`, `shots`, `ppp`, `shp`, `hits`, `blocks`.
- **Goalie scoring fields**: `wins`, `saves`, `shutouts`, and when available `gaa` (goals against average) and `savePercent`.

Scoring is calculated in three steps:

1. **Per‑stat normalization**
   - For most non‑negative fields (goals, assists, points, penalties, shots, ppp, shp, hits, blocks, wins, saves, shutouts), scoring normalizes from a baseline of 0 up to the maximum value observed in the current result set. For goalies, only `wins`, `saves`, and `shutouts` are included in this part of the score. A value of 0 maps to 0, the maximum maps to 100, and values in between are placed linearly between them.
   - For `plusMinus`, scoring uses the minimum and maximum values observed in the result set, and the minimum can be negative. The worst `plusMinus` maps to 0, the best to 100, and values in between are placed linearly between them (for example, with max = 20 and min = -10, `plusMinus` 5 is halfway between and scores 50.0 for that component).
   - For goalies, `savePercent` and `gaa` are scored relative to the best value in the dataset using more stable scaling rather than raw min/max. For `savePercent`, a fixed baseline defined by `GOALIE_SAVE_PERCENT_BASELINE` in `src/constants.ts` (default .850) maps to 0 points and the best save% in the result set maps to 100, with other values placed linearly between; for `gaa`, the lowest GAA maps to 100 and other goalies are down‑weighted linearly based on how much worse they are than the best, up to a configurable cutoff defined by `GOALIE_GAA_MAX_DIFF_RATIO` in `src/constants.ts`. This avoids extreme 0/100 scores when all available goalies have very similar advanced stats.

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

In addition to the overall `score`, each item exposes a `scores` object containing the normalized 0–100 value for every individual scoring stat before weights are applied (for example, `scores.goals`, `scores.hits`, `scores.wins`, `scores.savePercent`, `scores.gaa`). This makes it easy to see which categories drive a player’s or goalie’s total score.

For the combined endpoints (`/players/combined` and `/goalies/combined`), the root-level items are scored using their full combined stats across all seasons, and each entry in the `seasons` array also includes its own per-season `score`, `scoreAdjustedByGames`, and `scores` object computed exactly as in the single-season endpoints, but normalized within that specific season.

### Weights

By default every scoring field has weight `1.0` (full value), so they all contribute equally.

Weights are defined in `src/constants.ts`:

- `PLAYER_SCORE_WEIGHTS` controls player fields.
- `GOALIE_SCORE_WEIGHTS` controls goalie fields.

Each weight is a decimal between 0 and 1. Lowering a weight reduces the impact of that stat on the final `score` without changing the 0–100 range. To change the scoring model, adjust these weight constants and restart the server.

## Technology

Written with [TypeScript](https://www.typescriptlang.org/), using [micro](https://github.com/zeit/micro) with [NodeJS](https://nodejs.org) server to get routing work. Library called [csvtojson](https://github.com/Keyang/node-csvtojson) used for parsing sources.

## Future roadmap

- Improve API docs/contract (e.g. publish an OpenAPI spec)
- Standardize request validation + error response shape
- Store API data in a database (reduce reliance on CSV files at runtime)
- Investigate whether Fantrax offers an API to replace manual CSV exports

Already implemented:

- Pre-load / cache CSV metadata (teams/seasons) to reduce filesystem work per request
- Lightweight response caching for stable endpoints (in-memory + edge-friendly headers)
- CSV data integrity checks for normalized inputs (detect format changes early)

Feel free to suggest feature / implementation polishing with writing issue or make PR if you want to contribute!
