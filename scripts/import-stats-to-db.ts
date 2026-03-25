#!/usr/bin/env tsx

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

if (process.env.USE_REMOTE_DB !== "true") {
  process.env.TURSO_DATABASE_URL = "file:local.db";
  delete process.env.TURSO_AUTH_TOKEN;
}

console.info(`Import to DB: ${process.env.TURSO_DATABASE_URL}`);

import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import type { InStatement } from "@libsql/client";
import { CURRENT_SEASON, TEAMS } from "../src/config/index.js";
import {
  buildFantraxEntityUpsertStatements,
  collectFantraxEntitiesFromStats,
} from "../src/features/fantrax/entities.js";
import { mapGoalieData, mapPlayerData } from "../src/features/stats/mapping.js";
import type { RawData } from "../src/features/stats/types.js";
import { getDbClient } from "../src/db/client.js";
import { parseCsvFile } from "./csv.js";

type ReportType = "regular" | "playoffs";

const parseReportTypeArg = (args: string[]): ReportType | null => {
  const reportTypeArg = args.find((arg) => arg.startsWith("--report-type="));
  if (!reportTypeArg) return null;
  const value = reportTypeArg.split("=")[1];
  if (value !== "regular" && value !== "playoffs") {
    throw new Error(`Invalid --report-type value: ${value}`);
  }
  return value;
};

const main = async () => {
  const args = process.argv.slice(2);
  const onlyCurrentSeason = args.includes("--current-only");
  const seasonArg = args.find((arg) => arg.startsWith("--season="));
  const seasonFilter =
    seasonArg !== undefined ? Number(seasonArg.split("=")[1]) : null;
  if (seasonArg !== undefined && !Number.isFinite(seasonFilter)) {
    throw new Error(`Invalid --season value: ${seasonArg.split("=")[1]}`);
  }
  const reportTypeFilter = parseReportTypeArg(args);
  const dryRun = args.includes("--dry-run");

  const csvDir = path.resolve(process.cwd(), "csv");
  const csvHandlerScript = path.resolve(
    process.cwd(),
    "scripts",
    "handle-csv.sh",
  );
  const db = getDbClient();

  console.log("📥 Starting database import...");
  console.log(
    `   Mode: ${
      seasonFilter !== null
        ? `Season ${seasonFilter}-${seasonFilter + 1}`
        : onlyCurrentSeason
          ? "Current season only"
          : "All seasons"
    }`,
  );
  console.log(`   Report type: ${reportTypeFilter ?? "all"}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log("");

  let totalPlayers = 0;
  let totalGoalies = 0;
  let totalFiles = 0;
  let errors = 0;
  let skippedPlayersMissingId = 0;
  let skippedGoaliesMissingId = 0;
  let totalFantraxEntitiesSynced = 0;
  const missingIdMessages: string[] = [];
  const snapshotTeamIds = new Set<string>();

  for (const team of TEAMS) {
    const teamDir = path.join(csvDir, team.id);
    if (!fs.existsSync(teamDir)) {
      console.log(
        `⚠️  Team ${team.id} (${team.name}): No CSV directory, skipping`,
      );
      continue;
    }

    console.log(`📂 Team ${team.id} (${team.name}):`);
    const files = fs.readdirSync(teamDir);

    for (const file of files) {
      const match = file.match(/^(regular|playoffs)-(\d{4})-(\d{4})\.csv$/);
      if (!match) continue;

      const [, reportType, startYear] = match;
      const season = parseInt(startYear, 10);

      if (seasonFilter !== null && season !== seasonFilter) continue;
      if (seasonFilter === null && onlyCurrentSeason && season < CURRENT_SEASON)
        continue;
      if (reportTypeFilter !== null && reportType !== reportTypeFilter)
        continue;

      const filePath = path.join(teamDir, file);
      const normalizedPath = path.join(
        os.tmpdir(),
        `ffhl-import-${process.pid}-${team.id}-${Date.now()}-${file}`,
      );

      try {
        // Always normalize via handle-csv so DB import works even if csv/<teamId>/ contains raw Fantrax exports.
        const normalize = spawnSync(
          "bash",
          [csvHandlerScript, filePath, normalizedPath],
          {
            encoding: "utf8",
          },
        );
        if (normalize.status !== 0) {
          throw new Error(
            `CSV normalization failed for ${file}: ${normalize.stderr || normalize.stdout || "unknown error"}`,
          );
        }

        const rawData = await parseCsvFile<Omit<RawData, "season">>(
          normalizedPath,
        );
        const dataWithSeason: RawData[] = rawData.map((item) => ({
          ...item,
          season,
        }));

        const players = mapPlayerData(dataWithSeason, {
          includeZeroGames: true,
          excludeStatusDashZeroGames: reportType === "playoffs",
        });
        const goalies = mapGoalieData(dataWithSeason, {
          includeZeroGames: true,
          excludeStatusDashZeroGames: reportType === "playoffs",
        });
        const playersMissingId = players.filter((p) => !p.id).length;
        const goaliesMissingId = goalies.filter((g) => !g.id).length;
        const playersToImport = players.filter((p) => p.id);
        const goaliesToImport = goalies.filter((g) => g.id);
        const fantraxEntities = collectFantraxEntitiesFromStats({
          players: playersToImport,
          goalies: goaliesToImport,
        });

        if (playersMissingId > 0 || goaliesMissingId > 0) {
          missingIdMessages.push(
            `Missing Fantrax IDs in ${file}: players=${playersMissingId}, goalies=${goaliesMissingId}. ` +
              "All rows must have IDs before DB import.",
          );
          skippedPlayersMissingId += playersMissingId;
          skippedGoaliesMissingId += goaliesMissingId;
        }

        if (dryRun) {
          console.log(
            `  🔍 Would import: ${file} (${playersToImport.length} players, ${goaliesToImport.length} goalies, ${fantraxEntities.length} Fantrax entities)`,
          );
        } else {
          // Build batch: delete existing + insert all rows atomically
          const statements: InStatement[] = [
            ...buildFantraxEntityUpsertStatements(fantraxEntities),
            {
              sql: "DELETE FROM players WHERE team_id = ? AND season = ? AND report_type = ?",
              args: [team.id, season, reportType],
            },
            {
              sql: "DELETE FROM goalies WHERE team_id = ? AND season = ? AND report_type = ?",
              args: [team.id, season, reportType],
            },
          ];

          for (const player of playersToImport) {
            statements.push({
              sql: `INSERT INTO players (team_id, season, report_type, player_id, name, position, games, goals, assists, points, plus_minus, penalties, shots, ppp, shp, hits, blocks)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                team.id,
                season,
                reportType,
                player.id,
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

          for (const goalie of goaliesToImport) {
            statements.push({
              sql: `INSERT INTO goalies (team_id, season, report_type, goalie_id, name, games, wins, saves, shutouts, goals, assists, points, penalties, ppp, shp, gaa, save_percent)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                team.id,
                season,
                reportType,
                goalie.id,
                goalie.name,
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
            `  ✅ Imported: ${file} (${playersToImport.length} players, ${goaliesToImport.length} goalies, ${fantraxEntities.length} Fantrax entities)`,
          );
        }

        totalPlayers += playersToImport.length;
        totalGoalies += goaliesToImport.length;
        totalFantraxEntitiesSynced += fantraxEntities.length;
        totalFiles++;
        snapshotTeamIds.add(team.id);
      } catch (error) {
        console.error(`  ❌ Error importing ${file}:`, error);
        errors++;
      } finally {
        if (fs.existsSync(normalizedPath)) {
          fs.unlinkSync(normalizedPath);
        }
      }
    }
  }

  if (!dryRun) {
    await db.execute({
      sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
      args: ["last_modified", new Date().toISOString()],
    });

    console.log("");
    console.log("📸 Regenerating combined stats snapshots...");
    const snapshotArgs = [
      "run",
      "snapshot:generate",
      "--",
      "--scope=stats",
    ];
    if (reportTypeFilter !== null) {
      snapshotArgs.push(`--report-type=${reportTypeFilter}`);
    }
    for (const teamId of TEAMS
      .map((team) => team.id)
      .filter((teamId) => snapshotTeamIds.has(teamId))) {
      snapshotArgs.push(`--team-id=${teamId}`);
    }
    const snapshotRun = spawnSync("npm", snapshotArgs, {
      stdio: "inherit",
      env: process.env,
    });
    if (snapshotRun.status !== 0) {
      throw new Error("Snapshot generation failed after DB import");
    }
  }

  console.log("");
  console.log("📊 Summary:");
  console.log(`   Files processed: ${totalFiles}`);
  console.log(`   Players imported: ${totalPlayers}`);
  console.log(`   Goalies imported: ${totalGoalies}`);
  console.log(`   Fantrax entities synced: ${totalFantraxEntitiesSynced}`);
  console.log(`   Errors: ${errors}`);
  console.log(
    `   Rows skipped (missing IDs): players=${skippedPlayersMissingId}, goalies=${skippedGoaliesMissingId}`,
  );

  if (missingIdMessages.length > 0) {
    console.log("");
    console.log("⚠️ Missing Fantrax IDs:");
    for (const message of missingIdMessages) {
      console.log(`   ${message}`);
    }
  }
  console.log("");
  console.log("✨ Done!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
