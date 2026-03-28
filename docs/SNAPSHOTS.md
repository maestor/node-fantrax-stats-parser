# API Snapshots

Read-mostly endpoints can be served from generated JSON snapshots. This reduces Turso traffic and can improve response times for historical payloads.

Draft endpoints are currently not snapshotted. `/draft/original` and `/draft/entry` stay DB-backed because the payloads are small and effectively static.

## Snapshot-Backed Routes

Current snapshot families are:

- `/career/players`
- `/career/goalies`
- `/career/highlights/{type}` for every supported highlight type, including `most-trades`, `most-claims`, and `most-drops`
- `/leaderboard/regular`
- `/leaderboard/playoffs`
- `/leaderboard/transactions`
- `/players/combined/{reportType}?teamId=<id>` when `startFrom` is omitted or matches the team's default start season
- `/goalies/combined/{reportType}?teamId=<id>` when `startFrom` is omitted or matches the team's default start season

## Generation Behavior

- `db:import:stats` refreshes `import_metadata.last_modified` and then runs `npm run snapshot:generate -- --scope=stats`
- `db:import:stats -- --report-type=regular` regenerates `regular` and `both` combined player/goalie snapshots
- `db:import:stats -- --report-type=playoffs` regenerates `playoffs` and `both` combined player/goalie snapshots only for teams whose playoff CSVs were imported
- `db:import:playoff-results` refreshes only `/leaderboard/playoffs`
- `db:import:regular-results` refreshes only `/leaderboard/regular`
- `db:import:transactions` refreshes `import_metadata.last_modified` and then refreshes only `/leaderboard/transactions`
- snapshots are written locally to `generated/snapshots/`
- when `USE_R2_SNAPSHOTS=true`, generated snapshot JSON is uploaded to the configured R2 bucket and `manifest.json` is uploaded last
- snapshot uploads add `Content-Type: application/json` and `generated-at` metadata
- transient R2/TLS failures retry automatically with exponential backoff

Career and career-highlight snapshots are intentionally manual-only after stats imports. Existing snapshots continue serving until you regenerate them.

## Environment Variables

Base R2 credentials are described in [DEPLOYMENT.md](DEPLOYMENT.md). Snapshot-specific settings are:

```bash
USE_R2_SNAPSHOTS=false
R2_SNAPSHOT_BUCKET_NAME=ffhl-stats-snapshots
R2_SNAPSHOT_PREFIX=snapshots
R2_SNAPSHOT_MAX_ATTEMPTS=4
R2_SNAPSHOT_RETRY_BASE_DELAY_MS=250
SNAPSHOT_DIR=generated/snapshots
SNAPSHOT_CACHE_TTL_MS=60000
```

`R2_SNAPSHOT_BUCKET_NAME` defaults to `R2_BUCKET_NAME` when omitted.

## Manual Generation

```bash
npm run snapshot:generate
npm run snapshot:generate -- --scope=stats --report-type=regular
npm run snapshot:generate -- --scope=stats --report-type=playoffs --team-id=1 --team-id=12
npm run snapshot:generate -- --scope=career --scope=career-highlights
npm run snapshot:generate -- --scope=transactions
```

## Runtime Behavior

At runtime the API:

- tries local snapshots first
- falls back to R2 snapshots when enabled
- falls back to live DB queries if no snapshot is available

Successful responses expose `x-stats-data-source: snapshot` or `x-stats-data-source: db`.
