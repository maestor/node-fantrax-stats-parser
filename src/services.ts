import csv from "csvtojson";
import path from "path";

import {
  ApiError,
  sortItemsByStatField,
  availableSeasons,
  applyPlayerScores,
  applyGoalieScores,
} from "./helpers";
import { validateCsvFileOnceOrThrow } from "./csvIntegrity";
import {
  mapAvailableSeasons,
  mapPlayerData,
  mapGoalieData,
  mapCombinedPlayerData,
  mapCombinedGoalieData,
} from "./mappings";
import { RawData, Report, Player, Goalie } from "./types";
import { DEFAULT_TEAM_ID } from "./constants";

// Parser wants seasons as an array even in one-season cases
const getSeasonParam = (teamId: string, report: Report, season?: number): number[] => {
  if (season !== undefined) return [season];
  const seasons = availableSeasons(teamId, report);
  if (!seasons.length) return [];
  return [Math.max(...seasons)];
};

const getRawDataFromFiles = async (
  teamId: string,
  report: Report,
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
      const sourceToJson = await csv().fromFile(filePath);

      return sourceToJson.map((item) => ({
        ...item,
        season,
      }));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (typeof error === "object" && error && "statusCode" in error) {
        throw error;
      }
      // eslint-disable-next-line no-console
      console.error(`Failed to read CSV file: ${filePath}`, error);
      return [];
    }
  });
  const rawData = await Promise.all(sources);

  return rawData.flat();
};

export const getAvailableSeasons = async (
  teamId: string = DEFAULT_TEAM_ID,
  reportType: Report = "regular",
  startFrom?: number
) => {
  let seasons = availableSeasons(teamId, reportType);

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
  const rawData = await getRawDataFromFiles(teamId, report, getSeasonParam(teamId, report, season));
  const mappedData = mapPlayerData(rawData);
  const scoredData = applyPlayerScores(mappedData);
  return sortItemsByStatField(scoredData, "players");
};

export const getGoaliesStatsSeason = async (
  report: Report,
  season?: number,
  teamId: string = DEFAULT_TEAM_ID
) => {
  const rawData = await getRawDataFromFiles(teamId, report, getSeasonParam(teamId, report, season));
  const mappedData = mapGoalieData(rawData);
  const scoredData = applyGoalieScores(mappedData);
  return sortItemsByStatField(scoredData, "goalies");
};

const getCombinedStats = async (
  report: Report,
  mapper: (data: RawData[]) => Player[] | Goalie[],
  kind: "players" | "goalies",
  teamId: string = DEFAULT_TEAM_ID,
  startFrom?: number
) => {
  let seasons = availableSeasons(teamId, report);

  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }

  const rawData = await getRawDataFromFiles(teamId, report, seasons);
  const mappedData = mapper(rawData);
  const scoredData =
    kind === "players"
      ? applyPlayerScores(mappedData as Player[])
      : applyGoalieScores(mappedData as Goalie[]);
  return sortItemsByStatField(scoredData, kind);
};

export const getPlayersStatsCombined = async (
  report: Report,
  teamId: string = DEFAULT_TEAM_ID,
  startFrom?: number
) => getCombinedStats(report, mapCombinedPlayerData, "players", teamId, startFrom);

export const getGoaliesStatsCombined = async (
  report: Report,
  teamId: string = DEFAULT_TEAM_ID,
  startFrom?: number
) => getCombinedStats(report, mapCombinedGoalieData, "goalies", teamId, startFrom);
