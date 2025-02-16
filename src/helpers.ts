import fs from "fs";
import { Player, PlayerFields, Goalie, GoalieFields, Report } from "./types";

const START_SEASON = 2012;
const REPORT_TYPES: Report[] = ["playoffs", "regular"];

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
    return data.sort((a: any, b: any) =>
      sortBy ? b[sortBy] - a[sortBy] : defaultSortPlayers(a, b)
    );
  } else if (kind === "goalies") {
    return data.sort((a: any, b: any) =>
      sortBy ? b[sortBy] - a[sortBy] : defaultSortGoalies(a, b)
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
