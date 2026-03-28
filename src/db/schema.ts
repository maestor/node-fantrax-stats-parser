import type { Client } from "@libsql/client";

const DB_SCHEMA_VERSION = "9";
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
  `CREATE TABLE IF NOT EXISTS entry_draft_picks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season INTEGER NOT NULL,
    pick_number INTEGER NOT NULL,
    round INTEGER NOT NULL,
    drafted_team_id TEXT NOT NULL,
    owner_team_id TEXT NOT NULL,
    player_name TEXT,
    fantrax_entity_id TEXT,
    UNIQUE(season, pick_number)
  )`,
  `CREATE TABLE IF NOT EXISTS opening_draft_picks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pick_number INTEGER NOT NULL,
    round INTEGER NOT NULL,
    drafted_team_id TEXT NOT NULL,
    owner_team_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    fantrax_entity_id TEXT,
    UNIQUE(pick_number)
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
  `CREATE INDEX IF NOT EXISTS idx_entry_draft_picks_season
    ON entry_draft_picks(season, pick_number)`,
  `CREATE INDEX IF NOT EXISTS idx_entry_draft_picks_drafted_team
    ON entry_draft_picks(drafted_team_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entry_draft_picks_owner_team
    ON entry_draft_picks(owner_team_id)`,
  `CREATE INDEX IF NOT EXISTS idx_opening_draft_picks_pick
    ON opening_draft_picks(pick_number)`,
  `CREATE INDEX IF NOT EXISTS idx_opening_draft_picks_drafted_team
    ON opening_draft_picks(drafted_team_id)`,
  `CREATE INDEX IF NOT EXISTS idx_opening_draft_picks_owner_team
    ON opening_draft_picks(owner_team_id)`,
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
  `CREATE TABLE IF NOT EXISTS claim_events (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    season             INTEGER NOT NULL,
    team_id            TEXT NOT NULL,
    occurred_at        TEXT NOT NULL,
    source_file        TEXT NOT NULL,
    source_group_index INTEGER NOT NULL,
    UNIQUE(source_file, source_group_index)
  )`,
  `CREATE TABLE IF NOT EXISTS claim_event_items (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_event_id    INTEGER NOT NULL,
    season            INTEGER NOT NULL,
    team_id           TEXT NOT NULL,
    occurred_at       TEXT NOT NULL,
    sequence          INTEGER NOT NULL,
    action_type       TEXT NOT NULL,
    fantrax_entity_id TEXT,
    raw_name          TEXT NOT NULL,
    raw_position      TEXT,
    match_status      TEXT NOT NULL,
    match_strategy    TEXT NOT NULL,
    UNIQUE(claim_event_id, sequence),
    FOREIGN KEY (claim_event_id) REFERENCES claim_events(id) ON DELETE CASCADE,
    FOREIGN KEY (fantrax_entity_id) REFERENCES fantrax_entities(fantrax_id),
    CHECK (action_type IN ('claim', 'drop')),
    CHECK (
      match_status IN (
        'matched',
        'unresolved_missing_entity',
        'unresolved_ambiguous_entity',
        'not_applicable'
      )
    ),
    CHECK (
      match_strategy IN (
        'exact_name_position',
        'season_team_context',
        'not_applicable'
      )
    )
  )`,
  `CREATE INDEX IF NOT EXISTS idx_claim_events_season_date
    ON claim_events(season, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_claim_events_team_date
    ON claim_events(team_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_claim_event_items_entity
    ON claim_event_items(fantrax_entity_id)`,
  `CREATE TABLE IF NOT EXISTS trade_source_blocks (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    season                INTEGER NOT NULL,
    occurred_at           TEXT NOT NULL,
    source_file           TEXT NOT NULL,
    source_block_index    INTEGER NOT NULL,
    source_period         INTEGER NOT NULL,
    participant_signature TEXT NOT NULL,
    UNIQUE(source_file, source_block_index)
  )`,
  `CREATE TABLE IF NOT EXISTS trade_block_items (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_source_block_id INTEGER NOT NULL,
    sequence              INTEGER NOT NULL,
    from_team_id          TEXT NOT NULL,
    to_team_id            TEXT NOT NULL,
    asset_type            TEXT NOT NULL,
    fantrax_entity_id     TEXT,
    raw_name              TEXT NOT NULL,
    raw_position          TEXT,
    match_status          TEXT NOT NULL,
    match_strategy        TEXT NOT NULL,
    draft_season          INTEGER,
    draft_round           INTEGER,
    draft_original_team_id TEXT,
    raw_asset_text        TEXT NOT NULL,
    UNIQUE(trade_source_block_id, sequence),
    FOREIGN KEY (trade_source_block_id) REFERENCES trade_source_blocks(id) ON DELETE CASCADE,
    FOREIGN KEY (fantrax_entity_id) REFERENCES fantrax_entities(fantrax_id),
    CHECK (asset_type IN ('player', 'draft_pick', 'other')),
    CHECK (
      match_status IN (
        'matched',
        'unresolved_missing_entity',
        'unresolved_ambiguous_entity',
        'not_applicable'
      )
    ),
    CHECK (
      match_strategy IN (
        'exact_name_position',
        'season_team_context',
        'not_applicable'
      )
    )
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trade_source_blocks_season_date
    ON trade_source_blocks(season, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_trade_source_blocks_signature_date
    ON trade_source_blocks(participant_signature, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_trade_block_items_entity
    ON trade_block_items(fantrax_entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trade_block_items_from_team
    ON trade_block_items(from_team_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trade_block_items_to_team
    ON trade_block_items(to_team_id)`,
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
type TableInfoRow = {
  name?: string | number | bigint | null;
};

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

const getTableColumnNames = async (
  db: DbExecutor,
  tableName: string,
): Promise<Set<string>> => {
  const result = await db.execute(`PRAGMA table_info(${tableName})`);
  const columnNames = new Set<string>();

  for (const row of result.rows) {
    const name = (row as unknown as TableInfoRow).name;
    if (name != null) {
      columnNames.add(String(name));
    }
  }

  return columnNames;
};

const ensureClaimEventItemColumns = async (db: DbExecutor): Promise<void> => {
  const columnNames = await getTableColumnNames(db, "claim_event_items");

  if (!columnNames.has("season")) {
    await db.execute("ALTER TABLE claim_event_items ADD COLUMN season INTEGER");
  }
  if (!columnNames.has("team_id")) {
    await db.execute("ALTER TABLE claim_event_items ADD COLUMN team_id TEXT");
  }
  if (!columnNames.has("occurred_at")) {
    await db.execute("ALTER TABLE claim_event_items ADD COLUMN occurred_at TEXT");
  }

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_claim_event_items_season_date
      ON claim_event_items(season, occurred_at DESC)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_claim_event_items_team_date
      ON claim_event_items(team_id, occurred_at DESC)`,
  );
};

const ensureDraftPickEntityColumns = async (db: DbExecutor): Promise<void> => {
  const entryColumnNames = await getTableColumnNames(db, "entry_draft_picks");
  if (!entryColumnNames.has("fantrax_entity_id")) {
    await db.execute("ALTER TABLE entry_draft_picks ADD COLUMN fantrax_entity_id TEXT");
  }

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_entry_draft_picks_entity
      ON entry_draft_picks(fantrax_entity_id)`,
  );

  const openingColumnNames = await getTableColumnNames(db, "opening_draft_picks");
  if (!openingColumnNames.has("fantrax_entity_id")) {
    await db.execute("ALTER TABLE opening_draft_picks ADD COLUMN fantrax_entity_id TEXT");
  }

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_opening_draft_picks_entity
      ON opening_draft_picks(fantrax_entity_id)`,
  );
};

export const migrateDb = async (db: DbExecutor): Promise<void> => {
  for (const sql of SCHEMA_SQL) {
    await db.execute(sql);
  }

  await ensureClaimEventItemColumns(db);
  await ensureDraftPickEntityColumns(db);

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
