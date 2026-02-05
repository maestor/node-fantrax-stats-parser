import csv from "csvtojson";
import path from "path";
import fs from "fs";
import os from "os";

import {
  ApiError,
  sortItemsByStatField,
  availableSeasons,
  applyPlayerScores,
  applyPlayerScoresByPosition,
  applyGoalieScores,
} from "./helpers";
import { validateCsvFileOnceOrThrow } from "./csvIntegrity";
import {
  mapAvailableSeasons,
  mapPlayerData,
  mapGoalieData,
  mapCombinedPlayerData,
  mapCombinedGoalieData,
  mapCombinedPlayerDataFromPlayersWithSeason,
  mapCombinedGoalieDataFromGoaliesWithSeason,
} from "./mappings";
import { RawData, Report, CsvReport, Player, Goalie, PlayerWithSeason, GoalieWithSeason } from "./types";
import { DEFAULT_TEAM_ID } from "./constants";
import { getStorage, isR2Enabled } from "./storage";

// Parser wants seasons as an array even in one-season cases
const getSeasonParam = async (teamId: string, report: Report, season?: number): Promise<number[]> => {
  if (season !== undefined) return [season];
  const seasons = await availableSeasons(teamId, report);
  if (!seasons.length) return [];
  return [Math.max(...seasons)];
};

const getRawDataFromFiles = async (
  teamId: string,
  report: CsvReport,
  seasons: number[]
): Promise<RawData[]> => {
  if (!seasons.length) return [];
  const sources = seasons.map(async (season) => {
    const filePath = path.join(
      process.cwd(),
      "csv",
      teamId,
      `${report}-${season}-${season + 1}.csv`
    );
    try {
      await validateCsvFileOnceOrThrow(filePath);

      let sourceToJson;

      if (isR2Enabled()) {
        // R2 mode: Read content and write to temp file for parsing
        const storage = getStorage();
        const csvContent = await storage.readFile(filePath);

        const tmpFile = path.join(os.tmpdir(), `csv-${Date.now()}-${Math.random()}.csv`);
        await fs.promises.writeFile(tmpFile, csvContent);

        try {
          sourceToJson = await csv().fromFile(tmpFile);
        } finally {
          // Clean up temp file
          await fs.promises.unlink(tmpFile).catch(() => {
            // Ignore cleanup errors
          });
        }
      } else {
        // Filesystem mode: Use fromFile directly (no temp file needed)
        sourceToJson = await csv().fromFile(filePath);
      }

      return sourceToJson.map((item) => ({
        ...item,
        season,
      }));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (typeof error === "object" && error && "statusCode" in error) {
        throw error;
      }
      // Only log in non-test environments to avoid cluttering test output
      /* istanbul ignore next - only runs in production, not during tests */
      if (!process.env.JEST_WORKER_ID) {
        // eslint-disable-next-line no-console
        console.error(`Failed to read CSV file: ${filePath}`, error);
      }
      return [];
    }
  });
  const rawData = await Promise.all(sources);

  return rawData.flat();
};

const getRawDataFromFilesForReports = async (
  teamId: string,
  reports: ReadonlyArray<CsvReport>,
  seasons: number[]
): Promise<RawData[]> => {
  const all = await Promise.all(reports.map((report) => getRawDataFromFiles(teamId, report, seasons)));
  return all.flat();
};

const mergePlayersSameSeason = (players: PlayerWithSeason[]): PlayerWithSeason[] => {
  const merged = new Map<string, PlayerWithSeason>();

  for (const player of players) {
    const key = `${player.name}-${player.season}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...player,
        score: 0,
        scoreAdjustedByGames: 0,
        scores: undefined,
      });
      continue;
    }

    existing.games += player.games;
    existing.goals += player.goals;
    existing.assists += player.assists;
    existing.points += player.points;
    existing.plusMinus += player.plusMinus;
    existing.penalties += player.penalties;
    existing.shots += player.shots;
    existing.ppp += player.ppp;
    existing.shp += player.shp;
    existing.hits += player.hits;
    existing.blocks += player.blocks;
  }

  return [...merged.values()];
};

const mergeGoaliesSameSeason = (goalies: GoalieWithSeason[]): GoalieWithSeason[] => {
  const merged = new Map<string, GoalieWithSeason>();

  for (const goalie of goalies) {
    const key = `${goalie.name}-${goalie.season}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...goalie,
        score: 0,
        scoreAdjustedByGames: 0,
        scores: undefined,
        gaa: undefined,
        savePercent: undefined,
      });
      continue;
    }

    existing.games += goalie.games;
    existing.wins += goalie.wins;
    existing.saves += goalie.saves;
    existing.shutouts += goalie.shutouts;
    existing.goals += goalie.goals;
    existing.assists += goalie.assists;
    existing.points += goalie.points;
    existing.penalties += goalie.penalties;
    existing.ppp += goalie.ppp;
    existing.shp += goalie.shp;
  }

  return [...merged.values()];
};

export const getAvailableSeasons = async (
  teamId: string = DEFAULT_TEAM_ID,
  reportType: Report = "regular",
  startFrom?: number
) => {
  const concreteReport: CsvReport = reportType === "both" ? "regular" : reportType;
  let seasons = await availableSeasons(teamId, concreteReport);

  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }

  return mapAvailableSeasons(seasons);
};

export const getPlayersStatsSeason = async (
  report: Report,
  season?: number,
  teamId: string = DEFAULT_TEAM_ID
) => {
  const seasons = await getSeasonParam(teamId, report, season);
  if (report === "both") {
    const rawData = await getRawDataFromFilesForReports(teamId, ["regular", "playoffs"], seasons);
    const merged = mergePlayersSameSeason(mapPlayerData(rawData));
    const scoredData = applyPlayerScores(merged);
    applyPlayerScoresByPosition(scoredData);
    return sortItemsByStatField(scoredData, "players");
  }

  const rawData = await getRawDataFromFiles(teamId, report, seasons);
  const mappedData = mapPlayerData(rawData);
  const scoredData = applyPlayerScores(mappedData);
  applyPlayerScoresByPosition(scoredData);
  return sortItemsByStatField(scoredData, "players");
};

export const getGoaliesStatsSeason = async (
  report: Report,
  season?: number,
  teamId: string = DEFAULT_TEAM_ID
) => {
  const seasons = await getSeasonParam(teamId, report, season);
  if (report === "both") {
    const rawData = await getRawDataFromFilesForReports(teamId, ["regular", "playoffs"], seasons);
    const merged = mergeGoaliesSameSeason(mapGoalieData(rawData));
    const scoredData = applyGoalieScores(merged);
    return sortItemsByStatField(scoredData, "goalies");
  }

  const rawData = await getRawDataFromFiles(teamId, report, seasons);
  const mappedData = mapGoalieData(rawData);
  const scoredData = applyGoalieScores(mappedData);
  return sortItemsByStatField(scoredData, "goalies");
};

const getCombinedStats = async (
  report: CsvReport,
  mapper: (data: RawData[]) => Player[] | Goalie[],
  kind: "players" | "goalies",
  teamId: string,
  startFrom?: number
) => {
  let seasons = await availableSeasons(teamId, report);

  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }

  const rawData = await getRawDataFromFiles(teamId, report, seasons);
  const mappedData = mapper(rawData);
  let scoredData;
  if (kind === "players") {
    scoredData = applyPlayerScores(mappedData as Player[]);
    applyPlayerScoresByPosition(scoredData);
  } else {
    scoredData = applyGoalieScores(mappedData as Goalie[]);
  }
  return sortItemsByStatField(scoredData, kind);
};

const getPlayersStatsCombinedBoth = async (
  teamId: string,
  startFrom?: number
) => {
  let seasons = await availableSeasons(teamId, "both");
  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }

  const rawData = await getRawDataFromFilesForReports(teamId, ["regular", "playoffs"], seasons);
  const mergedBySeason = mergePlayersSameSeason(mapPlayerData(rawData));
  const combined = mapCombinedPlayerDataFromPlayersWithSeason(mergedBySeason);
  const scored = applyPlayerScores(combined);
  applyPlayerScoresByPosition(scored);
  return sortItemsByStatField(scored, "players");
};

const getGoaliesStatsCombinedBoth = async (
  teamId: string,
  startFrom?: number
) => {
  let seasons = await availableSeasons(teamId, "both");
  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }

  const rawData = await getRawDataFromFilesForReports(teamId, ["regular", "playoffs"], seasons);
  const mergedBySeason = mergeGoaliesSameSeason(mapGoalieData(rawData));
  const combined = mapCombinedGoalieDataFromGoaliesWithSeason(mergedBySeason);
  const scored = applyGoalieScores(combined);
  return sortItemsByStatField(scored, "goalies");
};

export const getPlayersStatsCombined = async (
  report: Report,
  teamId: string = DEFAULT_TEAM_ID,
  startFrom?: number
) =>
  report === "both"
    ? getPlayersStatsCombinedBoth(teamId, startFrom)
    : getCombinedStats(report, mapCombinedPlayerData, "players", teamId, startFrom);

export const getGoaliesStatsCombined = async (
  report: Report,
  teamId: string = DEFAULT_TEAM_ID,
  startFrom?: number
) =>
  report === "both"
    ? getGoaliesStatsCombinedBoth(teamId, startFrom)
    : getCombinedStats(report, mapCombinedGoalieData, "goalies", teamId, startFrom);
