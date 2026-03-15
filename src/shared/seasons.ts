import type { CsvReport, Report } from "./types/core";
import {
  CURRENT_SEASON,
  DEFAULT_TEAM_ID,
  REPORT_TYPES,
} from "../config/settings";
import { getAvailableSeasonsFromDb } from "../db/queries";
import { getTeamStartSeason } from "./teams";

const getRegularSeasonRangeForTeam = (teamId: string): number[] => {
  const startSeason = getTeamStartSeason(teamId);
  const seasons: number[] = [];

  for (let season = startSeason; season <= CURRENT_SEASON; season++) {
    seasons.push(season);
  }

  return seasons;
};

const listSeasonsForTeam = async (
  teamId: string,
  reportType: CsvReport,
): Promise<number[]> => {
  return getAvailableSeasonsFromDb(teamId, reportType);
};

export const availableSeasons = async (
  teamId: string = DEFAULT_TEAM_ID,
  reportType: Report = "regular",
): Promise<number[]> => {
  if (reportType === "regular" || reportType === "both") {
    return getRegularSeasonRangeForTeam(teamId);
  }

  return await listSeasonsForTeam(teamId, reportType);
};

export const seasonAvailable = async (
  season: number | undefined,
  teamId: string = DEFAULT_TEAM_ID,
  reportType: Report = "regular",
): Promise<boolean> => {
  if (season === undefined) return true;
  return (await availableSeasons(teamId, reportType)).includes(season);
};

export const reportTypeAvailable = (report?: Report) =>
  !!report && REPORT_TYPES.includes(report);

export const parseSeasonParam = (value: unknown): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
