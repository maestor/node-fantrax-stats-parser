import fs from "fs/promises";
import os from "os";
import path from "path";
import type { Client } from "@libsql/client";
import { getDbClient, resetDbClientForTests } from "../db/client";
import { migrateDb } from "../db/schema";
import { resetRouteCachesForTests } from "../routes";
import { resetSnapshotCacheForTests } from "../snapshots";

type PlayerSeed = {
  teamId: string;
  season: number;
  reportType: "regular" | "playoffs";
  playerId: string;
  name: string;
  position?: string | null;
  games?: number;
  goals?: number;
  assists?: number;
  points?: number;
  plusMinus?: number;
  penalties?: number;
  shots?: number;
  ppp?: number;
  shp?: number;
  hits?: number;
  blocks?: number;
};

type GoalieSeed = {
  teamId: string;
  season: number;
  reportType: "regular" | "playoffs";
  goalieId: string;
  name: string;
  games?: number;
  wins?: number;
  saves?: number;
  shutouts?: number;
  goals?: number;
  assists?: number;
  points?: number;
  penalties?: number;
  ppp?: number;
  shp?: number;
  gaa?: number | null;
  savePercent?: number | null;
};

type PlayoffResultSeed = {
  teamId: string;
  season: number;
  round: number;
};

type RegularResultSeed = {
  teamId: string;
  season: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  divWins: number;
  divLosses: number;
  divTies: number;
  isRegularChampion?: boolean;
};

type IntegrationDbContext = {
  db: Client;
  snapshotDir: string;
  insertPlayers: (rows: readonly PlayerSeed[]) => Promise<void>;
  insertGoalies: (rows: readonly GoalieSeed[]) => Promise<void>;
  insertPlayoffResults: (rows: readonly PlayoffResultSeed[]) => Promise<void>;
  insertRegularResults: (rows: readonly RegularResultSeed[]) => Promise<void>;
  setLastModified: (value: string) => Promise<void>;
  cleanup: () => Promise<void>;
};

const restoreEnv = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

export const createIntegrationDb = async (): Promise<IntegrationDbContext> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffhl-test-db-"));
  const snapshotDir = path.join(tempDir, "snapshots");
  const dbPath = path.join(tempDir, "test.db");
  const previousDbUrl = process.env.TURSO_DATABASE_URL;
  const previousSnapshotDir = process.env.SNAPSHOT_DIR;

  await fs.mkdir(snapshotDir, { recursive: true });

  process.env.TURSO_DATABASE_URL = `file:${dbPath}`;
  process.env.SNAPSHOT_DIR = snapshotDir;

  resetDbClientForTests();
  resetRouteCachesForTests();
  resetSnapshotCacheForTests();

  const db = getDbClient();
  await migrateDb(db);

  const cleanup = async (): Promise<void> => {
    try {
      (db as unknown as { close?: () => void }).close?.();
    } finally {
      resetDbClientForTests();
      resetRouteCachesForTests();
      resetSnapshotCacheForTests();
      restoreEnv("TURSO_DATABASE_URL", previousDbUrl);
      restoreEnv("SNAPSHOT_DIR", previousSnapshotDir);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };

  return {
    db,
    snapshotDir,
    insertPlayers: async (rows) => {
      for (const row of rows) {
        await db.execute({
          sql: `INSERT INTO players (
                  team_id, season, report_type, player_id, name, position, games,
                  goals, assists, points, plus_minus, penalties, shots, ppp, shp, hits, blocks
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            row.teamId,
            row.season,
            row.reportType,
            row.playerId,
            row.name,
            row.position ?? null,
            row.games ?? 0,
            row.goals ?? 0,
            row.assists ?? 0,
            row.points ?? 0,
            row.plusMinus ?? 0,
            row.penalties ?? 0,
            row.shots ?? 0,
            row.ppp ?? 0,
            row.shp ?? 0,
            row.hits ?? 0,
            row.blocks ?? 0,
          ],
        });
      }
    },
    insertGoalies: async (rows) => {
      for (const row of rows) {
        await db.execute({
          sql: `INSERT INTO goalies (
                  team_id, season, report_type, goalie_id, name, games, wins, saves, shutouts,
                  goals, assists, points, penalties, ppp, shp, gaa, save_percent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            row.teamId,
            row.season,
            row.reportType,
            row.goalieId,
            row.name,
            row.games ?? 0,
            row.wins ?? 0,
            row.saves ?? 0,
            row.shutouts ?? 0,
            row.goals ?? 0,
            row.assists ?? 0,
            row.points ?? 0,
            row.penalties ?? 0,
            row.ppp ?? 0,
            row.shp ?? 0,
            row.gaa ?? null,
            row.savePercent ?? null,
          ],
        });
      }
    },
    insertPlayoffResults: async (rows) => {
      for (const row of rows) {
        await db.execute({
          sql: "INSERT INTO playoff_results (team_id, season, round) VALUES (?, ?, ?)",
          args: [row.teamId, row.season, row.round],
        });
      }
    },
    insertRegularResults: async (rows) => {
      for (const row of rows) {
        await db.execute({
          sql: `INSERT INTO regular_results (
                  team_id, season, wins, losses, ties, points,
                  div_wins, div_losses, div_ties, is_regular_champion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            row.teamId,
            row.season,
            row.wins,
            row.losses,
            row.ties,
            row.points,
            row.divWins,
            row.divLosses,
            row.divTies,
            row.isRegularChampion ? 1 : 0,
          ],
        });
      }
    },
    setLastModified: async (value) => {
      await db.execute({
        sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
        args: ["last_modified", value],
      });
    },
    cleanup,
  };
};
