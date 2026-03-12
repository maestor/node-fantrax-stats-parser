import fs from "fs/promises";
import os from "os";
import path from "path";
import { createClient, type Client } from "@libsql/client";

import { migrateDb } from "../db/schema";

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
        return { rows: [{ value: "5" }] };
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
        return { rows: [{ value: "5" }] };
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
});
