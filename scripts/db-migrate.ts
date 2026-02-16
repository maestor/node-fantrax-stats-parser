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
