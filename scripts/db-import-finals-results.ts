#!/usr/bin/env tsx

// Imports final matchup summaries from fantrax-finals.json into the finals_*
// database tables — without requiring a full re-sync.
//
// Use: npm run db:import:finals-results
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
import type { InStatement } from "@libsql/client";
import { getDbClient } from "../src/db/client.js";
import {
  FINAL_STAT_KEYS,
  parseFinalsFile,
  type FinalCategoryResultValue,
  type FinalSeason,
  type FinalSide,
  type FinalTeam,
} from "../src/playwright/finals-file.js";

const FINALS_PATH = path.resolve(
  "src",
  "playwright",
  ".fantrax",
  "fantrax-finals.json",
);

const parseOptionalRate = (value: string | undefined): number | null => {
  if (value == null || value.trim() === "") return null;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid rate value "${value}"`);
  }

  return parsed;
};

const parseCategoryValue = (
  value: FinalCategoryResultValue,
  context: string,
): number => {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid category value for ${context}: ${String(value)}`);
  }

  return parsed;
};

const getWinnerTeamId = (season: FinalSeason): string => {
  if (season.awayTeam.isWinner === season.homeTeam.isWinner) {
    throw new Error(
      `Expected exactly one winning finalist in ${season.year}, got away=${season.awayTeam.isWinner} home=${season.homeTeam.isWinner}`,
    );
  }

  return season.awayTeam.isWinner
    ? season.awayTeam.teamId
    : season.homeTeam.teamId;
};

const getCategoryWinnerTeamId = (
  season: FinalSeason,
  winner: "away" | "home" | "tie",
): string | null => {
  if (winner === "tie") return null;
  return winner === "away" ? season.awayTeam.teamId : season.homeTeam.teamId;
};

const createTeamInsertStatement = (
  season: FinalSeason,
  side: FinalSide,
  team: FinalTeam,
): InStatement => ({
  sql: `INSERT INTO finals_matchup_teams
          (season, team_id, side, is_winner, categories_won, categories_lost, categories_tied, match_points,
           played_games_total, played_games_skaters, played_games_goalies,
           goals, assists, points, plus_minus, penalties, shots, ppp, shp, hits, blocks,
           wins, saves, shutouts, gaa, save_percent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args: [
    season.year,
    team.teamId,
    side,
    team.isWinner ? 1 : 0,
    team.score.categoriesWon,
    team.score.categoriesLost,
    team.score.categoriesTied,
    team.score.rotisseriePoints,
    team.playedGames.total,
    team.playedGames.skaters,
    team.playedGames.goalies,
    team.totals.goals,
    team.totals.assists,
    team.totals.points,
    team.totals.plusMinus,
    team.totals.penalties,
    team.totals.shots,
    team.totals.ppp,
    team.totals.shp,
    team.totals.hits,
    team.totals.blocks,
    team.totals.wins,
    team.totals.saves,
    team.totals.shutouts,
    parseOptionalRate(team.totals.gaa),
    parseOptionalRate(team.totals.savePercent),
  ],
});

const main = async () => {
  let raw: string;
  try {
    raw = readFileSync(FINALS_PATH, "utf8");
  } catch {
    console.error(
      `❌  Could not read ${FINALS_PATH}.\n` +
        `   Run npm run playwright:sync:finals first to generate it.`,
    );
    process.exit(1);
  }

  let file;
  try {
    file = parseFinalsFile(JSON.parse(raw), FINALS_PATH);
  } catch (error) {
    console.error(
      `❌  ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  if (!file.seasons.length) {
    console.info(`No finals seasons found in ${FINALS_PATH}`);
    return;
  }

  const db = getDbClient();
  const statements: InStatement[] = [];
  let matchups = 0;
  let teams = 0;
  let categories = 0;

  for (const season of file.seasons.slice().sort((a, b) => a.year - b.year)) {
    const winnerTeamId = getWinnerTeamId(season);

    statements.push({
      sql: "DELETE FROM finals_matchup_categories WHERE season = ?",
      args: [season.year],
    });
    statements.push({
      sql: "DELETE FROM finals_matchup_teams WHERE season = ?",
      args: [season.year],
    });
    statements.push({
      sql: "DELETE FROM finals_matchups WHERE season = ?",
      args: [season.year],
    });
    statements.push({
      sql: `INSERT INTO finals_matchups
              (season, away_team_id, home_team_id, winner_team_id, home_tiebreak_won)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        season.year,
        season.awayTeam.teamId,
        season.homeTeam.teamId,
        winnerTeamId,
        season.wonOnHomeTiebreak ? 1 : 0,
      ],
    });
    matchups++;

    statements.push(createTeamInsertStatement(season, "away", season.awayTeam));
    statements.push(createTeamInsertStatement(season, "home", season.homeTeam));
    teams += 2;

    for (const statKey of FINAL_STAT_KEYS) {
      const result = season.categoryResults[statKey];
      if (!result) continue;

      statements.push({
        sql: `INSERT INTO finals_matchup_categories
                (season, stat_key, away_value, home_value, winner_team_id)
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          season.year,
          statKey,
          parseCategoryValue(result.away, `${season.year}/${statKey}/away`),
          parseCategoryValue(result.home, `${season.year}/${statKey}/home`),
          getCategoryWinnerTeamId(season, result.winner),
        ],
      });
      categories++;
    }
  }

  await db.batch(statements, "write");

  await db.execute({
    sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
    args: ["last_modified", new Date().toISOString()],
  });

  console.info(`✅  Imported finals results from ${FINALS_PATH}`);
  console.info(
    `   Upserted matchups: ${matchups}  Teams: ${teams}  Categories: ${categories}`,
  );
  console.info("   No snapshot regeneration is needed for finals imports yet.");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
