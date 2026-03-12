import type { Client } from "@libsql/client";

const DB_SCHEMA_VERSION = "5";
const FANTRAX_ENTITIES_SCHEMA_VERSION = 5;

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
  `CREATE TABLE IF NOT EXISTS fantrax_entities (
    fantrax_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position TEXT,
    first_seen_season INTEGER NOT NULL,
    last_seen_season INTEGER NOT NULL,
    CHECK (position IN ('F', 'D', 'G') OR position IS NULL)
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
  `CREATE INDEX IF NOT EXISTS idx_fantrax_entities_name
    ON fantrax_entities(name)`,
  `CREATE INDEX IF NOT EXISTS idx_fantrax_entities_position
    ON fantrax_entities(position)`,
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

const FANTRAX_ENTITIES_BACKFILL_SQL = [
  `INSERT INTO fantrax_entities (
      fantrax_id,
      name,
      position,
      first_seen_season,
      last_seen_season
    )
    SELECT
      p.player_id,
      COALESCE(
        (
          SELECT p2.name
          FROM players p2
          WHERE p2.player_id = p.player_id
            AND NULLIF(TRIM(p2.name), '') IS NOT NULL
          ORDER BY p2.season DESC,
                   CASE p2.report_type WHEN 'regular' THEN 0 ELSE 1 END ASC,
                   p2.team_id ASC
          LIMIT 1
        ),
        MIN(p.name)
      ),
      (
        SELECT NULLIF(TRIM(p2.position), '')
        FROM players p2
        WHERE p2.player_id = p.player_id
          AND NULLIF(TRIM(p2.position), '') IS NOT NULL
        ORDER BY p2.season DESC,
                 CASE p2.report_type WHEN 'regular' THEN 0 ELSE 1 END ASC,
                 p2.team_id ASC
        LIMIT 1
      ),
      MIN(p.season),
      MAX(p.season)
    FROM players p
    WHERE NULLIF(TRIM(p.player_id), '') IS NOT NULL
    GROUP BY p.player_id
    ON CONFLICT(fantrax_id) DO UPDATE SET
      first_seen_season = MIN(fantrax_entities.first_seen_season, excluded.first_seen_season),
      last_seen_season = MAX(fantrax_entities.last_seen_season, excluded.last_seen_season),
      name = CASE
        WHEN excluded.last_seen_season >= fantrax_entities.last_seen_season
          THEN excluded.name
        ELSE fantrax_entities.name
      END,
      position = CASE
        WHEN fantrax_entities.position IS NULL AND excluded.position IS NOT NULL
          THEN excluded.position
        WHEN excluded.last_seen_season >= fantrax_entities.last_seen_season
          THEN COALESCE(excluded.position, fantrax_entities.position)
        ELSE fantrax_entities.position
      END`,
  `INSERT INTO fantrax_entities (
      fantrax_id,
      name,
      position,
      first_seen_season,
      last_seen_season
    )
    SELECT
      g.goalie_id,
      COALESCE(
        (
          SELECT g2.name
          FROM goalies g2
          WHERE g2.goalie_id = g.goalie_id
            AND NULLIF(TRIM(g2.name), '') IS NOT NULL
          ORDER BY g2.season DESC,
                   CASE g2.report_type WHEN 'regular' THEN 0 ELSE 1 END ASC,
                   g2.team_id ASC
          LIMIT 1
        ),
        MIN(g.name)
      ),
      'G',
      MIN(g.season),
      MAX(g.season)
    FROM goalies g
    WHERE NULLIF(TRIM(g.goalie_id), '') IS NOT NULL
    GROUP BY g.goalie_id
    ON CONFLICT(fantrax_id) DO UPDATE SET
      first_seen_season = MIN(fantrax_entities.first_seen_season, excluded.first_seen_season),
      last_seen_season = MAX(fantrax_entities.last_seen_season, excluded.last_seen_season),
      name = CASE
        WHEN excluded.last_seen_season >= fantrax_entities.last_seen_season
          THEN excluded.name
        ELSE fantrax_entities.name
      END,
      position = CASE
        WHEN fantrax_entities.position IS NULL
          THEN excluded.position
        WHEN excluded.last_seen_season >= fantrax_entities.last_seen_season
          THEN excluded.position
        ELSE fantrax_entities.position
      END`,
] as const;

type DbExecutor = Pick<Client, "execute">;

const getImportMetadataValue = async (
  db: DbExecutor,
  key: string,
): Promise<string | null> => {
  const result = await db.execute({
    sql: "SELECT value FROM import_metadata WHERE key = ?",
    args: [key],
  });
  const row = result.rows[0] as { value?: string | number | bigint } | undefined;

  return row?.value === undefined ? null : String(row.value);
};

const shouldBackfillFantraxEntities = async (
  db: DbExecutor,
): Promise<boolean> => {
  const schemaVersion = await getImportMetadataValue(db, "schema_version");
  const parsedSchemaVersion =
    schemaVersion === null ? 0 : Number.parseInt(schemaVersion, 10);

  if (!(parsedSchemaVersion >= FANTRAX_ENTITIES_SCHEMA_VERSION)) {
    return true;
  }

  const result = await db.execute("SELECT COUNT(*) AS count FROM fantrax_entities");
  const row = result.rows[0] as unknown as {
    count: number | string | bigint;
  };

  return Number(row.count) === 0;
};

export const migrateDb = async (db: DbExecutor): Promise<void> => {
  for (const sql of SCHEMA_SQL) {
    await db.execute(sql);
  }

  if (await shouldBackfillFantraxEntities(db)) {
    for (const sql of FANTRAX_ENTITIES_BACKFILL_SQL) {
      await db.execute(sql);
    }
  }

  await db.execute({
    sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
    args: ["schema_version", DB_SCHEMA_VERSION],
  });
};
