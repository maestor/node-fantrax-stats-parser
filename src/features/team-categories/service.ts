import { CURRENT_SEASON, START_SEASON, TEAMS } from "../../config/index.js";
import {
  getCategoryDashboardSeasons,
  getCategoryGoalieRows,
  getCategoryPlayerRows,
  getLastModifiedFromDb,
  getRegularResultTeamIds,
  type CategoryGoalieRow,
  type CategoryPlayerRow,
} from "../../db/queries.js";
import {
  CATEGORY_KEYS,
  type CategoryGroup,
  type CategoryKey,
  type CategoryDashboardResponse,
  type CategoryDashboardTeam,
  type CategoryGoalieContribution,
  type CategoryPlayerContribution,
  type CategoryValue,
} from "./types.js";

const GOALIE_CATEGORIES = new Set<CategoryKey>(["wins", "saves", "shutouts"]);
const CATEGORIES = CATEGORY_KEYS.map((key) => ({
  key,
  group: (GOALIE_CATEGORIES.has(key) ? "goalie" : "skater") as CategoryGroup,
}));

type SeasonData = {
  season: number;
  players: CategoryPlayerRow[];
  goalies: CategoryGoalieRow[];
  resultTeamIds: Set<string>;
  reportTeamIds: Set<string>;
  skaterReportTeamIds: Set<string>;
  goalieReportTeamIds: Set<string>;
  skaterTotals: Map<string, Record<string, number>>;
  goalieTotals: Map<string, Record<string, number>>;
  skaterGames: Map<string, number>;
  goalieGames: Map<string, number>;
};

const emptyTotals = (fields: readonly string[]): Record<string, number> =>
  Object.fromEntries(fields.map((field) => [field, 0]));

const add = (map: Map<string, Record<string, number>>, teamId: string, key: string, value: number): void => {
  const totals = map.get(teamId) ?? emptyTotals([key]);
  totals[key] = (totals[key] ?? 0) + value;
  map.set(teamId, totals);
};

const addGames = (map: Map<string, number>, teamId: string, games: number): void => {
  map.set(teamId, (map.get(teamId) ?? 0) + games);
};

const totalFor = (data: SeasonData, teamId: string, key: CategoryKey): number => {
  const source = key === "plusMinus" ? "plus_minus" : key;
  const totals = CATEGORIES.find((category) => category.key === key)?.group === "goalie"
    ? data.goalieTotals.get(teamId)
    : data.skaterTotals.get(teamId);
  return totals?.[source] ?? 0;
};

const gamesFor = (data: SeasonData, teamId: string, key: CategoryKey): number =>
  CATEGORIES.find((category) => category.key === key)?.group === "goalie"
    ? data.goalieGames.get(teamId) ?? 0
    : data.skaterGames.get(teamId) ?? 0;

const rankValues = (data: SeasonData, key: CategoryKey, mode: "total" | "rate") => {
  const rows = [...data.reportTeamIds]
    .filter((teamId) => (TEAMS.find((team) => team.id === teamId)?.firstSeason ?? START_SEASON) <= data.season)
    .filter((teamId) => gamesFor(data, teamId, key) > 0)
    .map((teamId) => ({ teamId, total: totalFor(data, teamId, key), games: gamesFor(data, teamId, key) }))
    .map((row) => ({ ...row, value: mode === "total" ? row.total : row.total / row.games }))
    .sort((a, b) => b.value - a.value || a.teamId.localeCompare(b.teamId));
  const values = rows.map((row) => row.value).sort((a, b) => a - b);
  const median = values.length === 0
    ? null
    : values.length % 2 === 1
      ? values[(values.length - 1) / 2]
      : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  const ranked = new Map<string, { rank: number; value: number; games: number; total: number }>();
  rows.forEach((row, index) => {
    if (index === 0 || row.value !== rows[index - 1].value) {
      ranked.set(row.teamId, { rank: index + 1, ...row });
    } else {
      ranked.set(row.teamId, { rank: ranked.get(rows[index - 1].teamId)!.rank, ...row });
    }
  });
  return { rows, median, ranked };
};

const buildSeasonData = async (season: number): Promise<SeasonData> => {
  const [players, goalies, resultTeamIds] = await Promise.all([
    getCategoryPlayerRows(season),
    getCategoryGoalieRows(season),
    getRegularResultTeamIds(season),
  ]);
  const skaterTotals = new Map<string, Record<string, number>>();
  const goalieTotals = new Map<string, Record<string, number>>();
  const skaterGames = new Map<string, number>();
  const goalieGames = new Map<string, number>();
  for (const row of players) {
    addGames(skaterGames, row.team_id, row.games);
    for (const field of ["goals", "assists", "points", "plus_minus", "penalties", "shots", "ppp", "shp", "hits", "blocks"] as const) {
      add(skaterTotals, row.team_id, field, row[field]);
    }
  }
  for (const row of goalies) {
    addGames(goalieGames, row.team_id, row.games);
    for (const field of ["wins", "saves", "shutouts"] as const) add(goalieTotals, row.team_id, field, row[field]);
  }
  const reportTeamIds = new Set([...players.map((row) => row.team_id), ...goalies.map((row) => row.team_id)]);
  const skaterReportTeamIds = new Set(players.map((row) => row.team_id));
  const goalieReportTeamIds = new Set(goalies.map((row) => row.team_id));
  return {
    season,
    players,
    goalies,
    resultTeamIds: new Set(resultTeamIds),
    reportTeamIds,
    skaterReportTeamIds,
    goalieReportTeamIds,
    skaterTotals,
    goalieTotals,
    skaterGames,
    goalieGames,
  };
};

const makeTeamCategory = (
  currentData: SeasonData,
  previousData: SeasonData | undefined,
  teamId: string,
  key: CategoryKey,
): CategoryValue => {
  const currentTotalRankings = rankValues(currentData, key, "total");
  const currentRateRankings = rankValues(currentData, key, "rate");
  const previousTotalRankings = previousData ? rankValues(previousData, key, "total") : undefined;
  const previousRateRankings = previousData ? rankValues(previousData, key, "rate") : undefined;
  const total = totalFor(currentData, teamId, key);
  const games = gamesFor(currentData, teamId, key);
  const rate = games > 0 ? total / games : null;
  const totalRank = currentTotalRankings.ranked.get(teamId)?.rank ?? null;
  const rateRank = currentRateRankings.ranked.get(teamId)?.rank ?? null;
  const nextHigherTotal = totalRank === null ? undefined : currentTotalRankings.rows.find((row) => row.value > total);
  const nextHigherRate = rate === null ? undefined : currentRateRankings.rows.find((row) => row.value > rate);
  const previousTotal = previousData ? totalFor(previousData, teamId, key) : 0;
  const previousGames = previousData ? gamesFor(previousData, teamId, key) : 0;
  const previousRate = previousGames > 0 ? previousTotal / previousGames : null;
  const previousTotalRank = previousTotalRankings?.ranked.get(teamId)?.rank ?? null;
  const previousRateRank = previousRateRankings?.ranked.get(teamId)?.rank ?? null;
  const previousReportTeamIds = CATEGORIES.find((category) => category.key === key)?.group === "goalie"
    ? previousData?.goalieReportTeamIds
    : previousData?.skaterReportTeamIds;
  const hasPreviousData = Boolean(previousReportTeamIds?.has(teamId));
  return {
    total,
    games,
    rate,
    totalRank,
    rateRank,
    totalEligibleTeamCount: currentTotalRankings.rows.length,
    rateEligibleTeamCount: currentRateRankings.rows.length,
    totalMedian: currentTotalRankings.median,
    rateMedian: currentRateRankings.median,
    totalGapToNext: nextHigherTotal ? nextHigherTotal.value - total : null,
    rateGapToNext: nextHigherRate ? nextHigherRate.value - rate! : null,
    previous: hasPreviousData ? {
      total: previousTotal,
      games: previousGames,
      rate: previousRate,
      totalRank: previousTotalRank,
      rateRank: previousRateRank,
      totalEligibleTeamCount: previousTotalRankings!.rows.length,
      rateEligibleTeamCount: previousRateRankings!.rows.length,
      totalChange: previousGames > 0 && games > 0 ? total - previousTotal : null,
      rateChange: rate !== null && previousRate !== null ? rate - previousRate : null,
      totalRankChange: totalRank !== null && previousTotalRank !== null ? previousTotalRank - totalRank : null,
      rateRankChange: rateRank !== null && previousRateRank !== null ? previousRateRank - rateRank : null,
    } : null,
  };
};

const toPlayer = (row: CategoryPlayerRow): CategoryPlayerContribution => ({
  id: row.player_id, name: row.name, position: row.position, games: row.games,
  goals: row.goals, assists: row.assists, points: row.points, plusMinus: row.plus_minus,
  penalties: row.penalties, shots: row.shots, ppp: row.ppp, shp: row.shp, hits: row.hits, blocks: row.blocks,
});

const toGoalie = (row: CategoryGoalieRow): CategoryGoalieContribution => ({
  id: row.goalie_id, name: row.name, games: row.games,
  wins: row.wins, saves: row.saves, shutouts: row.shutouts,
});

const getParticipation = (
  teamId: string,
  season: number,
  data: SeasonData,
): CategoryDashboardTeam["participation"] => {
  const team = TEAMS.find((entry) => entry.id === teamId)!;
  if ((team.firstSeason ?? START_SEASON) > season) return "not-yet-joined";
  if (data.reportTeamIds.has(teamId)) return "reported";
  if (data.resultTeamIds.has(teamId)) return "missing-report";
  return "unknown";
};

export const getCategoryDashboardData = async (
  rawSeason: string | undefined,
): Promise<CategoryDashboardResponse> => {
  const availableSeasons = await getCategoryDashboardSeasons();
  // Resolve the default with one season at a time, descending, so zero-game preseason imports do not win.
  let defaultSeason: number | undefined;
  for (const season of [...availableSeasons].sort((a, b) => b - a)) {
    const data = await buildSeasonData(season);
    if ([...data.skaterGames.values(), ...data.goalieGames.values()].some((games) => games > 0)) {
      defaultSeason = season;
      break;
    }
  }
  let season = defaultSeason ?? CURRENT_SEASON;
  if (rawSeason !== undefined) {
    if (!/^\d{4}$/.test(rawSeason) || !availableSeasons.includes(Number(rawSeason))) {
      throw { statusCode: 400, body: "Invalid or unavailable regular season" };
    }
    season = Number(rawSeason);
  }

  const currentData = await buildSeasonData(season);
  const previousData = availableSeasons.includes(season - 1)
    ? await buildSeasonData(season - 1)
    : undefined;
  const lastModified = await getLastModifiedFromDb();
  const expectedTeams = TEAMS.filter((team) => (team.firstSeason ?? START_SEASON) <= season);
  const participating = new Set(expectedTeams
    .map((team) => team.id)
    .filter((id) => currentData.resultTeamIds.has(id) || currentData.reportTeamIds.has(id)));
  const missingReportTeamIds = expectedTeams
    .filter((team) => currentData.resultTeamIds.has(team.id) && !currentData.reportTeamIds.has(team.id))
    .map((team) => team.id);
  const unknownTeamIds = expectedTeams
    .filter((team) => !currentData.resultTeamIds.has(team.id) && !currentData.reportTeamIds.has(team.id))
    .map((team) => team.id);
  const status = participating.size === 0
    ? "unknown"
    : missingReportTeamIds.length === 0 && unknownTeamIds.length === 0
      ? "complete"
      : "partial";

  return {
    season,
    scope: "regular",
    availableSeasons: [...availableSeasons].sort((a, b) => b - a),
    lastModified,
    seasonHasCreditedGames: [...currentData.skaterGames.values(), ...currentData.goalieGames.values()].some((games) => games > 0),
    coverage: {
      status,
      expectedTeamCount: expectedTeams.length,
      participatingTeamCount: participating.size,
      reportedTeamCount: [...currentData.reportTeamIds].filter((teamId) => expectedTeams.some((team) => team.id === teamId)).length,
      missingReportTeamIds,
      unknownTeamIds,
    },
    categories: CATEGORIES.map((category) => ({ ...category, higherIsBetter: true as const })),
    teams: TEAMS.map((team) => ({
      teamId: team.id,
      teamName: team.presentName,
      teamAbbr: team.teamAbbr,
      participation: getParticipation(team.id, season, currentData),
      skaterGames: currentData.skaterGames.get(team.id) ?? 0,
      goalieGames: currentData.goalieGames.get(team.id) ?? 0,
      categories: Object.fromEntries(CATEGORIES.map(({ key }) => [
        key,
        makeTeamCategory(currentData, previousData, team.id, key),
      ])) as Record<CategoryKey, CategoryValue>,
      players: currentData.players.filter((row) => row.team_id === team.id).map(toPlayer),
      goalies: currentData.goalies.filter((row) => row.team_id === team.id).map(toGoalie),
    })),
  };
};
