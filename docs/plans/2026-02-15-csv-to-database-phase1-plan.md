# Phase 1: Add Database Layer Alongside CSV

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Turso (libSQL/SQLite) database infrastructure and import scripts without changing any API behavior.

**Architecture:** A thin DB client module in `src/db/client.ts` (excluded from coverage like `r2-client.ts`), plus two CLI scripts in `scripts/` for schema migration and data import. The API continues reading from CSV/R2 — the DB is populated but not queried by the API yet.

**Tech Stack:** `@libsql/client` for Turso/SQLite connectivity, `csvtojson` + existing `mapPlayerData`/`mapGoalieData` for CSV parsing in the import script.

---

### Task 1: Install dependency and update project config

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.gitignore`
- Modify: `.env.example`

**Step 1: Install @libsql/client**

Run: `npm install @libsql/client`

Expected: Package added to `dependencies` in `package.json`.

**Step 2: Add local SQLite files to .gitignore**

Add at the end of `.gitignore`:

```
# Local SQLite database (Turso local mode)
*.db
*.db-journal
*.db-wal
*.db-shm
```

**Step 3: Add Turso env vars to .env.example**

Add at the end of `.env.example`:

```bash

# Turso Database (optional - if not set, uses local SQLite file)
# Get these from Turso dashboard: https://turso.tech
# TURSO_DATABASE_URL=libsql://your-db-name.turso.io
# TURSO_AUTH_TOKEN=your-auth-token
```

**Step 4: Run verify**

Run: `npm run verify`
Expected: All checks pass. No regressions.

**Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example
git commit -m "feat: add @libsql/client dependency and project config for Turso DB"
```

---

### Task 2: Create DB client module

**Files:**
- Create: `src/db/client.ts`
- Modify: `jest.config.js`

**Step 1: Create `src/db/client.ts`**

This is a thin wrapper (same pattern as `src/storage/r2-client.ts`). It will be excluded from test coverage.

```typescript
import { createClient, type Client } from "@libsql/client";

let clientInstance: Client | null = null;

export const getDbClient = (): Client => {
  if (!clientInstance) {
    clientInstance = process.env.TURSO_DATABASE_URL
      ? createClient({
          url: process.env.TURSO_DATABASE_URL,
          authToken: process.env.TURSO_AUTH_TOKEN,
        })
      : createClient({ url: "file:local.db" });
  }
  return clientInstance;
};

export const resetDbClientForTests = (): void => {
  clientInstance = null;
};
```

**Step 2: Exclude from coverage in `jest.config.js`**

Add `"!src/db/client.ts"` to `collectCoverageFrom` array, after the `r2-client.ts` line:

```javascript
collectCoverageFrom: [
  "src/**/*.ts",
  "!src/playwright/**",
  "!src/types.ts",
  "!src/index.ts",
  "!src/server.ts",
  "!src/storage/r2-client.ts", // AWS SDK integration code - tested via integration tests
  "!src/db/client.ts",         // Turso/libSQL client wrapper - tested via integration tests
],
```

**Step 3: Run verify**

Run: `npm run verify`
Expected: All checks pass. `src/db/client.ts` does not affect coverage.

**Step 4: Commit**

```bash
git add src/db/client.ts jest.config.js
git commit -m "feat: add Turso DB client module with singleton pattern"
```

---

### Task 3: Create schema migration script

**Files:**
- Create: `scripts/db-migrate.ts`
- Modify: `package.json` (add script)

**Step 1: Create `scripts/db-migrate.ts`**

```typescript
#!/usr/bin/env tsx

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import { getDbClient } from "../src/db/client";

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    season INTEGER NOT NULL,
    report_type TEXT NOT NULL,
    name TEXT NOT NULL,
    position TEXT,
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
  )`,
  `CREATE TABLE IF NOT EXISTS goalies (
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
  )`,
  `CREATE TABLE IF NOT EXISTS import_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_players_lookup ON players(team_id, season, report_type)`,
  `CREATE INDEX IF NOT EXISTS idx_goalies_lookup ON goalies(team_id, season, report_type)`,
  `CREATE INDEX IF NOT EXISTS idx_players_name ON players(name)`,
  `CREATE INDEX IF NOT EXISTS idx_goalies_name ON goalies(name)`,
];

const main = async () => {
  const db = getDbClient();

  console.log("🗄️  Running database migration...");

  for (const sql of SCHEMA_SQL) {
    await db.execute(sql);
  }

  await db.execute({
    sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
    args: ["schema_version", "1"],
  });

  console.log("✅ Migration complete!");
  console.log("   Tables: players, goalies, import_metadata");
  console.log(
    "   Indexes: idx_players_lookup, idx_goalies_lookup, idx_players_name, idx_goalies_name"
  );
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 2: Add npm script to `package.json`**

Add to `"scripts"` section:

```json
"db:migrate": "tsx scripts/db-migrate.ts"
```

**Step 3: Run migration locally**

Run: `npm run db:migrate`

Expected output:
```
🗄️  Running database migration...
✅ Migration complete!
   Tables: players, goalies, import_metadata
   Indexes: idx_players_lookup, idx_goalies_lookup, idx_players_name, idx_goalies_name
```

Verify `local.db` was created in project root (it's gitignored).

**Step 4: Run verify**

Run: `npm run verify`
Expected: All checks pass.

**Step 5: Commit**

```bash
git add scripts/db-migrate.ts package.json
git commit -m "feat: add database schema migration script"
```

---

### Task 4: Create import script

**Files:**
- Create: `scripts/import-to-db.ts`
- Modify: `package.json` (add scripts)

**Step 1: Create `scripts/import-to-db.ts`**

This script reuses `mapPlayerData` and `mapGoalieData` from `src/mappings.ts` — the same mapping logic the API uses. It reads CSV files, maps them to typed data, and batch-inserts into the database.

```typescript
#!/usr/bin/env tsx

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import csv from "csvtojson";
import { TEAMS } from "../src/constants";
import { mapPlayerData, mapGoalieData } from "../src/mappings";
import { getDbClient } from "../src/db/client";
import type { InStatement } from "@libsql/client";

const CURRENT_SEASON = 2025; // Update this each year

const main = async () => {
  const args = process.argv.slice(2);
  const onlyCurrentSeason = args.includes("--current-only");
  const dryRun = args.includes("--dry-run");

  const csvDir = path.resolve(process.cwd(), "csv");
  const db = getDbClient();

  console.log("📥 Starting database import...");
  console.log(`   Mode: ${onlyCurrentSeason ? "Current season only" : "All seasons"}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log("");

  let totalPlayers = 0;
  let totalGoalies = 0;
  let totalFiles = 0;
  let errors = 0;

  for (const team of TEAMS) {
    const teamDir = path.join(csvDir, team.id);
    if (!fs.existsSync(teamDir)) {
      console.log(`⚠️  Team ${team.id} (${team.name}): No CSV directory, skipping`);
      continue;
    }

    console.log(`📂 Team ${team.id} (${team.name}):`);
    const files = fs.readdirSync(teamDir);

    for (const file of files) {
      const match = file.match(/^(regular|playoffs)-(\d{4})-(\d{4})\.csv$/);
      if (!match) continue;

      const [, reportType, startYear] = match;
      const season = parseInt(startYear, 10);

      if (onlyCurrentSeason && season < CURRENT_SEASON) continue;

      const filePath = path.join(teamDir, file);

      try {
        const rawData = await csv().fromFile(filePath);
        const dataWithSeason = rawData.map((item: Record<string, unknown>) => ({
          ...item,
          season,
        }));

        const players = mapPlayerData(dataWithSeason);
        const goalies = mapGoalieData(dataWithSeason);

        if (dryRun) {
          console.log(
            `  🔍 Would import: ${file} (${players.length} players, ${goalies.length} goalies)`
          );
        } else {
          // Build batch: delete existing + insert all rows atomically
          const statements: InStatement[] = [
            {
              sql: "DELETE FROM players WHERE team_id = ? AND season = ? AND report_type = ?",
              args: [team.id, season, reportType],
            },
            {
              sql: "DELETE FROM goalies WHERE team_id = ? AND season = ? AND report_type = ?",
              args: [team.id, season, reportType],
            },
          ];

          for (const player of players) {
            statements.push({
              sql: `INSERT INTO players (team_id, season, report_type, name, position, games, goals, assists, points, plus_minus, penalties, shots, ppp, shp, hits, blocks)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                team.id,
                season,
                reportType,
                player.name,
                player.position ?? null,
                player.games,
                player.goals,
                player.assists,
                player.points,
                player.plusMinus,
                player.penalties,
                player.shots,
                player.ppp,
                player.shp,
                player.hits,
                player.blocks,
              ],
            });
          }

          for (const goalie of goalies) {
            statements.push({
              sql: `INSERT INTO goalies (team_id, season, report_type, name, position, games, wins, saves, shutouts, goals, assists, points, penalties, ppp, shp, gaa, save_percent)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                team.id,
                season,
                reportType,
                goalie.name,
                null,
                goalie.games,
                goalie.wins,
                goalie.saves,
                goalie.shutouts,
                goalie.goals,
                goalie.assists,
                goalie.points,
                goalie.penalties,
                goalie.ppp,
                goalie.shp,
                goalie.gaa ? parseFloat(goalie.gaa) : null,
                goalie.savePercent ? parseFloat(goalie.savePercent) : null,
              ],
            });
          }

          await db.batch(statements, "write");

          console.log(
            `  ✅ Imported: ${file} (${players.length} players, ${goalies.length} goalies)`
          );
        }

        totalPlayers += players.length;
        totalGoalies += goalies.length;
        totalFiles++;
      } catch (error) {
        console.error(`  ❌ Error importing ${file}:`, error);
        errors++;
      }
    }
  }

  if (!dryRun) {
    await db.execute({
      sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
      args: ["last_modified", new Date().toISOString()],
    });
  }

  console.log("");
  console.log("📊 Summary:");
  console.log(`   Files processed: ${totalFiles}`);
  console.log(`   Players imported: ${totalPlayers}`);
  console.log(`   Goalies imported: ${totalGoalies}`);
  console.log(`   Errors: ${errors}`);
  console.log("");
  console.log("✨ Done!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 2: Add npm scripts to `package.json`**

Add to `"scripts"` section:

```json
"db:import": "tsx scripts/import-to-db.ts",
"db:import:current": "tsx scripts/import-to-db.ts --current-only"
```

**Step 3: Test with dry run**

Run: `npm run db:import -- --dry-run`

Expected: Lists all CSV files with player/goalie counts, no actual DB writes.

**Step 4: Run actual import**

First ensure migration was run (Task 3), then:

Run: `npm run db:import`

Expected: All CSV files imported successfully with player/goalie counts per file.

**Step 5: Verify data**

Quick sanity check on the imported data:

Run: `npx tsx -e "import dotenv from 'dotenv'; dotenv.config(); import { getDbClient } from './src/db/client'; const db = getDbClient(); const r = await db.execute('SELECT team_id, season, report_type, COUNT(*) as count FROM players GROUP BY team_id, season, report_type LIMIT 10'); console.table(r.rows);"`

Expected: Table showing player counts per team/season/reportType.

**Step 6: Run verify**

Run: `npm run verify`
Expected: All checks pass.

**Step 7: Commit**

```bash
git add scripts/import-to-db.ts package.json
git commit -m "feat: add CSV-to-database import script with batch inserts"
```

---

### Task 5: Final verify and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`

**Step 1: Run full verify**

Run: `npm run verify`
Expected: All checks pass with 100% coverage.

**Step 2: Update `docs/DEVELOPMENT.md`**

Add a new section after "### CSV Data Management" in the npm Scripts Reference:

```markdown
### Database (Turso/SQLite)
- `npm run db:migrate` - Create/update database schema
- `npm run db:import` - Import all CSV files into database
- `npm run db:import:current` - Import only current season into database
```

Add a new section after "### Production (Vercel)" in the Environment Variables section:

```markdown
### Turso Database (optional for Phase 1)

For local development, the database scripts use a local SQLite file (`local.db`) automatically — no configuration needed.

For production (Turso hosted):

- `TURSO_DATABASE_URL` - Turso database URL (e.g., `libsql://your-db.turso.io`)
- `TURSO_AUTH_TOKEN` - Turso authentication token
```

**Step 3: Update `README.md`**

In the "Future roadmap" section, update the database bullet point from:
```
- Store API data in a database (reduce reliance on CSV files at runtime)
```
to:
```
- ~~Store API data in a database (reduce reliance on CSV files at runtime)~~ Phase 1 complete: Turso/SQLite database layer added with import scripts. Phase 2 pending: switch API to read from DB.
```

**Step 4: Commit**

```bash
git add docs/DEVELOPMENT.md README.md
git commit -m "docs: update development guide and README for database migration Phase 1"
```

---

## Notes for implementer

- **Coverage stays at 100%.** The only new `src/` file is `src/db/client.ts`, which is excluded from coverage (same pattern as `src/storage/r2-client.ts`).
- **No API behavior changes.** All existing tests pass unchanged. The API still reads from CSV/R2.
- **The import script reuses `mapPlayerData` and `mapGoalieData`** from `src/mappings.ts`. No duplicated parsing logic.
- **Batch inserts** via `db.batch(statements, "write")` ensure each file's data is imported atomically.
- **The `CURRENT_SEASON` constant** in `scripts/import-to-db.ts` matches the one in `scripts/upload-to-r2.ts`. Both should be updated each year.
- **Local development** needs no Turso account — `getDbClient()` falls back to `file:local.db` when `TURSO_DATABASE_URL` is not set.
