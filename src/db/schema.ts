import type { Client } from "@libsql/client";

const DB_SCHEMA_VERSION = "4";

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    season INTEGER NOT NULL,
    report_type TEXT NOT NULL,
    player_id TEXT NOT NULL,
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
    goalie_id TEXT NOT NULL,
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
  `CREATE INDEX IF NOT EXISTS idx_players_career_id
    ON players(player_id, season DESC, team_id, report_type)`,
  `CREATE INDEX IF NOT EXISTS idx_goalies_career_id
    ON goalies(goalie_id, season DESC, team_id, report_type)`,
  `CREATE INDEX IF NOT EXISTS idx_players_name ON players(name)`,
  `CREATE INDEX IF NOT EXISTS idx_goalies_name ON goalies(name)`,
  `CREATE TABLE IF NOT EXISTS playoff_results (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT    NOT NULL,
    season  INTEGER NOT NULL,
    round   INTEGER NOT NULL,
    UNIQUE(team_id, season)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_playoff_results_season
    ON playoff_results(season)`,
  `CREATE TABLE IF NOT EXISTS regular_results (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id             TEXT    NOT NULL,
    season              INTEGER NOT NULL,
    wins                INTEGER NOT NULL,
    losses              INTEGER NOT NULL,
    ties                INTEGER NOT NULL,
    points              INTEGER NOT NULL,
    div_wins            INTEGER NOT NULL,
    div_losses          INTEGER NOT NULL,
    div_ties            INTEGER NOT NULL,
    is_regular_champion INTEGER NOT NULL DEFAULT 0,
    UNIQUE(team_id, season)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_regular_results_season ON regular_results(season)`,
] as const;

type DbExecutor = Pick<Client, "execute">;

export const migrateDb = async (db: DbExecutor): Promise<void> => {
  for (const sql of SCHEMA_SQL) {
    await db.execute(sql);
  }

  await db.execute({
    sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
    args: ["schema_version", DB_SCHEMA_VERSION],
  });
};
