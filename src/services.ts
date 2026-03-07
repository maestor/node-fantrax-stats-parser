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
import {
  Report,
  CsvReport,
  PlayerWithSeason,
  GoalieWithSeason,
  CountSplit,
  CareerPlayerResponse,
  CareerGoalieResponse,
  CareerPlayerSeasonRow,
  CareerGoalieSeasonRow,
} from "./types";
import { CURRENT_SEASON, DEFAULT_TEAM_ID, START_SEASON, TEAMS } from "./constants";
import {
  getPlayersFromDb,
  getGoaliesFromDb,
  getPlayerCareerRowsFromDb,
  getGoalieCareerRowsFromDb,
  getPlayoffLeaderboard,
  getPlayoffSeasons,
  getRegularLeaderboard,
  getRegularSeasons,
  type PlayerCareerRow,
  type GoalieCareerRow,
  type PlayoffSeasonDbEntry,
  type RegularSeasonDbEntry,
} from "./db/queries";
import type {
  PlayoffLeaderboardEntry,
  PlayoffLeaderboardSeason,
  PlayoffRoundKey,
  RegularLeaderboardEntry,
  RegularLeaderboardSeason,
} from "./types";

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
    const key = `${player.id}-${player.season}`;
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
    const key = `${goalie.id}-${goalie.season}`;
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

type CareerScope = "career" | CsvReport;

type CareerNotFoundError = Error & {
  statusCode: number;
  body: string;
};

const getTeamName = (teamId: string): string => TEAMS.find((team) => team.id === teamId)?.presentName ?? teamId;

const createCountSplit = (owned: number, played: number): CountSplit => ({
  owned,
  played,
});

const getCountSplitForRows = <T extends { season: number; teamId: string; games: number }>(
  rows: readonly T[],
): { seasonCount: CountSplit; teamCount: CountSplit } => {
  const ownedSeasons = new Set<number>();
  const playedSeasons = new Set<number>();
  const ownedTeams = new Set<string>();
  const playedTeams = new Set<string>();

  for (const row of rows) {
    ownedSeasons.add(row.season);
    ownedTeams.add(row.teamId);
    if (row.games > 0) {
      playedSeasons.add(row.season);
      playedTeams.add(row.teamId);
    }
  }

  return {
    seasonCount: createCountSplit(ownedSeasons.size, playedSeasons.size),
    teamCount: createCountSplit(ownedTeams.size, playedTeams.size),
  };
};

const compareReportType = (left: CsvReport, right: CsvReport): number => {
  if (left === right) return 0;
  return left === "regular" ? -1 : 1;
};

const sortCareerRows = <T extends { season: number; teamId: string; reportType: CsvReport }>(
  rows: readonly T[],
): T[] =>
  rows
    .slice()
    .sort(
      (left, right) =>
        right.season - left.season ||
        left.teamId.localeCompare(right.teamId) ||
        compareReportType(left.reportType, right.reportType),
    );

const sortCareerSummaryTeams = <
  T extends { firstSeason: number; lastSeason: number; teamName: string },
>(
  teams: readonly T[],
): T[] =>
  teams.slice().sort((left, right) => {
    const byFirstSeason = left.firstSeason - right.firstSeason;
    if (byFirstSeason !== 0) return byFirstSeason;

    const byLastSeason = left.lastSeason - right.lastSeason;
    if (byLastSeason !== 0) return byLastSeason;

    return left.teamName.localeCompare(right.teamName);
  });

const sortCareerTotalsTeams = <T extends { seasonCount: CountSplit; teamName: string }>(
  teams: readonly T[],
): T[] =>
  teams.slice().sort((left, right) => {
    const byPlayedSeasons = right.seasonCount.played - left.seasonCount.played;
    if (byPlayedSeasons !== 0) return byPlayedSeasons;

    const byOwnedSeasons = right.seasonCount.owned - left.seasonCount.owned;
    if (byOwnedSeasons !== 0) return byOwnedSeasons;

    return left.teamName.localeCompare(right.teamName);
  });

const createNotFoundError = (message: string): CareerNotFoundError =>
  Object.assign(new Error(message), {
    statusCode: 404,
    body: message,
  });

const mapOptionalGoalieRate = (value: number | null): string | undefined =>
  value != null && value !== 0 ? String(value) : undefined;

const mapPlayerCareerSeasonRows = (rows: readonly PlayerCareerRow[]): CareerPlayerSeasonRow[] =>
  sortCareerRows(
    rows.map((row) => ({
      season: row.season,
      reportType: row.report_type,
      teamId: row.team_id,
      teamName: getTeamName(row.team_id),
      position: row.position ?? undefined,
      games: row.games,
      goals: row.goals,
      assists: row.assists,
      points: row.points,
      plusMinus: row.plus_minus,
      penalties: row.penalties,
      shots: row.shots,
      ppp: row.ppp,
      shp: row.shp,
      hits: row.hits,
      blocks: row.blocks,
    })),
  );

const mapGoalieCareerSeasonRows = (rows: readonly GoalieCareerRow[]): CareerGoalieSeasonRow[] =>
  sortCareerRows(
    rows.map((row) => ({
      season: row.season,
      reportType: row.report_type,
      teamId: row.team_id,
      teamName: getTeamName(row.team_id),
      games: row.games,
      wins: row.wins,
      saves: row.saves,
      shutouts: row.shutouts,
      goals: row.goals,
      assists: row.assists,
      points: row.points,
      penalties: row.penalties,
      ppp: row.ppp,
      shp: row.shp,
      gaa: mapOptionalGoalieRate(row.gaa),
      savePercent: mapOptionalGoalieRate(row.save_percent),
    })),
  );

const buildCareerSummary = <T extends { season: number; teamId: string; games: number }>(rows: readonly T[]) => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.teamId);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.teamId, [row]);
    }
  }

  return {
    firstSeason: Math.min(...rows.map((row) => row.season)),
    lastSeason: Math.max(...rows.map((row) => row.season)),
    ...getCountSplitForRows(rows),
    teams: sortCareerSummaryTeams(
      [...grouped.entries()].map(([teamId, teamRows]) => ({
        teamId,
        teamName: getTeamName(teamId),
        seasonCount: getCountSplitForRows(teamRows).seasonCount,
        firstSeason: Math.min(...teamRows.map((row) => row.season)),
        lastSeason: Math.max(...teamRows.map((row) => row.season)),
      })),
    ),
  };
};

const filterRowsByScope = <T extends { reportType: CsvReport }>(
  rows: readonly T[],
  scope: CareerScope,
): T[] => (scope === "career" ? [...rows] : rows.filter((row) => row.reportType === scope));

const buildPlayerTotalsForScope = (rows: readonly CareerPlayerSeasonRow[], scope: CareerScope) => {
  const scopedRows = filterRowsByScope(rows, scope);
  const grouped = new Map<string, CareerPlayerSeasonRow[]>();

  for (const row of scopedRows) {
    const list = grouped.get(row.teamId);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.teamId, [row]);
    }
  }

  return {
    ...getCountSplitForRows(scopedRows),
    teams: sortCareerTotalsTeams(
      [...grouped.entries()].map(([teamId, teamRows]) => ({
        teamId,
        teamName: getTeamName(teamId),
        seasonCount: getCountSplitForRows(teamRows).seasonCount,
        games: teamRows.reduce((sum, row) => sum + row.games, 0),
        goals: teamRows.reduce((sum, row) => sum + row.goals, 0),
        assists: teamRows.reduce((sum, row) => sum + row.assists, 0),
        points: teamRows.reduce((sum, row) => sum + row.points, 0),
        plusMinus: teamRows.reduce((sum, row) => sum + row.plusMinus, 0),
        penalties: teamRows.reduce((sum, row) => sum + row.penalties, 0),
        shots: teamRows.reduce((sum, row) => sum + row.shots, 0),
        ppp: teamRows.reduce((sum, row) => sum + row.ppp, 0),
        shp: teamRows.reduce((sum, row) => sum + row.shp, 0),
        hits: teamRows.reduce((sum, row) => sum + row.hits, 0),
        blocks: teamRows.reduce((sum, row) => sum + row.blocks, 0),
      })),
    ),
    games: scopedRows.reduce((sum, row) => sum + row.games, 0),
    goals: scopedRows.reduce((sum, row) => sum + row.goals, 0),
    assists: scopedRows.reduce((sum, row) => sum + row.assists, 0),
    points: scopedRows.reduce((sum, row) => sum + row.points, 0),
    plusMinus: scopedRows.reduce((sum, row) => sum + row.plusMinus, 0),
    penalties: scopedRows.reduce((sum, row) => sum + row.penalties, 0),
    shots: scopedRows.reduce((sum, row) => sum + row.shots, 0),
    ppp: scopedRows.reduce((sum, row) => sum + row.ppp, 0),
    shp: scopedRows.reduce((sum, row) => sum + row.shp, 0),
    hits: scopedRows.reduce((sum, row) => sum + row.hits, 0),
    blocks: scopedRows.reduce((sum, row) => sum + row.blocks, 0),
  };
};

const buildGoalieTotalsForScope = (rows: readonly CareerGoalieSeasonRow[], scope: CareerScope) => {
  const scopedRows = filterRowsByScope(rows, scope);
  const grouped = new Map<string, CareerGoalieSeasonRow[]>();

  for (const row of scopedRows) {
    const list = grouped.get(row.teamId);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.teamId, [row]);
    }
  }

  return {
    ...getCountSplitForRows(scopedRows),
    teams: sortCareerTotalsTeams(
      [...grouped.entries()].map(([teamId, teamRows]) => ({
        teamId,
        teamName: getTeamName(teamId),
        seasonCount: getCountSplitForRows(teamRows).seasonCount,
        games: teamRows.reduce((sum, row) => sum + row.games, 0),
        wins: teamRows.reduce((sum, row) => sum + row.wins, 0),
        saves: teamRows.reduce((sum, row) => sum + row.saves, 0),
        shutouts: teamRows.reduce((sum, row) => sum + row.shutouts, 0),
        goals: teamRows.reduce((sum, row) => sum + row.goals, 0),
        assists: teamRows.reduce((sum, row) => sum + row.assists, 0),
        points: teamRows.reduce((sum, row) => sum + row.points, 0),
        penalties: teamRows.reduce((sum, row) => sum + row.penalties, 0),
        ppp: teamRows.reduce((sum, row) => sum + row.ppp, 0),
        shp: teamRows.reduce((sum, row) => sum + row.shp, 0),
      })),
    ),
    games: scopedRows.reduce((sum, row) => sum + row.games, 0),
    wins: scopedRows.reduce((sum, row) => sum + row.wins, 0),
    saves: scopedRows.reduce((sum, row) => sum + row.saves, 0),
    shutouts: scopedRows.reduce((sum, row) => sum + row.shutouts, 0),
    goals: scopedRows.reduce((sum, row) => sum + row.goals, 0),
    assists: scopedRows.reduce((sum, row) => sum + row.assists, 0),
    points: scopedRows.reduce((sum, row) => sum + row.points, 0),
    penalties: scopedRows.reduce((sum, row) => sum + row.penalties, 0),
    ppp: scopedRows.reduce((sum, row) => sum + row.ppp, 0),
    shp: scopedRows.reduce((sum, row) => sum + row.shp, 0),
  };
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

export const getPlayerCareerData = async (playerId: string): Promise<CareerPlayerResponse> => {
  const rows = await getPlayerCareerRowsFromDb(playerId);
  if (!rows.length) {
    throw createNotFoundError("Player not found");
  }

  const seasons = mapPlayerCareerSeasonRows(rows);
  return {
    id: playerId,
    name: rows[0].name,
    position: rows.find((row) => row.position)?.position ?? undefined,
    summary: buildCareerSummary(seasons),
    totals: {
      career: buildPlayerTotalsForScope(seasons, "career"),
      regular: buildPlayerTotalsForScope(seasons, "regular"),
      playoffs: buildPlayerTotalsForScope(seasons, "playoffs"),
    },
    seasons,
  };
};

export const getGoalieCareerData = async (goalieId: string): Promise<CareerGoalieResponse> => {
  const rows = await getGoalieCareerRowsFromDb(goalieId);
  if (!rows.length) {
    throw createNotFoundError("Goalie not found");
  }

  const seasons = mapGoalieCareerSeasonRows(rows);
  return {
    id: goalieId,
    name: rows[0].name,
    summary: buildCareerSummary(seasons),
    totals: {
      career: buildGoalieTotalsForScope(seasons, "career"),
      regular: buildGoalieTotalsForScope(seasons, "regular"),
      playoffs: buildGoalieTotalsForScope(seasons, "playoffs"),
    },
    seasons,
  };
};

export const getPlayoffLeaderboardData = async (): Promise<
  PlayoffLeaderboardEntry[]
> => {
  const rows = await getPlayoffLeaderboard();
  const seasonsByTeam = await getPlayoffSeasons();
  const latestPlayoffSeason =
    seasonsByTeam.length > 0
      ? Math.max(...seasonsByTeam.map((entry) => entry.season))
      : CURRENT_SEASON;

  const missingTeams = TEAMS.filter((t) => !rows.some((r) => r.teamId === t.id));
  const allRows = [
    ...rows,
    ...missingTeams.map((t) => ({
      teamId: t.id,
      championships: 0,
      finals: 0,
      conferenceFinals: 0,
      secondRound: 0,
      firstRound: 0,
    })),
  ];

  const seasonsByTeamId = new Map<string, PlayoffSeasonDbEntry[]>();
  for (const seasonEntry of seasonsByTeam) {
    const list = seasonsByTeamId.get(seasonEntry.teamId);
    if (list) {
      list.push(seasonEntry);
    } else {
      seasonsByTeamId.set(seasonEntry.teamId, [seasonEntry]);
    }
  }

  const getFirstSeasonForTeam = (teamId: string): number => {
    const team = TEAMS.find((entry) => entry.id === teamId);
    return team?.firstSeason ?? START_SEASON;
  };

  const toRoundKey = (round: number): PlayoffRoundKey => {
    if (round === 5) return "championship";
    if (round === 4) return "final";
    if (round === 3) return "conferenceFinal";
    if (round === 2) return "secondRound";
    if (round === 1) return "firstRound";
    return "notQualified";
  };

  const buildPlayoffSeasons = (teamId: string): PlayoffLeaderboardSeason[] => {
    const bySeason = new Map<number, number>();
    const rowsForTeam = seasonsByTeamId.get(teamId) ?? [];
    for (const row of rowsForTeam) {
      bySeason.set(row.season, row.round);
    }

    const firstSeason = getFirstSeasonForTeam(teamId);
    const seasons: PlayoffLeaderboardSeason[] = [];
    for (let season = firstSeason; season <= latestPlayoffSeason; season++) {
      const round = bySeason.get(season) ?? 0;
      seasons.push({ season, round, key: toRoundKey(round) });
    }
    return seasons;
  };

  return allRows.map((row, i) => {
    const team = TEAMS.find((t) => t.id === row.teamId);
    const teamName = team?.presentName ?? row.teamId;

    const appearances =
      row.championships +
      row.finals +
      row.conferenceFinals +
      row.secondRound +
      row.firstRound;

    const prev = i > 0 ? allRows[i - 1] : null;
    const tieRank =
      prev !== null &&
      prev.championships === row.championships &&
      prev.finals === row.finals &&
      prev.conferenceFinals === row.conferenceFinals &&
      prev.secondRound === row.secondRound &&
      prev.firstRound === row.firstRound;

    return {
      ...row,
      teamName,
      appearances,
      seasons: buildPlayoffSeasons(row.teamId),
      tieRank,
    };
  });
};

const computeRegularSeasonPercents = (
  row: Pick<
    RegularSeasonDbEntry,
    "wins" | "losses" | "ties" | "points" | "divWins" | "divLosses" | "divTies"
  >,
): Pick<RegularLeaderboardSeason, "winPercent" | "divWinPercent" | "pointsPercent"> => {
  const total = row.wins + row.losses + row.ties;
  const divTotal = row.divWins + row.divLosses + row.divTies;
  const winPercent = total > 0 ? Math.round((row.wins / total) * 1000) / 1000 : 0;
  const divWinPercent = divTotal > 0 ? Math.round((row.divWins / divTotal) * 1000) / 1000 : 0;
  const pointsPercent = total > 0 ? Math.round((row.points / (total * 2)) * 1000) / 1000 : 0;
  return { winPercent, divWinPercent, pointsPercent };
};

export const getRegularLeaderboardData = async (): Promise<
  RegularLeaderboardEntry[]
> => {
  const rows = await getRegularLeaderboard();
  const seasonsByTeam = await getRegularSeasons();

  const seasonsByTeamId = new Map<string, RegularSeasonDbEntry[]>();
  for (const seasonEntry of seasonsByTeam) {
    const list = seasonsByTeamId.get(seasonEntry.teamId);
    if (list) {
      list.push(seasonEntry);
    } else {
      seasonsByTeamId.set(seasonEntry.teamId, [seasonEntry]);
    }
  }

  const buildRegularSeasons = (teamId: string): RegularLeaderboardSeason[] => {
    const teamRows = seasonsByTeamId.get(teamId) ?? [];
    return teamRows.map((row) => ({
      season: row.season,
      regularTrophy: row.regularTrophy,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      points: row.points,
      divWins: row.divWins,
      divLosses: row.divLosses,
      divTies: row.divTies,
      ...computeRegularSeasonPercents(row),
    }));
  };

  return rows.map((row, i) => {
    const team = TEAMS.find((t) => t.id === row.teamId);
    const teamName = team?.presentName ?? row.teamId;

    const prev = i > 0 ? rows[i - 1] : null;
    const tieRank =
      prev !== null &&
      prev.points === row.points &&
      prev.wins === row.wins;

    const { winPercent, divWinPercent, pointsPercent } = computeRegularSeasonPercents(row);

    return {
      ...row,
      teamName,
      tieRank,
      winPercent,
      divWinPercent,
      pointsPercent,
      seasons: buildRegularSeasons(row.teamId),
    };
  });
};
