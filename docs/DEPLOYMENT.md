# Deployment and Operations

This document covers runtime hosting, database usage, R2 storage, API auth, and cache behavior.

## Deployment (Vercel)

This API is designed to run on Vercel Serverless Functions.

Hosted demo: [https://ffhl-stats-api.vercel.app/](https://ffhl-stats-api.vercel.app/)

### Routing

The repository includes Vercel `routes` so you can call the API from the root path. Internally, requests are served by Vercel functions under `/api/*`. The hosted deployment supports both URL styles with no redirect requirement.

Examples:

- `GET /health` and `GET /api/health`
- `GET /seasons` and `GET /api/seasons`

### Vercel project settings

- Framework Preset: `Other`
- Build Command: `npm run build`
- Output Directory: leave empty

Required environment variables:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- API key configuration

## Data Storage

- Production reads from Turso/libSQL
- Local development reads from the local SQLite file `local.db`
- CSV files are import sources only
- Runtime responses come from the database or generated snapshots, not directly from CSVs

Multi-team CSV layout:

- `csv/<teamId>/regular-YYYY-YYYY.csv`
- `csv/<teamId>/playoffs-YYYY-YYYY.csv`

Team configuration lives in `src/config/settings.ts` via `TEAMS` and `DEFAULT_TEAM_ID`. Each `TEAMS` entry now also carries the current official `teamAbbr`, which feeds `/teams` and finals leaderboard team metadata.

## Database (Turso/SQLite)

The API reads all runtime data from a Turso/libSQL database. CSV imports also maintain a canonical `fantrax_entities` registry keyed by Fantrax ID, and transaction imports normalize source rows into dedicated claim/drop and trade tables. FFHL forum draft history is stored in `entry_draft_picks` and `opening_draft_picks`, which back `/draft/entry` and `/draft/original`.

### Local development

No Turso account is required. By default the scripts use `local.db`.

```bash
npm run db:migrate
npm run db:import:stats
npm run db:import:stats:current
npm run db:import:stats -- --season=2018
npm run db:import:stats -- --report-type=playoffs
npm run db:import:stats -- --season=2025 --report-type=playoffs --team-id=1 --team-id=12
npm run db:import:transactions
npm run db:import:transactions -- --full
npm run db:import:transactions -- --all
npm run db:import:transactions -- --season=2025
npm run db:import:playoff-results
npm run db:import:regular-results
```

If you want to replace local SQLite with a copy of the production Turso database:

```bash
# .env must contain remote TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
npm run db:pull:remote
npm run db:backups:clean
```

`db:pull:remote` creates a timestamped backup of the existing `local.db` in `.backups/` before pulling remote schema and data.

### Production (Turso hosted)

Set these environment variables:

```bash
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-auth-token
USE_REMOTE_DB=true
```

Then run imports against the remote database:

```bash
npm run db:import:stats
npm run db:import:stats:current
npm run db:import:stats -- --season=2018
npm run db:import:stats -- --season=2018 --report-type=regular
npm run db:import:transactions
npm run db:import:transactions -- --all
npm run db:import:playoff-results
npm run db:import:regular-results
```

Successful imports regenerate only the snapshot scopes they directly affect. Manual snapshot generation is described in [SNAPSHOTS.md](SNAPSHOTS.md).

## Cloud Storage (Cloudflare R2)

Cloudflare R2 can be used for:

- CSV backup and sharing
- raw `csv/temp` upload/download workflows
- transaction CSV storage

Snapshot storage is documented separately in [SNAPSHOTS.md](SNAPSHOTS.md).

### Configuration

```bash
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=ffhl-stats-csv
USE_R2_STORAGE=true
```

### Managing R2 data

Upload cleaned team CSV files:

```bash
npm run r2:upload
npm run r2:upload:current
npm run r2:upload -- --season=2018
npm run r2:upload -- --report-type=regular
npm run r2:upload -- --season=2025 --report-type=playoffs --team-id=1 --team-id=12
npm run r2:upload:dry
```

Upload raw temp CSV files to `rawFiles/`:

```bash
npm run r2:upload:raw
npm run r2:upload:raw -- --season=2025
npm run r2:upload:raw -- --report-type=playoffs
npm run r2:upload:raw -- --keep-temp
npm run r2:upload:raw:dry
```

Upload transaction CSV files to `transactions/`:

```bash
npm run r2:upload:transactions
npm run r2:upload:transactions -- --season=2025
npm run r2:upload:transactions -- --current-only
npm run r2:upload:transactions:dry
```

Download cleaned team CSV files:

```bash
npm run r2:download
npm run r2:download:force
npm run r2:download:dry
npm run r2:download -- --team=1
npm run r2:download -- --force
```

Download transaction CSV files:

```bash
npm run r2:download:transactions
npm run r2:download:transactions -- --season=2025
npm run r2:download:transactions -- --current-only
npm run r2:download:transactions:force
```

Download raw temp CSV files:

```bash
npm run r2:download:raw
npm run r2:download:raw:dry
npm run r2:download:raw -- --dry-run --force
```

### Automatic upload during import

When `USE_R2_STORAGE=true`, the normal import pipeline uploads data automatically:

```bash
npm run parseAndUploadCsv
npm run parseAndUploadRawCsv
```

The transaction scraper also auto-uploads when `USE_R2_STORAGE=true` and the default `csv/transactions/` output directory is used:

```bash
npm run playwright:import:transactions
```

## API Key Authentication

This service supports a simple API-key check for production usage.

- data endpoints require an API key when auth is enabled
- `/health` and `/healthcheck` remain public

### Configuration

- `API_KEY` for a single key
- `API_KEYS` for a comma-separated key list
- `REQUIRE_API_KEY` to force auth on or off
- `API_KEY_HEADER` to override the default `x-api-key`

### Client usage

Header-based auth:

```bash
curl -H "x-api-key: <your-key>" http://localhost:3000/seasons
```

Bearer auth:

```bash
curl -H "Authorization: Bearer <your-key>" http://localhost:3000/seasons
```

## Caching

Data endpoints are cached in two layers:

- in-memory per instance to avoid repeated database queries
- edge-friendly HTTP caching with `ETag` and `Cache-Control: s-maxage=...`

Because the API uses header-based API keys, responses include `Vary: authorization, x-api-key` by default.

### Using `/last-modified` for change detection

Consumer applications can poll `/last-modified` to detect when the underlying data changes.

```ts
let lastKnownTimestamp: string | null = null;

async function checkForUpdates() {
  const response = await fetch("https://your-api.com/last-modified", {
    headers: { "X-API-Key": "your-api-key" },
  });
  const data = await response.json();

  if (data.lastModified !== lastKnownTimestamp) {
    lastKnownTimestamp = data.lastModified;
    await refetchAllStats();
  }
}

setInterval(checkForUpdates, 5 * 60 * 1000);
```

Repeated requests with unchanged data can return `304 Not Modified`.
