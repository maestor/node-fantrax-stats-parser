#!/usr/bin/env tsx

// Imports playoff round results from the local fantrax-playoffs.json mapping
// into the playoff_results database table — without requiring a full re-sync.
//
// Requires schemaVersion 3 (roundReached + isChampion fields).
// Use: npm run db:import:playoff-results:local
//      npm run db:import:playoff-results:remote

import dotenv from "dotenv";
dotenv.config();

import { readFileSync } from "fs";
import path from "path";
import { getDbClient } from "../src/db/client";

const PLAYOFFS_PATH = path.resolve(
  "src",
  "playwright",
  ".fantrax",
  "fantrax-playoffs.json",
);

type TeamEntry = {
  id: string;
  roundReached?: number;
  isChampion?: boolean;
};

type Season = {
  year: number;
  teams: TeamEntry[];
};

type PlayoffsFile = {
  schemaVersion: number;
  seasons: Season[];
};

const main = async () => {
  let raw: string;
  try {
    raw = readFileSync(PLAYOFFS_PATH, "utf8");
  } catch {
    console.error(
      `❌  Could not read ${PLAYOFFS_PATH}.\n` +
        `   Run npm run playwright:sync:playoffs first to generate it.`,
    );
    process.exit(1);
  }

  const file = JSON.parse(raw) as PlayoffsFile;

  if (
    (file.schemaVersion !== 2 && file.schemaVersion !== 3) ||
    !Array.isArray(file.seasons)
  ) {
    console.error(
      `❌  Unsupported schema version (${file.schemaVersion ?? "unknown"}).\n` +
        `   Expected schemaVersion 2 or 3. Re-run npm run playwright:sync:playoffs.`,
    );
    process.exit(1);
  }

  const db = getDbClient();
  let upserted = 0;
  let skipped = 0;

  for (const season of file.seasons) {
    for (const team of season.teams) {
      if (team.roundReached == null) {
        skipped++;
        continue; // v2 entry — no round data
      }
      const round = team.isChampion ? 5 : team.roundReached;
      await db.execute({
        sql: `INSERT OR REPLACE INTO playoff_results (team_id, season, round)
              VALUES (?, ?, ?)`,
        args: [team.id, season.year, round],
      });
      upserted++;
    }
  }

  console.log(`✅  Imported playoff results from ${PLAYOFFS_PATH}`);
  console.log(`   Upserted: ${upserted}  Skipped (no round data): ${skipped}`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
