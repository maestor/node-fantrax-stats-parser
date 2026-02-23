#!/usr/bin/env tsx

// Imports regular season standings from fantrax-regular.json into the
// regular_results database table — without requiring a full re-sync.
//
// Use: npm run db:import:regular-results
// Set USE_REMOTE_DB=true in .env to target remote Turso instead of local.db

import dotenv from "dotenv";
dotenv.config();

if (process.env.USE_REMOTE_DB !== "true") {
  process.env.TURSO_DATABASE_URL = "file:local.db";
  delete process.env.TURSO_AUTH_TOKEN;
}

console.info(`Import to DB: ${process.env.TURSO_DATABASE_URL}`);

import { readFileSync } from "fs";
import path from "path";
import { getDbClient } from "../src/db/client";

const REGULAR_PATH = path.resolve(
  "src",
  "playwright",
  ".fantrax",
  "fantrax-regular.json",
);

type TeamEntry = {
  id: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  divWins: number;
  divLosses: number;
  divTies: number;
  isRegularChampion?: boolean;
};

type Season = {
  year: number;
  teams: TeamEntry[];
};

type RegularFile = {
  schemaVersion: number;
  seasons: Season[];
};

const main = async () => {
  let raw: string;
  try {
    raw = readFileSync(REGULAR_PATH, "utf8");
  } catch {
    console.error(
      `❌  Could not read ${REGULAR_PATH}.\n` +
      `   Run npm run playwright:sync:regular first to generate it.`,
    );
    process.exit(1);
  }

  const file = JSON.parse(raw) as RegularFile;

  if (file.schemaVersion !== 1 || !Array.isArray(file.seasons)) {
    console.error(
      `❌  Unsupported schema version (${file.schemaVersion ?? "unknown"}).\n` +
      `   Expected schemaVersion 1. Re-run npm run playwright:sync:regular.`,
    );
    process.exit(1);
  }

  const db = getDbClient();
  let upserted = 0;

  for (const season of file.seasons) {
    for (const team of season.teams) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO regular_results
                (team_id, season, wins, losses, ties, points, div_wins, div_losses, div_ties, is_regular_champion)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          team.id,
          season.year,
          team.wins,
          team.losses,
          team.ties,
          team.points,
          team.divWins,
          team.divLosses,
          team.divTies,
          team.isRegularChampion ? 1 : 0,
        ],
      });
      upserted++;
    }
  }

  console.info(`✅  Imported regular results from ${REGULAR_PATH}`);
  console.info(`   Upserted: ${upserted}`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
