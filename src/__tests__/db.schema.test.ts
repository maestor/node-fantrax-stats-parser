import fs from "fs/promises";
import os from "os";
import path from "path";
import { createClient, type Client } from "@libsql/client";

import { migrateDb } from "../db/schema.js";

const LEGACY_SCHEMA_SQL = [
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
] as const;

type FantraxEntityRow = {
  fantrax_id: string;
  name: string;
  position: string | null;
  first_seen_season: number;
  last_seen_season: number;
};

const createLegacyDb = async (): Promise<{
  db: Client;
  cleanup: () => Promise<void>;
}> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffhl-schema-test-"));
  const dbPath = path.join(tempDir, "schema.db");
  const db = createClient({ url: `file:${dbPath}` });

  for (const sql of LEGACY_SCHEMA_SQL) {
    await db.execute(sql);
  }

  return {
    db,
    cleanup: async () => {
      (db as unknown as { close?: () => void }).close?.();
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

describe("db schema migration", () => {
  test("backfills fantrax entities from existing stats tables and can rebuild an empty registry", async () => {
    const { db, cleanup } = await createLegacyDb();

    try {
      await db.execute({
        sql: `INSERT INTO players (
                team_id, season, report_type, player_id, name, position
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ["1", 2024, "regular", "p001", "Latest Skater", "F"],
      });
      await db.execute({
        sql: `INSERT INTO players (
                team_id, season, report_type, player_id, name, position
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ["2", 2012, "playoffs", "p001", "Older Typo", "D"],
      });
      await db.execute({
        sql: `INSERT INTO players (
                team_id, season, report_type, player_id, name, position
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ["3", 2020, "regular", "p002", "No Position", null],
      });
      await db.execute({
        sql: `INSERT INTO goalies (
                team_id, season, report_type, goalie_id, name
              ) VALUES (?, ?, ?, ?, ?)`,
        args: ["1", 2018, "regular", "g001", "Goalie Prime"],
      });

      await migrateDb(db);

      const tables = await db.execute(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN (
             'claim_events',
             'claim_event_items',
             'entry_draft_picks',
             'opening_draft_picks',
             'trade_source_blocks',
             'trade_block_items'
           )
         ORDER BY name ASC`,
      );

      expect(tables.rows).toEqual([
        { name: "claim_event_items" },
        { name: "claim_events" },
        { name: "entry_draft_picks" },
        { name: "opening_draft_picks" },
        { name: "trade_block_items" },
        { name: "trade_source_blocks" },
      ]);

      let columns = await db.execute("PRAGMA table_info(entry_draft_picks)");
      let columnNames = columns.rows.map((row) =>
        String((row as unknown as { name: string }).name),
      );
      expect(columnNames).toEqual(
        expect.arrayContaining(["player_name", "fantrax_entity_id"]),
      );

      columns = await db.execute("PRAGMA table_info(opening_draft_picks)");
      columnNames = columns.rows.map((row) =>
        String((row as unknown as { name: string }).name),
      );
      expect(columnNames).toEqual(
        expect.arrayContaining(["player_name", "fantrax_entity_id"]),
      );

      let result = await db.execute(
        `SELECT fantrax_id, name, position, first_seen_season, last_seen_season
         FROM fantrax_entities
         ORDER BY fantrax_id ASC`,
      );

      expect(result.rows).toEqual<FantraxEntityRow[]>([
        {
          fantrax_id: "g001",
          name: "Goalie Prime",
          position: "G",
          first_seen_season: 2018,
          last_seen_season: 2018,
        },
        {
          fantrax_id: "p001",
          name: "Latest Skater",
          position: "F",
          first_seen_season: 2012,
          last_seen_season: 2024,
        },
        {
          fantrax_id: "p002",
          name: "No Position",
          position: null,
          first_seen_season: 2020,
          last_seen_season: 2020,
        },
      ]);

      await db.execute({
        sql: `INSERT INTO players (
                team_id, season, report_type, player_id, name, position
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ["4", 2025, "regular", "p001", "Newest Skater", "D"],
      });
      await db.execute({
        sql: `INSERT INTO goalies (
                team_id, season, report_type, goalie_id, name
              ) VALUES (?, ?, ?, ?, ?)`,
        args: ["5", 2016, "regular", "g001", "Older Goalie Name"],
      });
      await db.execute("DELETE FROM fantrax_entities");

      await migrateDb(db);

      result = await db.execute(
        `SELECT fantrax_id, name, position, first_seen_season, last_seen_season
         FROM fantrax_entities
         ORDER BY fantrax_id ASC`,
      );

      expect(result.rows).toEqual<FantraxEntityRow[]>([
        {
          fantrax_id: "g001",
          name: "Goalie Prime",
          position: "G",
          first_seen_season: 2016,
          last_seen_season: 2018,
        },
        {
          fantrax_id: "p001",
          name: "Newest Skater",
          position: "D",
          first_seen_season: 2012,
          last_seen_season: 2025,
        },
        {
          fantrax_id: "p002",
          name: "No Position",
          position: null,
          first_seen_season: 2020,
          last_seen_season: 2020,
        },
      ]);
    } finally {
      await cleanup();
    }
  });

  test("skips the fantrax entity backfill on repeated migrate when registry already exists", async () => {
    const execute = jest.fn(async (statement: string | { sql: string }) => {
      const sql = typeof statement === "string" ? statement : statement.sql;

      if (sql === "SELECT value FROM import_metadata WHERE key = ?") {
        return { rows: [{ value: "7" }] };
      }

      if (sql === "PRAGMA table_info(claim_event_items)") {
        return {
          rows: [
            { name: "id" },
            { name: "claim_event_id" },
            { name: null },
            { name: "season" },
            { name: "team_id" },
            { name: "occurred_at" },
            { name: "sequence" },
          ],
        };
      }

      if (sql === "PRAGMA table_info(entry_draft_picks)") {
        return {
          rows: [
            { name: "id" },
            { name: "season" },
            { name: "pick_number" },
            { name: "fantrax_entity_id" },
          ],
        };
      }

      if (sql === "PRAGMA table_info(opening_draft_picks)") {
        return {
          rows: [
            { name: "id" },
            { name: "pick_number" },
            { name: "fantrax_entity_id" },
          ],
        };
      }

      if (sql === "SELECT COUNT(*) AS count FROM fantrax_entities") {
        return { rows: [{ count: 3 }] };
      }

      return { rows: [] };
    });

    await migrateDb({ execute: execute as unknown as Client["execute"] });

    const executedSql = execute.mock.calls.map(([statement]) =>
      typeof statement === "string" ? statement : statement.sql,
    );

    expect(
      executedSql.some(
        (sql) =>
          sql.includes("INSERT INTO fantrax_entities") &&
          sql.includes("FROM players p"),
      ),
    ).toBe(false);
    expect(
      executedSql.some(
        (sql) =>
          sql.includes("INSERT INTO fantrax_entities") &&
          sql.includes("FROM goalies g"),
      ),
    ).toBe(false);
  });

  test("rebuilds fantrax entities when the current schema exists but the registry is empty", async () => {
    const execute = jest.fn(async (statement: string | { sql: string }) => {
      const sql = typeof statement === "string" ? statement : statement.sql;

      if (sql === "SELECT value FROM import_metadata WHERE key = ?") {
        return { rows: [{ value: "7" }] };
      }

      if (sql === "PRAGMA table_info(claim_event_items)") {
        return {
          rows: [
            { name: "id" },
            { name: "claim_event_id" },
            { name: "season" },
            { name: "team_id" },
            { name: "occurred_at" },
            { name: "sequence" },
          ],
        };
      }

      if (sql === "PRAGMA table_info(entry_draft_picks)") {
        return {
          rows: [
            { name: "id" },
            { name: "season" },
            { name: "pick_number" },
            { name: "fantrax_entity_id" },
          ],
        };
      }

      if (sql === "PRAGMA table_info(opening_draft_picks)") {
        return {
          rows: [
            { name: "id" },
            { name: "pick_number" },
            { name: "fantrax_entity_id" },
          ],
        };
      }

      if (sql === "SELECT COUNT(*) AS count FROM fantrax_entities") {
        return { rows: [{ count: 0 }] };
      }

      return { rows: [] };
    });

    await migrateDb({ execute: execute as unknown as Client["execute"] });

    const executedSql = execute.mock.calls.map(([statement]) =>
      typeof statement === "string" ? statement : statement.sql,
    );

    expect(
      executedSql.some(
        (sql) =>
          sql.includes("INSERT INTO fantrax_entities") &&
          sql.includes("FROM players p"),
      ),
    ).toBe(true);
    expect(
      executedSql.some(
        (sql) =>
          sql.includes("INSERT INTO fantrax_entities") &&
          sql.includes("FROM goalies g"),
      ),
    ).toBe(true);
  });

  test("adds denormalized claim item columns when upgrading an existing transaction schema", async () => {
    const { db, cleanup } = await createLegacyDb();

    try {
      await db.execute(`CREATE TABLE claim_events (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        season             INTEGER NOT NULL,
        team_id            TEXT NOT NULL,
        occurred_at        TEXT NOT NULL,
        source_file        TEXT NOT NULL,
        source_group_index INTEGER NOT NULL,
        UNIQUE(source_file, source_group_index)
      )`);
      await db.execute(`CREATE TABLE fantrax_entities (
        fantrax_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        position TEXT,
        first_seen_season INTEGER NOT NULL,
        last_seen_season INTEGER NOT NULL
      )`);
      await db.execute(`CREATE TABLE claim_event_items (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_event_id    INTEGER NOT NULL,
        sequence          INTEGER NOT NULL,
        action_type       TEXT NOT NULL,
        fantrax_entity_id TEXT,
        raw_name          TEXT NOT NULL,
        raw_position      TEXT,
        match_status      TEXT NOT NULL,
        match_strategy    TEXT NOT NULL,
        UNIQUE(claim_event_id, sequence),
        FOREIGN KEY (claim_event_id) REFERENCES claim_events(id) ON DELETE CASCADE,
        FOREIGN KEY (fantrax_entity_id) REFERENCES fantrax_entities(fantrax_id)
      )`);
      await db.execute({
        sql: `INSERT INTO claim_events (
                id, season, team_id, occurred_at, source_file, source_group_index
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [1, 2025, "7", "2026-03-05T16:38:00.000Z", "claims-2025-2026.csv", 0],
      });
      await db.execute({
        sql: `INSERT INTO claim_event_items (
                claim_event_id, sequence, action_type, fantrax_entity_id, raw_name,
                raw_position, match_status, match_strategy
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [1, 0, "claim", null, "Claim Target", "F", "matched", "exact_name_position"],
      });
      await db.execute({
        sql: "INSERT INTO import_metadata (key, value) VALUES (?, ?)",
        args: ["schema_version", "6"],
      });

      await migrateDb(db);

      const columns = await db.execute("PRAGMA table_info(claim_event_items)");
      const columnNames = columns.rows.map((row) =>
        String((row as unknown as { name: string }).name),
      );

      expect(columnNames).toEqual(
        expect.arrayContaining(["season", "team_id", "occurred_at"]),
      );

      const indexes = await db.execute(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'index'
           AND name IN ('idx_claim_event_items_season_date', 'idx_claim_event_items_team_date')
         ORDER BY name ASC`,
      );
      expect(indexes.rows).toEqual([
        { name: "idx_claim_event_items_season_date" },
        { name: "idx_claim_event_items_team_date" },
      ]);

      const item = await db.execute(
        `SELECT season, team_id, occurred_at
         FROM claim_event_items
         WHERE claim_event_id = 1`,
      );
      expect(item.rows).toEqual([
        {
          season: null,
          team_id: null,
          occurred_at: null,
        },
      ]);
    } finally {
      await cleanup();
    }
  });

  test("adds draft entity columns and indexes when upgrading older draft tables", async () => {
    const { db, cleanup } = await createLegacyDb();

    try {
      await db.execute(`CREATE TABLE entry_draft_picks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season INTEGER NOT NULL,
        pick_number INTEGER NOT NULL,
        round INTEGER NOT NULL,
        drafted_team_id TEXT NOT NULL,
        owner_team_id TEXT NOT NULL,
        player_name TEXT,
        UNIQUE(season, pick_number)
      )`);
      await db.execute(`CREATE TABLE opening_draft_picks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pick_number INTEGER NOT NULL,
        round INTEGER NOT NULL,
        drafted_team_id TEXT NOT NULL,
        owner_team_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        UNIQUE(pick_number)
      )`);
      await db.execute({
        sql: "INSERT INTO import_metadata (key, value) VALUES (?, ?)",
        args: ["schema_version", "8"],
      });

      await migrateDb(db);

      let columns = await db.execute("PRAGMA table_info(entry_draft_picks)");
      let columnNames = columns.rows.map((row) =>
        String((row as unknown as { name: string }).name),
      );
      expect(columnNames).toEqual(expect.arrayContaining(["fantrax_entity_id"]));

      columns = await db.execute("PRAGMA table_info(opening_draft_picks)");
      columnNames = columns.rows.map((row) =>
        String((row as unknown as { name: string }).name),
      );
      expect(columnNames).toEqual(expect.arrayContaining(["fantrax_entity_id"]));

      const indexes = await db.execute(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'index'
           AND name IN ('idx_entry_draft_picks_entity', 'idx_opening_draft_picks_entity')
         ORDER BY name ASC`,
      );
      expect(indexes.rows).toEqual([
        { name: "idx_entry_draft_picks_entity" },
        { name: "idx_opening_draft_picks_entity" },
      ]);
    } finally {
      await cleanup();
    }
  });
});
