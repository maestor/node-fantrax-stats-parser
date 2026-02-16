# CSV to Database Migration Design

## Motivation

The current CSV-based data layer becomes unwieldy as the project grows. League-wide statistics across 600+ CSV files, cross-team comparisons, and storing non-CSV data from Fantrax all require a proper database.

**Goals:**
- Flexibility for cross-team and league-wide queries
- Cleaner architecture (no runtime CSV parsing)
- Keep it simple — no increase in operational complexity
- Run on Vercel with no additional cost
- Maintain performance and caching best practices

## Database Choice: Turso (libSQL/SQLite)

**Why Turso over alternatives:**

| Option | Verdict |
|---|---|
| **Turso (libSQL)** | Best fit. No cold starts, generous free tier (9GB, 500M reads/month), SQLite simplicity, lightweight client. |
| Vercel Postgres (Neon) | Free tier suspends after 5 min idle — cold starts of 1-3s on every request for low-traffic APIs. Tight limits (0.5GB, 100 compute hours). |
| Cloudflare D1 | Designed for Workers, not Vercel. HTTP API adds latency and a custom client layer. |

**Turso free tier:** 9GB storage, 500M row reads/month, 25M row writes/month. More than sufficient.

## Database Schema

```sql
CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL,
  season INTEGER NOT NULL,        -- start year, e.g. 2024 for 2024-2025
  report_type TEXT NOT NULL,      -- 'regular' or 'playoffs'
  name TEXT NOT NULL,
  position TEXT,                  -- 'F' or 'D'
  games INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  plus_minus INTEGER NOT NULL DEFAULT 0,
  penalties INTEGER NOT NULL DEFAULT 0,
  shots INTEGER NOT NULL DEFAULT 0,
  ppp INTEGER NOT NULL DEFAULT 0,
  shp INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  blocks INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE goalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  report_type TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  shutouts INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  penalties INTEGER NOT NULL DEFAULT 0,
  ppp INTEGER NOT NULL DEFAULT 0,
  shp INTEGER NOT NULL DEFAULT 0,
  gaa REAL,
  save_percent REAL
);

CREATE TABLE import_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_players_lookup ON players(team_id, season, report_type);
CREATE INDEX idx_goalies_lookup ON goalies(team_id, season, report_type);
CREATE INDEX idx_players_name ON players(name);
CREATE INDEX idx_goalies_name ON goalies(name);
```

**Key decisions:**
- **Raw stats only, scores computed at query time.** Scoring depends on the result set context, so pre-computing would limit flexibility for future league-wide queries.
- **No `teams` table.** Team config stays in `constants.ts` — it's configuration, not data.
- **No `seasons` table.** Available seasons derived via `SELECT DISTINCT season FROM players WHERE team_id = ? AND report_type = ?`.
- **`import_metadata`** replaces `last-modified.txt` and `manifest.json`.

## Import Pipeline

Current flow stays intact with a DB write step added at the end:

```
CSV → handle-csv.sh → csv/<teamId>/ → R2 upload → DB import
```

**New scripts:**
- `npm run db:migrate` — create/update schema
- `npm run db:import` — import all CSV files into DB (initial migration + full rebuild)
- `npm run db:import:current` — import only current season

**Import logic (TypeScript):**
1. Read cleaned CSV files using existing `csvtojson` + `mapPlayerData` / `mapGoalieData`
2. Wrap in a transaction:
   - `DELETE FROM players WHERE team_id = ? AND season = ? AND report_type = ?`
   - `INSERT INTO players ...` for each row
   - Same for goalies
   - Update `import_metadata.last_modified` with current timestamp
3. Idempotent — safe to re-run

**Integration with existing import:**

```bash
# At the end of import-temp-csv.sh:
if [ "$USE_R2_STORAGE" = "true" ]; then
  npm run r2:upload:current
fi
if [ "$USE_DB_STORAGE" = "true" ]; then
  npm run db:import:current
fi
```

## API Query Layer

The services layer swaps CSV parsing for DB queries. Business logic stays untouched.

**What changes:**
```typescript
// Before:
const rawData = await getRawDataFromFiles(teamId, season, reportType);
const players = rawData.map(mapPlayerData);

// After:
const players = await db.execute({
  sql: 'SELECT * FROM players WHERE team_id = ? AND season = ? AND report_type = ?',
  args: [teamId, season, reportType]
});
```

**What stays identical:**
- `applyPlayerScores()` / `applyGoalieScores()` — scoring logic
- `applyPlayerScoresByPosition()` — position scoring
- `mergePlayersSameSeason()` — `both` report type merging
- `sortItemsByStatField()` — sorting
- All route handlers in `routes.ts`
- ETag caching, auth middleware, error handling

**Season discovery simplified:**
```typescript
// Before: scan filesystem or parse manifest.json
// After:
SELECT DISTINCT season FROM players WHERE team_id = ? AND report_type = ? ORDER BY season
```

**Combined endpoints win big:** currently fetch and parse up to 13 CSV files. With DB, one query: `SELECT * FROM players WHERE team_id = ? AND report_type = ? ORDER BY season`.

## Local Development

`@libsql/client` supports both remote and local SQLite with the same API:

```typescript
import { createClient } from '@libsql/client';

const db = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:local.db' }
);
```

**Local workflow:**
```bash
npm run db:import    # Parse CSV files → local.db
npm run dev          # Reads from local.db, no network needed
```

No Turso account needed for local dev. No R2 credentials. No downloading files.

**Production (Vercel):** Two environment variables:
```
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-token
```

**Comparison to current R2 setup:**

| | Current (R2) | New (Turso) |
|---|---|---|
| Local dev env vars | `USE_R2_STORAGE=false` | None needed |
| Local data setup | `npm run r2:download` | `npm run db:import` |
| Production env vars | 5 | 2 |
| Runtime dependency | `@aws-sdk/client-s3` (heavy) | `@libsql/client` (lightweight) |

`local.db` is gitignored. Each developer generates it from local CSV files.

## Caching Strategy

**Stays:**
- HTTP ETag/304 caching (saves bandwidth, CDN-friendly)
- In-memory response cache per function invocation (warm instances skip DB entirely)
- `Cache-Control` / `Vary` headers

**Goes away:**
- CSV validation cache (`csvIntegrity.ts`) — validation moves to import time
- `seasonsForTeam` / `teamCsvDirExists` caches — indexed DB queries are sub-millisecond
- R2 manifest cache — the DB is the manifest

**Performance comparison:**

| Operation | Current (CSV/R2) | New (DB) |
|---|---|---|
| Cold start, single season | R2 fetch + CSV parse + score | DB query + score |
| Cold start, combined (13 seasons) | 13 R2 fetches + 13 CSV parses + score | 1 DB query + score |
| Warm instance | In-memory cache hit | In-memory cache hit |
| Future: league-wide query | Parse 600+ CSV files | 1 DB query |

## Migration Phases

### Phase 1 — Add DB alongside CSV (no API changes)

- Add `@libsql/client` dependency
- Create schema migration script (`npm run db:migrate`)
- Create import script (`npm run db:import`) reusing existing `mapPlayerData` / `mapGoalieData`
- Set up Turso account + production database
- Add `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` to Vercel env vars
- Run initial import against all existing CSV data
- API still reads from CSV/R2. DB exists but isn't queried yet.

**Phase 1 exit criteria:**
- `npm run verify` passes
- Update README.md and docs/DEVELOPMENT.md with new scripts and Turso setup instructions
- Update docs/TESTING.md if new test patterns are introduced

### Phase 2 — Switch API to read from DB

- Add `db-client.ts` module (connection setup from Local Development section)
- Refactor `services.ts` to query DB instead of CSV parsing
- Scoring, merging, sorting code stays untouched
- Simplify caching (remove CSV-specific caches)
- Update `import-temp-csv.sh` to call `db:import:current` after R2 upload
- CSV/R2 still exists as the import source and backup.

**Phase 2 exit criteria:**
- `npm run verify` passes
- Update README.md and docs/DEVELOPMENT.md to reflect DB as primary data source
- Update docs/TESTING.md with DB mocking patterns and any new test conventions

### Phase 3 — Clean up

- Remove `csvtojson` as a runtime dependency (keep as devDependency for import script)
- Remove `StorageAdapter` read abstraction and R2 manifest system
- Remove CSV validation from query path
- Simplify `helpers.ts` caches
- R2 becomes purely an import artifact store (or remove entirely if DB is source of truth)

**Phase 3 exit criteria:**
- `npm run verify` passes
- Update README.md and docs/DEVELOPMENT.md to remove CSV/R2 runtime references
- Update docs/TESTING.md to remove CSV/R2 mock documentation that no longer applies
- **Remove this plan document from version control** — the design is now reflected in the codebase and documentation

### Cross-cutting requirements

- **Every phase must pass `npm run verify`** (lint + typecheck + build + test coverage ≥97%) before merging
- **Every phase must update documentation**: README.md and docs/DEVELOPMENT.md at minimum, docs/TESTING.md when test patterns change
- **Each phase is independently deployable and rollback-safe**
