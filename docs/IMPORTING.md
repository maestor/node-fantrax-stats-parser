# Importing Data

This project imports runtime data from two source families:

- Fantrax CSV exports for player, goalie, standings, and transaction history
- FFHL forum draft history for entry and opening drafts

The source files stay local or in R2; the API serves data from the database and optional snapshots, not directly from CSV or scraped HTML.

## Prerequisites

- `npm install`
- Playwright-based Fantrax scripts auto-run `playwright install chromium` before launch
- For remote database imports, set `USE_REMOTE_DB=true` and Turso credentials as described in [DEPLOYMENT.md](DEPLOYMENT.md)

## Fantrax Metadata Sync

### 1) Login (saves auth state)

```bash
npm run playwright:login
```

This ensures Chromium is installed, opens a real browser for manual login, and saves the session to `src/playwright/.fantrax/fantrax-auth.json` (gitignored).

### 2) Sync league IDs (local mapping)

```bash
npm run playwright:sync:leagues
```

This scrapes the Fantrax league archive plus each season's Rules page and writes `src/playwright/.fantrax/fantrax-leagues.json` (gitignored).

The mapping includes:

- `leagueId` per season
- `regularStartDate` / `regularEndDate`
- `playoffsStartDate` / `playoffsEndDate`

Optional:

- `--league="Finnish Fantasy Hockey League"` to select the exact league name when the account has multiple leagues

### 2b) Sync playoffs teams (local mapping)

```bash
npm run playwright:sync:playoffs
```

This opens each season's Fantrax playoff bracket page and writes `src/playwright/.fantrax/fantrax-playoffs.json` (gitignored).

The mapping includes, per season year:

- which `TEAMS` entries made playoffs (must be 16 teams)
- each playoff team's `startDate` and `endDate` for its playoff run
- each playoff team's `roundReached` (1-4) and `isChampion` flag

The sync supports an ongoing current-season bracket. If Fantrax currently shows only a partial round prefix such as `Playoffs 1`, `Playoffs 1-2`, or `Playoffs 1-3`, the script still records the 16 playoff teams with current `roundReached` values and keeps `isChampion` false until a champion is visible.

If the script cannot determine exactly 16 playoff teams for a season, or cannot parse the bracket periods, it skips that season and prints `Manual needed:`.

Useful options:

- `--year=2024`
- `--timeout=120000`
- `--debug`
- `--import-db`

### 2c) Sync regular season standings (local mapping)

```bash
npm run playwright:sync:regular
```

This opens each season's Fantrax combined standings page and writes `src/playwright/.fantrax/fantrax-regular.json` (gitignored).

The mapping includes, per season year:

- each team's `wins`, `losses`, `ties`, and `points`
- division record: `divWins`, `divLosses`, `divTies`
- `isRegularChampion`, set to `true` only for the rank-1 team and only when `fantrax-playoffs.json` already contains data for that year

Useful options:

- `--year=2024`
- `--headed`
- `--slowmo=250`
- `--timeout=120000`
- `--import-db`

After syncing, you can import separately without re-scraping:

```bash
npm run db:import:regular-results
```

### 2d) Sync final matchup results (local mapping)

```bash
npm run playwright:sync:finals
```

This opens each season's Fantrax mobile live-scoring matchup view and writes `src/playwright/.fantrax/fantrax-finals.json` (gitignored).

The finals file includes, per season year:

- `awayTeam` and `homeTeam` using Fantrax matchup order (left team = away, right team = home)
- `isWinner` on each finalist plus season-level `wonOnHomeTiebreak`
- category score summary: `categoriesWon`, `categoriesLost`, `categoriesTied`, `rotisseriePoints`
- `playedGames.total` from Fantrax's final matchup summary
- `playedGames.goalies`, derived from aggregate goalie live-scoring totals
- `playedGames.skaters`, calculated as `total - goalies`
- `totals` for every existing project scoring key
- `categoryResults` with `away`, `home`, and `winner` for each scoring category

Notes:

- requires `fantrax-playoffs.json`
- only seasons with exactly one `isChampion: true` team are synced
- seasons without a champion are skipped entirely
- if Fantrax does not return a usable final matchup for a champion season, the script skips that season and prints `Manual needed:`
- raw Fantrax identifiers such as `matchupId` and `scipId` are used only during scraping and are not stored in the output file

Useful options:

- `--year=2024`
- `--headed`
- `--slowmo=250`
- `--timeout=120000`

## Roster CSV Imports

### 3) Download regular-season roster CSVs

```bash
npm run playwright:import:regular
```

Notes:

- output directory defaults to `./csv/temp/`
- the season year must exist in `fantrax-leagues.json`
- if `--year` is omitted, the importer defaults to the most recent mapped season
- when output is `./csv/temp/`, the importer runs `npm run parseAndUploadCsv` automatically
- set `RAW_UPLOAD=true` to run `parseAndUploadRawCsv` instead
- if `--year=YYYY` is provided, the post-import pipeline is restricted to that season
- the post-import pipeline stays restricted to `regular` files only
- filenames follow `{teamSlug}-{teamId}-regular-YYYY-YYYY.csv`

The importer uses roster-by-date mode and includes both `startDate` and `endDate` from the synced season period dates.

Useful options:

- `--year=2025`
- `--headed`
- `--slowmo=250`
- `--pause=500`
- `--out=./csv/temp/`

### 3b) Download playoffs roster CSVs

```bash
npm run playwright:import:playoffs
```

Notes:

- requires `fantrax-playoffs.json`
- output directory defaults to `./csv/temp/`
- if `--year` is omitted, the importer defaults to the most recent mapped season and only downloads teams whose mapped playoff `endDate` is yesterday or later
- if `--year=YYYY` is provided, the importer downloads all mapped playoff teams for that season unless `--remaining-teams` is also passed
- when output is `./csv/temp/`, the importer runs `npm run parseAndUploadCsv` automatically
- set `RAW_UPLOAD=true` to run `parseAndUploadRawCsv` instead
- if `--year=YYYY` is provided, the post-import pipeline is restricted to that season
- the post-import pipeline stays restricted to `playoffs` files only
- when the default `csv/temp` pipeline runs, any chained R2 upload, DB import, and stats snapshot regeneration are limited to the imported playoff team files
- filenames follow `{teamSlug}-{teamId}-playoffs-YYYY-YYYY.csv`

Useful options:

- `--year=2025`
- `--remaining-teams`
- `--headed`
- `--slowmo=250`
- `--pause=500`
- `--out=./csv/temp/`

### 4) Normalize and move downloaded files into `csv/<teamId>/`

The Playwright importer downloads raw Fantrax CSVs. To convert them into the format this API expects and move them into the main dataset layout, run:

```bash
./scripts/import-temp-csv.sh --dry-run
./scripts/import-temp-csv.sh
./scripts/import-temp-csv.sh --report-type=regular
./scripts/import-temp-csv.sh --report-type=playoffs
```

The script:

- reads matching files from `csv/temp/`
- cleans them with `scripts/handle-csv.sh`
- writes cleaned files to `csv/<teamId>/{regular|playoffs}-YYYY-YYYY.csv`
- creates `csv/<teamId>/` when needed
- uploads to R2 when `USE_R2_STORAGE=true`
- imports into the database with `npm run db:import:stats`
- regenerates the affected stats snapshots
- restricts chained R2 upload, DB import, and snapshot regeneration to the team IDs imported from that run
- cleans up temp files after successful import unless `--keep-temp` is used

Useful options:

- `--dry-run`
- `--keep-temp`
- `--season=YYYY`
- `--report-type=regular|playoffs|both`

## Transaction Imports

### Download transaction CSVs

```bash
npm run playwright:import:transactions
```

Notes:

- uses the season-to-league mapping from `fantrax-leagues.json`
- output directory defaults to `./csv/transactions/`
- if `--year` is omitted, the importer defaults to the most recent mapped season
- use `--all` to download every mapped season
- filenames follow `claims-YYYY-YYYY.csv` and `trades-YYYY-YYYY.csv`
- current-season files are refreshed in place so repeated scrapes do not require manual cleanup
- each download retries automatically by default (`--retries=2`)
- with the default output dir, a plain no-arg run also triggers `npm run db:import:transactions`
- with `USE_R2_STORAGE=true` and the default output dir, the scraper also triggers `npm run r2:upload:transactions`

Useful options:

- `--year=2025`
- `--all`
- `--headed`
- `--slowmo=250`
- `--pause=500`
- `--retries=4`
- `--retry-delay=5000`
- `--out=./csv/transactions/`

### Import transaction CSVs into the database

```bash
npm run db:import:transactions
```

Notes:

- defaults to current-season incremental import
- use `--full` for a full current-season replace
- use `--all` for a full all-seasons rebuild
- use `--season=YYYY` for one explicit season
- also supports `--current-only`, `--dry-run`, and `--dir=/custom/path`
- stores claim/drop groups in `claim_events` and `claim_event_items`
- stores trade rows in `trade_source_blocks` and `trade_block_items`
- ignores `Lineup Change` rows
- treats `(Drop)` rows inside trade CSVs as normal drop events
- ignores commissioner-fix one-way trade blocks
- resolves player links through `fantrax_entities` first, then same-season fantasy-team context from `players` and `goalies`, with latest `last_seen_season` as the fallback for merged-history duplicate Fantrax IDs
- keeps unresolved rows with null `fantrax_entity_id` plus explicit match metadata

## Draft History Imports

### Sync FFHL forum entry draft picks

```bash
npm run playwright:sync:draft -- --url=https://ffhl.kld.im/threads/entry-draft-2025-varatut-pelaajat.5862/
```

Notes:

- this scraper reads the public FFHL forum thread HTML directly
- no Fantrax auth state or Playwright browser session is required
- it scrapes only the first post on page 1
- the season is parsed from the topic title, for example `Entry draft 2025 - varatut pelaajat`
- output defaults to `src/playwright/.fantrax/drafts/` and stays local-only
- output filenames follow `entry-draft-{season}.json`
- rows are enriched from `TEAMS` with `abbreviation`, `teamId`, and current `teamName`
- traded-pick rows such as `BUF (FLA) - Caleb Desnoyers` are parsed as `draftedTeam=BUF` and `originalOwnerTeam=FLA`
- non-team reward-note parentheses such as `(mestari)` are ignored
- if a line contains multiple parenthetical notes, the first one matching a known NHL team abbreviation is used as the original owner
- in the 2013 topic, `SKIPATTU` placeholder rows are preserved with `playerName: null`
- Utah franchise aliases `UTA`, `ARI`, and `PHX` all resolve to the same team record

Useful options:

- `--url=https://ffhl.kld.im/threads/...`
- `--out=./custom/drafts`

### Sync FFHL forum opening draft picks

```bash
npm run playwright:sync:opening-draft -- --url=https://ffhl.kld.im/threads/varatut-pelaajat-j%C3%A4rjestyksess%C3%A4.10/
```

Notes:

- this scraper also reads the public FFHL forum thread HTML directly and writes local-only JSON under `src/playwright/.fantrax/drafts/`
- output filename is always `opening-draft.json`
- items use the same shape as entry-draft items except there is no `season` field
- teams are resolved from full NHL team names instead of abbreviations
- traded-pick owner teams are parsed from `(via Team Name)` notes
- if there are multiple `via` hops, the last team in the chain is treated as the original owner
- round markers such as `Kierros 1` and `Kierros 2` are ignored except for setting `round`

Useful options:

- `--url=https://ffhl.kld.im/threads/...`
- `--out=./custom/drafts`

### Import FFHL draft JSON into the database

```bash
npx tsx scripts/db-import-drafts.ts
```

Notes:

- reads local JSON files under `src/playwright/.fantrax/drafts/`
- imports every `entry-draft-{season}.json` file into `entry_draft_picks`
- imports `opening-draft.json` into `opening_draft_picks`
- if `entities-entry-draft.json` and `entities-opening-draft.json` exist in the same directory, the importer also fills nullable `fantrax_entity_id` and overwrites `player_name` with the canonical `fantrax_entities.name`
- entry-draft entity mappings are matched by `season + pickNumber`
- opening-draft entity mappings are matched by `pickNumber`
- draft entity mappings also carry `draftedTeamId`; if the imported row no longer matches that team, the importer skips the mapping instead of forcing a stale link
- entry-draft `fantrax_entity_id` links also power the API's per-pick `playedInLeague` and `playedForDraftingTeam` flags plus matching team summary counts and percentages
- entry-draft imports replace only the imported season rows
- opening-draft import clears and reloads the whole `opening_draft_picks` table
- stored rows keep only team IDs plus pick metadata, not duplicated team names or source-file references
- unresolved draft rows stay in the tables with `fantrax_entity_id = NULL` and their original scraped `player_name`
- by default the importer targets `local.db`
- use `--entities-only` to update only existing draft-table rows from the local mapping JSONs without rereading `entry-draft-{season}.json` or `opening-draft.json`

Useful options:

- `--dir=./custom/drafts`
- `--entities-only`
- `--season=2025`
- `--opening-only`
- `--dry-run`

## Fantrax CSV Handling

Fantrax exports often include an `Age` column and may include an `ID` column as the first data column. Stats imports treat Fantrax roster exports as sectioned CSVs (`Skaters` / `Goalies`) and preserve that raw-data shape for the importer, while transaction CSVs still parse as ordinary header-based tables.

### Clean a single CSV

- Script: `scripts/handle-csv.sh`
- Usage: `./scripts/handle-csv.sh input.csv [output.csv]`

What it does:

- keeps first-column `ID` values when present
- removes only empty placeholder first columns used in section marker rows
- removes the `Age` column
- converts section headers into the format the parser expects (`Skaters`, `Goalies`)
- forces known malformed goalie row `*06mqq*` to normalized goalie position `G` when it appears inside the `Goalies` section

### Import files from `csv/temp`

- Script: `scripts/import-temp-csv.sh`
- Assumes input files in `csv/temp/` are named `{teamName}-{teamId}-{regular|playoffs}-YYYY-YYYY.csv`

Preview without writing:

```bash
./scripts/import-temp-csv.sh --dry-run
```

Import:

```bash
./scripts/import-temp-csv.sh
./scripts/import-temp-csv.sh --keep-temp
./scripts/import-temp-csv.sh --season=2018
./scripts/import-temp-csv.sh --report-type=regular
./scripts/import-temp-csv.sh --report-type=playoffs
./scripts/import-temp-csv.sh --report-type=both
```

### Fantrax IDs in imports

- Fantrax roster CSVs may include an `ID` column with values like `*00qs7*`
- the import pipeline expects that leading `ID` column to be preserved
- imports store Fantrax IDs as `id` for both skaters and goalies
- rows with a missing Fantrax ID are skipped during DB import and reported after the import completes
- rows with `0` games are imported into the database, except playoff placeholder rows with `Status "-"` and `0` GP, which are skipped during DB import
