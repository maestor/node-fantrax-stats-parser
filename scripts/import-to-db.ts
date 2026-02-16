#!/usr/bin/env tsx

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import csv from "csvtojson";
import { TEAMS, CURRENT_SEASON } from "../src/constants";
import { mapPlayerData, mapGoalieData } from "../src/mappings";
import { getDbClient } from "../src/db/client";
import type { InStatement } from "@libsql/client";

const main = async () => {
  const args = process.argv.slice(2);
  const onlyCurrentSeason = args.includes("--current-only");
  const dryRun = args.includes("--dry-run");

  const csvDir = path.resolve(process.cwd(), "csv");
  const db = getDbClient();

  console.log("📥 Starting database import...");
  console.log(`   Mode: ${onlyCurrentSeason ? "Current season only" : "All seasons"}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log("");

  let totalPlayers = 0;
  let totalGoalies = 0;
  let totalFiles = 0;
  let errors = 0;

  for (const team of TEAMS) {
    const teamDir = path.join(csvDir, team.id);
    if (!fs.existsSync(teamDir)) {
      console.log(`⚠️  Team ${team.id} (${team.name}): No CSV directory, skipping`);
      continue;
    }

    console.log(`📂 Team ${team.id} (${team.name}):`);
    const files = fs.readdirSync(teamDir);

    for (const file of files) {
      const match = file.match(/^(regular|playoffs)-(\d{4})-(\d{4})\.csv$/);
      if (!match) continue;

      const [, reportType, startYear] = match;
      const season = parseInt(startYear, 10);

      if (onlyCurrentSeason && season < CURRENT_SEASON) continue;

      const filePath = path.join(teamDir, file);

      try {
        // csvtojson returns untyped rows; same pattern as services.ts getRawDataFromFiles
        const rawData = await csv().fromFile(filePath);
        const dataWithSeason = rawData.map((item) => ({ ...item, season }));

        const players = mapPlayerData(dataWithSeason);
        const goalies = mapGoalieData(dataWithSeason);

        if (dryRun) {
          console.log(
            `  🔍 Would import: ${file} (${players.length} players, ${goalies.length} goalies)`
          );
        } else {
          // Build batch: delete existing + insert all rows atomically
          const statements: InStatement[] = [
            {
              sql: "DELETE FROM players WHERE team_id = ? AND season = ? AND report_type = ?",
              args: [team.id, season, reportType],
            },
            {
              sql: "DELETE FROM goalies WHERE team_id = ? AND season = ? AND report_type = ?",
              args: [team.id, season, reportType],
            },
          ];

          for (const player of players) {
            statements.push({
              sql: `INSERT INTO players (team_id, season, report_type, name, position, games, goals, assists, points, plus_minus, penalties, shots, ppp, shp, hits, blocks)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                team.id,
                season,
                reportType,
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

          for (const goalie of goalies) {
            statements.push({
              sql: `INSERT INTO goalies (team_id, season, report_type, name, games, wins, saves, shutouts, goals, assists, points, penalties, ppp, shp, gaa, save_percent)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                team.id,
                season,
                reportType,
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
            `  ✅ Imported: ${file} (${players.length} players, ${goalies.length} goalies)`
          );
        }

        totalPlayers += players.length;
        totalGoalies += goalies.length;
        totalFiles++;
      } catch (error) {
        console.error(`  ❌ Error importing ${file}:`, error);
        errors++;
      }
    }
  }

  if (!dryRun) {
    await db.execute({
      sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
      args: ["last_modified", new Date().toISOString()],
    });
  }

  console.log("");
  console.log("📊 Summary:");
  console.log(`   Files processed: ${totalFiles}`);
  console.log(`   Players imported: ${totalPlayers}`);
  console.log(`   Goalies imported: ${totalGoalies}`);
  console.log(`   Errors: ${errors}`);
  console.log("");
  console.log("✨ Done!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
