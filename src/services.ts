import {
  sortItemsByStatField,
  availableSeasons,
  applyPlayerScores,
  applyPlayerScoresByPosition,
  applyGoalieScores,
} from "./helpers";
import {
  mapAvailableSeasons,
  mapCombinedPlayerDataFromPlayersWithSeason,
  mapCombinedGoalieDataFromGoaliesWithSeason,
} from "./mappings";
import { Report, CsvReport, PlayerWithSeason, GoalieWithSeason } from "./types";
import { DEFAULT_TEAM_ID, TEAMS } from "./constants";
import { getPlayersFromDb, getGoaliesFromDb, getPlayoffLeaderboard } from "./db/queries";
import type { PlayoffLeaderboardEntry } from "./types";

// Parser wants seasons as an array even in one-season cases
const getSeasonParam = async (teamId: string, report: Report, season?: number): Promise<number[]> => {
  if (season !== undefined) return [season];
  const seasons = await availableSeasons(teamId, report);
  if (!seasons.length) return [];
  return [Math.max(...seasons)];
};

const getPlayersForSeasons = async (
  teamId: string,
  report: CsvReport,
  seasons: number[]
): Promise<PlayerWithSeason[]> => {
  if (!seasons.length) return [];
  const results = await Promise.all(
    seasons.map((season) => getPlayersFromDb(teamId, season, report))
  );
  return results.flat();
};

const getGoaliesForSeasons = async (
  teamId: string,
  report: CsvReport,
  seasons: number[]
): Promise<GoalieWithSeason[]> => {
  if (!seasons.length) return [];
  const results = await Promise.all(
    seasons.map((season) => getGoaliesFromDb(teamId, season, report))
  );
  return results.flat();
};

const getPlayersForReports = async (
  teamId: string,
  reports: ReadonlyArray<CsvReport>,
  seasons: number[]
): Promise<PlayerWithSeason[]> => {
  const all = await Promise.all(
    reports.map((report) => getPlayersForSeasons(teamId, report, seasons))
  );
  return all.flat();
};

const getGoaliesForReports = async (
  teamId: string,
  reports: ReadonlyArray<CsvReport>,
  seasons: number[]
): Promise<GoalieWithSeason[]> => {
  const all = await Promise.all(
    reports.map((report) => getGoaliesForSeasons(teamId, report, seasons))
  );
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
    const players = await getPlayersForReports(teamId, ["regular", "playoffs"], seasons);
    const merged = mergePlayersSameSeason(players);
    const scoredData = applyPlayerScores(merged);
    applyPlayerScoresByPosition(scoredData);
    return sortItemsByStatField(scoredData, "players");
  }

  const players = await getPlayersForSeasons(teamId, report, seasons);
  const scoredData = applyPlayerScores(players);
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
    const goalies = await getGoaliesForReports(teamId, ["regular", "playoffs"], seasons);
    const merged = mergeGoaliesSameSeason(goalies);
    const scoredData = applyGoalieScores(merged);
    return sortItemsByStatField(scoredData, "goalies");
  }

  const goalies = await getGoaliesForSeasons(teamId, report, seasons);
  const scoredData = applyGoalieScores(goalies);
  return sortItemsByStatField(scoredData, "goalies");
};

const getPlayersCombinedForReport = async (
  teamId: string,
  report: CsvReport,
  startFrom?: number
) => {
  let seasons = await availableSeasons(teamId, report);
  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }

  const players = await getPlayersForSeasons(teamId, report, seasons);
  const combined = mapCombinedPlayerDataFromPlayersWithSeason(players);
  const scored = applyPlayerScores(combined);
  applyPlayerScoresByPosition(scored);
  return sortItemsByStatField(scored, "players");
};

const getGoaliesCombinedForReport = async (
  teamId: string,
  report: CsvReport,
  startFrom?: number
) => {
  let seasons = await availableSeasons(teamId, report);
  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }

  const goalies = await getGoaliesForSeasons(teamId, report, seasons);
  const combined = mapCombinedGoalieDataFromGoaliesWithSeason(goalies);
  const scored = applyGoalieScores(combined);
  return sortItemsByStatField(scored, "goalies");
};

const getPlayersStatsCombinedBoth = async (
  teamId: string,
  startFrom?: number
) => {
  let seasons = await availableSeasons(teamId, "both");
  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }

  const players = await getPlayersForReports(teamId, ["regular", "playoffs"], seasons);
  const mergedBySeason = mergePlayersSameSeason(players);
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

  const goalies = await getGoaliesForReports(teamId, ["regular", "playoffs"], seasons);
  const mergedBySeason = mergeGoaliesSameSeason(goalies);
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
    : getPlayersCombinedForReport(teamId, report, startFrom);

export const getGoaliesStatsCombined = async (
  report: Report,
  teamId: string = DEFAULT_TEAM_ID,
  startFrom?: number
) =>
  report === "both"
    ? getGoaliesStatsCombinedBoth(teamId, startFrom)
    : getGoaliesCombinedForReport(teamId, report, startFrom);

export const getPlayoffLeaderboardData = async (): Promise<
  PlayoffLeaderboardEntry[]
> => {
  const rows = await getPlayoffLeaderboard();
  return rows.map((row, i) => {
    const team = TEAMS.find((t) => t.id === row.teamId);
    const teamName = team?.presentName ?? row.teamId;

    const prev = i > 0 ? rows[i - 1] : null;
    const tieRank =
      prev !== null &&
      prev.championships === row.championships &&
      prev.finals === row.finals &&
      prev.conferenceFinals === row.conferenceFinals &&
      prev.secondRound === row.secondRound &&
      prev.firstRound === row.firstRound;

    return { ...row, teamName, tieRank };
  });
};
