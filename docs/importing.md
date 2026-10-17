# Importing Data

This project imports runtime data from two source families:

- Fantrax CSV exports for player, goalie, standings, and transaction history
- FFHL forum draft history for entry, opening, and expansion drafts

The source files stay local or in R2; the API serves data from the database and optional snapshots, not directly from CSV or scraped HTML.

## Prerequisites

For the hosted daily schedule and phase-aware coordinator, see [daily imports](daily-import.md). The commands below remain available for individual manual imports.

- `npm install`
- Roster CSV downloads use HTTP and the saved Fantrax session; they do not install or launch a browser
- Browser-based Fantrax metadata/transaction scripts still require Playwright
- For remote database imports, set `USE_REMOTE_DB=true` and Turso credentials as described in [deployment.md](deployment.md)

Options listed below are passed after `--` with npm scripts, e.g. `npm run playwright:sync:regular -- --year=2025`. Use direct flags with shell scripts or `npx tsx`.

## Fantrax Metadata Sync

### 1) Login (saves auth state)

```bash
npm run playwright:login
```

This ensures Chromium is installed and opens a real browser for manual login. Finish signing in, including any verification, then press Enter in the terminal. The script prints a verification message and checks the session through Fantrax's authenticated league-list API before writing; it does not navigate away from your completed login or depend on the league archive's page layout:

- `src/playwright/.fantrax/fantrax-auth.json`: session used by local import commands
- `src/playwright/.fantrax/fantrax-auth-secret.txt`: the complete session encoded as gzip + Base64, ready to paste into the GitHub Actions secret `FANTRAX_AUTH_STATE`

Both files are gitignored and written with owner-only permissions. The secret value is never printed. Failed login verification or an encoded value exceeding GitHub's 48 KB secret limit leaves existing files unchanged.

To renew the hosted session, rerun the same login command and replace `FANTRAX_AUTH_STATE` with the new text file's contents. Compression and Base64 do not encrypt the session; treat both files as credentials. The hosted consumer must Base64-decode and gunzip the value to recover the auth JSON.

### 2) Sync league IDs (tracked mapping)

```bash
npm run playwright:sync:leagues
```

This scrapes the Fantrax league archive plus each season's Rules page and writes `src/playwright/.fantrax/fantrax-leagues.json` (tracked in Git). Review and include mapping changes when advancing the configured current season so fresh checkouts have its league ID and dates.

Fields: `leagueId`, `regularStartDate`/`regularEndDate`, `playoffsStartDate`/`playoffsEndDate` per season.

Only this league configuration file is allowlisted. Authentication state, generated playoff/standings/finals mappings, drafts, and debug artifacts remain gitignored; regenerate the required mappings with the commands below.

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

For completed brackets, the sync now waits for a populated champion cell before leaving `isChampion` false for every team. Fantrax can render the finals node before the winner text hydrates, especially on the current season page.

If the script cannot determine exactly 16 playoff teams for a season, or cannot parse the bracket periods, it skips that season and prints `Manual needed:`.

Useful options:

- `--year=2024`
- `--timeout=120000`
- `--debug`
- `--import-db`
- `--strict` to fail rather than save a stale mapping when a requested season cannot be scraped

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
- `--strict` to require complete, numeric standings for every requested season

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

For goalie-rate categories, finals sync preserves explicit category rows when a finalist misses the minimum two-goalie-game threshold:

- `gaa` is written as `null`
- `savePercent` is written as `null`

Count-based goalie categories keep numeric totals regardless of rate qualification.

If you already created local finals tables before nullable goalie-rate values were added, drop the local `finals_matchups`, `finals_matchup_teams`, and `finals_matchup_categories` tables, then rerun `npm run db:migrate` and `npm run db:import:finals-results`.

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

After syncing, you can import separately without re-scraping:

```bash
npm run db:import:finals-results
```

Use `--strict` on finals sync when a champion is expected; missing or failed seasons leave the existing mapping unchanged and return failure. Regular, playoff and finals result imports accept `--season=YYYY` to restrict database writes to one mapped season.

This populates `finals_matchups`, `finals_matchup_teams`, and `finals_matchup_categories` in the database from the local finals mapping file.

## Roster CSV Imports

### 3) Download regular-season roster CSVs

```bash
npm run import:regular
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

It resolves season-specific team IDs through Fantrax's league-info feed and calls the same CSV endpoint used by the roster page's export button. Both current and historical seasons use Full Fantasy Team stats. The saved cookies are sent only to matching Fantrax hosts and paths; login renewal remains a separate operation.

Downloads run with four workers by default. Each team download gets up to three attempts, waiting 2 seconds before the second attempt and 4 seconds before the third. Authentication rejection stops the run with a login-renewal message. `--pause` applies between downloads in each worker.

Completed CSVs are skipped on reruns. Responses must contain both roster sections and their required stats headers before saving. Downloads are saved through a `.part` file and renamed only after saving succeeds. On failure, queued downloads stop, in-flight work finishes, and the command exits with an error while keeping completed files for the next run; the post-import pipeline does not start. If the saved login has expired, renew it with the login script before retrying.

`npm run playwright:import:regular` remains a compatibility alias and no longer installs or launches Chromium. Browser flags (`--headed`, `--slowmo`) no longer apply.

Useful options:

- `--year=2025`
- `--concurrency=4` (1–8)
- `--pause=500`
- `--out=./csv/temp/`

Use `--strict` on regular imports to reject a missing team mapping instead of skipping that team. Database/CSV pipeline failures return a nonzero status and preserve temp files for retry. Explicit environment variables take precedence over `.env` in `parseAndUploadCsv`.

### 3b) Download playoffs roster CSVs

```bash
npm run import:playoffs
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

Playoff downloads use the same HTTP/retry/validation mechanism as regular imports, with each team's saved `rosterTeamId`, `startDate`, and `endDate`. `npm run playwright:import:playoffs` remains a compatibility alias without a browser-install prehook. Browser flags no longer apply.

Useful options:

- `--year=2025`
- `--remaining-teams`
- `--concurrency=4` (1–8)
- `--pause=500`
- `--out=./csv/temp/`

### 4) Normalize and move downloaded files into `csv/<teamId>/`

The default roster import already runs this pipeline. To process existing temp files manually:

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
- when no local name/position candidate exists, reads the mapped Fantrax league's claim/drop and trade history over HTTP using the saved session; a unique provider ID matching the normalized name, position, season, and fantasy-team context adds the missing entity and links the transaction
- grouped transaction rows inherit shared fantasy-team context only within the same Fantrax transaction ID, including across pages; exact provider IDs can link historical position changes without overwriting the existing entity position
- this recovery requires `fantrax-leagues.json` and a valid `fantrax-auth.json` under `src/playwright/.fantrax/`; no browser is launched, and seasons whose players already resolve need no HTTP lookup
- completes parsing and provider lookups before replacing stored transaction history; a failed lookup leaves existing history intact
- dry runs perform the same identity lookups without writing entities, transactions, metadata, or snapshots
- recovered identities do not create stats rows or change existing entity names, scoring windows, or draft mappings
- normalizes player names identically on both sides of matching: Unicode decomposition removes accent marks (including `ä`, `ö`, and `å`), straight/curly apostrophes are ignored, and whitespace is collapsed; canonical names and raw CSV text are preserved
- keeps unresolved rows with null `fantrax_entity_id` plus explicit match metadata

Default incremental imports revisit only the latest stored timestamp and newer rows. Use the backfill below to repair older unresolved links without rebuilding transaction groups.

### Backfill missing transaction identities

```bash
npm run db:backfill:transaction-entities -- --dry-run
npm run db:backfill:transaction-entities
# Limit the repair to one season:
npm run db:backfill:transaction-entities -- --season=2026 --dry-run
```

The job defaults to every season with unresolved player links already stored in the selected database. It requires the same saved Fantrax session and league mapping as automatic identity recovery; existing transaction CSVs do not need to be downloaded again. `USE_REMOTE_DB` selects the target as described in [deployment](deployment.md).

The job inserts missing entities and updates only unresolved claim/drop and player-trade identity links in place. Event IDs, grouping, raw source text, already resolved links, and stats stay intact. Reruns resume remaining unresolved items without duplicating records. Identities recovered in another season can also repair earlier rows through the existing unique name/position matching. Remaining missing or ambiguous matches are listed in the output; no player IDs are guessed. A provider failure occurs before any backfill writes.

Persisted runs refresh the existing transaction leaderboard and transaction-related career-highlight snapshots, including on a no-op rerun so a failed snapshot refresh can be retried. Dry runs skip persistence and snapshots. Known recovered identities with position F/D/G are eligible for history-only career profiles and zero-counter career-list rows. Refresh the manual career-list snapshots after recovery; see [snapshots](snapshots.md#manual-generation).

## Career History Consumers

Career history links imported drafts, expansion selections, claims/drops, and trades by resolved Fantrax identity; unresolved names are not matched to a profile by similarity. Trade inspection retains unresolved assets and original directional blocks. Exactly two opposing blocks with a matching period in one source-file/season/timestamp/participant group form a reconstructed package. Extra blocks or differing periods remain ambiguous; missing opposing directions remain incomplete. These are source-based inferences because exports contain no official deal identifier. [OpenAPI](../openapi.yaml) owns the response contract.

Undated expansion selections appear at the bottom of their starting-season block and identify the source and expansion teams. Known identities with position F/D/G can link from draft and trade pages even without statistical rows. They return identity-only profiles plus the same independent history response; no statistical rows are created. Statistical list counters remain zero and first/last statistical seasons remain null. Existing zero-game statistical rows still count as owned seasons and teams.

The history response omits a claim when it is the first transaction after a draft or expansion selection and goes to the drafting team, including claims in later seasons and after the opening draft. An intervening claim, drop, or trade prevents suppression; transactions tied at the same timestamp remain visible because their order is unknown. This hides commissioner roster setup from the timeline without modifying stored transactions, claim highlights, or team transaction counts.

History coverage reports seasons containing stored records, not completed imports. There is no manifest distinguishing a missing file from an imported empty file, so completeness remains unknown. Draft seasons without exact dates and opening-draft records without a stored season remain undated. Career statistics do not establish continuous roster tenure, current ownership, or production during a transaction interval.

## Draft History Imports

### Import FFHL expansion drafts

```bash
npm run db:import:expansion-drafts -- --dry-run
npm run db:import:expansion-drafts
# Refresh just one expansion:
npm run db:import:expansion-drafts -- --season=2021
```

The command fetches the public Vegas and Seattle selection threads over HTTP; no browser or login is needed. Team `firstSeason` configuration supplies each season. It parses only the first post, including both Seattle baskets, validates all source teams and selections, and reports missing or ambiguous player identities. Exact normalized names and explicit historical name aliases link existing `fantrax_entities`; canonical entity positions take priority over forum positions.

Selections live in `expansion_draft_picks`, separately from ordinary draft picks and claim transactions, with source team, source URL, and raw player name retained. A rerun atomically replaces only the selected expansion(s); other drafts, statistics, and transaction counts stay intact. A dry run does not migrate or write the database. The target defaults to `local.db`; `USE_REMOTE_DB=true` selects the configured remote database as described in [deployment](deployment.md).

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

### Generate entry-draft entity mappings from existing Fantrax entities

If you want `/draft/entry` to include `playedInLeague` and `playedForDraftingTeam`, generate `entities-entry-draft.json` from the current `fantrax_entities` table before running the `--entities-only` backfill.

```bash
npm run draft:generate-entities -- --season=2026 --dry-run
npm run draft:generate-entities -- --season=2026
```

Notes:

- this reads `entry-draft-2026.json` and tries to match each player name against `fantrax_entities`
- it writes or updates `src/playwright/.fantrax/drafts/entities-entry-draft.json`
- existing mappings for other seasons are preserved
- unresolved or ambiguous picks are printed to the console
- only players already present in `fantrax_entities` can be linked automatically

After generating the file, apply it to the imported draft rows:

```bash
npx tsx scripts/db-import-drafts.ts --season=2026 --entities-only --dry-run
npx tsx scripts/db-import-drafts.ts --season=2026 --entities-only
```

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

### Fantrax IDs in imports

- Fantrax roster CSVs may include an `ID` column with values like `*00qs7*`
- the import pipeline expects that leading `ID` column to be preserved
- imports store Fantrax IDs as `id` for both skaters and goalies
- rows with a missing Fantrax ID are skipped during DB import and reported after the import completes
- rows with `0` games are imported into the database, except playoff placeholder rows with `Status "-"` and `0` GP, which are skipped during DB import
