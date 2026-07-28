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
- `playwright:sync:playoffs` and `playwright:sync:finals` can be deferred until those parts of the season actually exist.
- `playwright:sync:regular` writes the local standings mapping used by regular-results imports.

### 4. Import the new season's data

For the regular-season rollover, use one of these:

```bash
./scripts/update-season.sh 2026
```

or the explicit flow:

```bash
npm run playwright:import:regular -- --year=2026
./scripts/import-temp-csv.sh --season=2026 --report-type=regular
```

Important:

- `scripts/update-season.sh` is only a regular-season bootstrap helper. It does not replace the full season-change checklist.
- if you use the default `csv/temp/` output, the Playwright importer already triggers the temp CSV pipeline automatically

Import transactions once the new season is available:

```bash
npm run playwright:import:transactions -- --year=2026
```

Later in the season, import the remaining season-specific data as needed:

```bash
npm run playwright:import:playoffs -- --year=2026
npm run db:import:transactions -- --season=2026
npm run db:import:regular-results
npm run db:import:playoff-results
npm run db:import:finals-results
```

Choose the commands that match the current phase of the season. Early in the year you usually only need regular-season rosters and transactions.

### 5. Refresh snapshots and storage expectations

Most imports already refresh the relevant snapshots for you:

- `db:import:stats` refreshes stats snapshots and `import_metadata.last_modified`
- `db:import:transactions` refreshes the transactions snapshot and `import_metadata.last_modified`
- `db:import:regular-results` refreshes the regular leaderboard snapshot
- `db:import:playoff-results` refreshes the playoff leaderboard snapshot

Career snapshots are still manual-only, so regenerate them if you want fresh cached career payloads for the new season:

```bash
npm run snapshot:generate -- --scope=career --scope=career-highlights
```

If you use R2 as part of the season rollover, the usual current-season uploads are:

```bash
npm run r2:upload:current
npm run r2:upload:transactions -- --current-only
```

### 6. Verify the new season behaves like the active default

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

If you changed runtime code such as `CURRENT_SEASON`, finish with:

```bash
npm run verify
```

### 7. Update contributor docs if the process changed

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
