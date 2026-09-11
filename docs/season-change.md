# Season Change

Use this checklist when FFHL moves from one active season to the next and this repo should start treating the new year as the default current season.

Example: moving from `2025-2026` to `2026-2027` means the start year changes from `2025` to `2026`.

## Ordered Checklist

### 1. Pick the new season year and sanity-check source data

- Decide the new season start year, for example `2026`.
- Make sure Fantrax already exposes that season in the league archive before changing defaults.
- If you rely on no-argument imports, confirm the new season can be discovered as the most recent mapped season in `src/playwright/.fantrax/fantrax-leagues.json`.

Do not bump the app first and hope the import tooling catches up later. Several scripts intentionally treat the configured current season as special.

### 2. Update the code-level season config

Edit [src/config/settings.ts](../src/config/settings.ts) and update:

- `CURRENT_SEASON`
- any `TEAMS` metadata that changed with the new season

Review `TEAMS` carefully for:

- `teamAbbr` changes
- `presentName` changes
- `firstSeason` changes if a franchise is new to the league

What this changes immediately:

- seasonless player and goalie season routes default to the new season
- `availableSeasons()` extends through the new season
- `--current-only` flows in stats, transactions, and R2 scripts now target the new season
- leaderboard season windows that depend on the configured current year move forward

### 3. Refresh Fantrax metadata first

Run these in order:

```bash
npm run playwright:login
npm run playwright:sync:leagues
```

Then refresh the season-specific mapping files as the real FFHL season progresses:

```bash
npm run playwright:sync:regular -- --year=2026
npm run playwright:sync:playoffs -- --year=2026
npm run playwright:sync:finals -- --year=2026
```

Notes:

- `playwright:sync:leagues` is the important first step because regular imports, playoff imports, and transaction downloads depend on the season-to-league mapping.
- keep `--year=2026` on the `sync:*` commands when you only want to refresh the new active season; without it, these scripts iterate every mapped season
- `playwright:sync:playoffs` and `playwright:sync:finals` can be deferred until those parts of the season actually exist.
- `playwright:sync:regular` writes the local standings mapping used by regular-results imports.

### 4. Import the new season's data

For the regular-season rollover, use one of these:

```bash
./scripts/update-season.sh
```

or the explicit flow:

```bash
npm run playwright:import:regular
```

Important:

- `playwright:import:regular` defaults to the most recent mapped season when `--year` is omitted.
- `scripts/update-season.sh` is only a regular-season bootstrap helper. It does not replace the full season-change checklist.
- if you use the default `csv/temp/` output, the Playwright importer already triggers the temp CSV pipeline automatically

Import transactions once the new season is available:

```bash
npm run playwright:import:transactions
```

Later in the season, import the remaining season-specific data as needed:

```bash
npm run playwright:import:playoffs
npm run db:import:transactions
npm run db:import:regular-results
npm run db:import:playoff-results
npm run db:import:finals-results
```

Choose the commands that match the current phase of the season. Early in the year you usually only need regular-season rosters and transactions.
Use an explicit `--year` or `--season` only when you are backfilling an older season or you want to override the default current-season target.

### 5. Add the new entry draft season when it exists

The FFHL entry draft does not follow the same default-current-season flow as the Fantrax imports. If the new entry draft season is missing, add it explicitly once the forum thread exists.

Sync the entry draft from the public FFHL forum thread:

```bash
npm run playwright:sync:draft -- --url=https://ffhl.kld.im/threads/entry-draft-2026-varatut-pelaajat.XXXX/
```

Then import the local draft JSON into the database:

```bash
npx tsx scripts/db-import-drafts.ts --season=2026
```

Notes:

- this flow is local-only until you import it; there is no automatic Fantrax-style current-season default for entry draft data
- the scraper parses the season from the forum topic title, so make sure the thread title really says `Entry draft 2026`
- the output file should become `src/playwright/.fantrax/drafts/entry-draft-2026.json`
- if the `drafts/` directory does not exist yet, the sync step creates the local draft artifact through the normal output flow
- use `--season=2026` on the import step so only the new entry-draft season is imported or refreshed
- if you maintain draft entity mapping files such as `entities-entry-draft.json`, rerun the import after updating them so `fantrax_entity_id` links and derived API flags stay current

This step is separate from the opening-draft history import. `opening-draft.json` is league-history data, while `entry-draft-2026.json` is the new season-specific file you add during rollover.

### 6. Refresh snapshots and storage expectations

Imports refresh their affected scopes according to [snapshots](snapshots.md#generation-behavior).

Career snapshots are still manual-only, so regenerate them if you want fresh cached career payloads for the new season:

```bash
npm run snapshot:generate -- --scope=career --scope=career-highlights
```

If you use R2 as part of the season rollover, the usual current-season uploads are:

```bash
npm run r2:upload:current
npm run r2:upload:transactions -- --current-only
```

### 7. Verify the new season behaves like the active default

Recommended checks:

```bash
npm run dev
```

Then verify:

- `GET /seasons` includes the new season
- `GET /players/season/regular?teamId=1` defaults to the new season once data exists
- `GET /goalies/season/regular?teamId=1` defaults to the new season once data exists
- `GET /last-modified` changed after imports
- any combined route snapshots still load as expected for the default season window

If you changed runtime code such as `CURRENT_SEASON`, obtain user review acceptance under [AGENTS](../AGENTS.md) before the final gate:

```bash
npm run verify
```

### 8. Update contributor docs if the process changed

If this rollover exposed a new manual step, update these docs in the same task:

- [importing.md](./importing.md)
- [deployment.md](./deployment.md)
- [snapshots.md](./snapshots.md)
- [README.md](../README.md)

## Common Pitfalls

- Bumping `CURRENT_SEASON` before the new year exists in `fantrax-leagues.json` makes no-arg imports point at a season the local mapping may not know yet.
- `db:import:transactions` incremental mode is intentionally current-season only.
- `--current-only` R2 and DB flows follow `CURRENT_SEASON`, so they change behavior as soon as you update the config.
- Franchise changes are not only a data problem. `teamAbbr`, `presentName`, and sometimes `firstSeason` also affect API responses and filtering behavior.
