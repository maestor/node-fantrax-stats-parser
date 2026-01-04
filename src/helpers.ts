import fs from "fs";
import { Player, PlayerFields, Goalie, GoalieFields, Report } from "./types";

const START_SEASON = 2012;
const REPORT_TYPES: Report[] = ["playoffs", "regular"];

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_MESSAGES = {
  INVALID_REPORT_TYPE: "Invalid report type",
  SEASON_NOT_AVAILABLE: "Stats for given season are not available",
};

// Check how many regular season files we have
const seasonsTotal = fs.readdirSync("./csv").filter((file) => file.includes("regular"));

const defaultSortPlayers = (a: Player, b: Player): number =>
  b.points - a.points || b.goals - a.goals;

const defaultSortGoalies = (a: Goalie, b: Goalie): number => b.wins - a.wins || b.games - a.games;

export const sortItemsByStatField = (
  data: Player[] | Goalie[],
  kind: "players" | "goalies",
  sortBy?: PlayerFields | GoalieFields
): Player[] | Goalie[] => {
  if (sortBy === "name") {
    return data;
  }

  if (kind === "players") {
    return (data as Player[]).sort((a, b) =>
      sortBy ? (b[sortBy as PlayerFields] as number) - (a[sortBy as PlayerFields] as number) : defaultSortPlayers(a, b)
    );
  } else if (kind === "goalies") {
    return (data as Goalie[]).sort((a, b) =>
      sortBy ? (b[sortBy as GoalieFields] as number) - (a[sortBy as GoalieFields] as number) : defaultSortGoalies(a, b)
    );
  } else {
    return data;
  }
};

export const availableSeasons = (): number[] =>
  Array.from({ length: seasonsTotal?.length ?? 0 }, (_, i) => i + START_SEASON);

export const seasonAvailable = (season?: number) =>
  (season && availableSeasons().includes(season)) ?? false;

export const reportTypeAvailable = (report?: Report) =>
  (report && REPORT_TYPES.includes(report)) ?? false;

export const parseSeasonParam = (value: unknown): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
