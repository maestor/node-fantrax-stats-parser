import type {
  CareerGoalieListItem,
  CareerGoalieResponse,
  CareerGoalieSeasonRow,
  CareerHighlightTeam,
  CareerHighlightType,
  CareerPlayerListItem,
  CareerPlayerResponse,
  CareerPlayerSeasonRow,
  CareerRegularGrinderHighlightItem,
  CareerReunionHighlightItem,
  CareerReunionHighlightReunion,
  CareerReunionType,
  CareerSameTeamHighlightItem,
  CareerStanleyCupHighlightCup,
  CareerStanleyCupHighlightItem,
  CareerStashHighlightItem,
  CareerTeamCountHighlightItem,
  CareerTransactionHighlightItem,
  CareerTransactionHighlightTeam,
  CountSplit,
} from "./types.js";
import type { CsvReport } from "../../shared/types/core.js";
import { CAREER_HIGHLIGHT_CONFIG, TEAMS } from "../../config/index.js";
import {
  getAllGoalieCareerRowsFromDb,
  getAllPlayerCareerRowsFromDb,
  getClaimTransactionHighlightRowsFromDb,
  getDropTransactionHighlightRowsFromDb,
  getGoalieCareerRowsFromDb,
  getPlayerCareerRowsFromDb,
  getPlayoffSeasons,
  getReunionTransactionHighlightRowsFromDb,
  getTradeTransactionHighlightRowsFromDb,
  type CareerReunionHighlightDbRow,
  type CareerTransactionHighlightDbRow,
  type GoalieCareerRow,
  type PlayerCareerRow,
} from "../../db/queries.js";
import {
  formatOptionalGoalieGaa,
  formatOptionalGoalieSavePercent,
} from "../../shared/goalie-rates.js";

type CareerScope = "career" | CsvReport;

type CareerNotFoundError = Error & {
  statusCode: number;
  body: string;
};

type CareerHighlightRow = {
  source: "player" | "goalie";
  id: string;
  name: string;
  position: string;
  teamId: string;
  season: number;
  reportType: CsvReport;
  games: number;
};

type CareerTransactionHighlightRow = {
  id: string;
  name: string;
  position: string;
  teamId: string;
  transactionCount: number;
};

type CareerReunionHighlightRow = {
  id: string;
  name: string;
  position: string;
  teamId: string;
  date: string;
  type: CareerReunionType;
};

type TeamFirstSeason = CareerHighlightTeam & {
  firstSeason: number;
};

const getTeamName = (teamId: string): string =>
  TEAMS.find((team) => team.id === teamId)?.presentName ?? teamId;

const createCountSplit = (owned: number, played: number): CountSplit => ({
  owned,
  played,
});

const getCountSplitForRows = <
  T extends { season: number; teamId: string; games: number },
>(
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

const sortCareerRows = <
  T extends { season: number; teamId: string; reportType: CsvReport },
>(
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

const sortCareerTotalsTeams = <
  T extends { seasonCount: CountSplit; teamName: string },
>(
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

const requirePlayerPosition = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value === "") {
    throw new Error("Player position missing");
  }
  return value;
};

const mapPlayerCareerSeasonRows = (
  rows: readonly PlayerCareerRow[],
): CareerPlayerSeasonRow[] =>
  sortCareerRows(
    rows.map((row) => ({
      season: row.season,
      reportType: row.report_type,
      teamId: row.team_id,
      teamName: getTeamName(row.team_id),
      position: requirePlayerPosition(row.position),
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

const mapGoalieCareerSeasonRows = (
  rows: readonly GoalieCareerRow[],
): CareerGoalieSeasonRow[] =>
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
      gaa: formatOptionalGoalieGaa(row.gaa, row.games),
      savePercent: formatOptionalGoalieSavePercent(row.save_percent, row.games),
    })),
  );

const buildCareerSummary = <
  T extends { season: number; teamId: string; games: number },
>(
  rows: readonly T[],
) => {
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
): T[] =>
  scope === "career" ? [...rows] : rows.filter((row) => row.reportType === scope);

const buildPlayerTotalsForScope = (
  rows: readonly CareerPlayerSeasonRow[],
  scope: CareerScope,
) => {
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

const buildGoalieTotalsForScope = (
  rows: readonly CareerGoalieSeasonRow[],
  scope: CareerScope,
) => {
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

const groupCareerRowsById = <
  T extends
    | (PlayerCareerRow & { id: string })
    | (GoalieCareerRow & { id: string }),
>(
  rows: readonly T[],
): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.id);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.id, [row]);
    }
  }
  return grouped;
};

const countDistinctSeasons = <T extends { season: number }>(
  rows: readonly T[],
): number => new Set(rows.map((row) => row.season)).size;

const countDistinctTeams = <T extends { team_id: string }>(
  rows: readonly T[],
): number => new Set(rows.map((row) => row.team_id)).size;

const filterPlayedRowsByReport = <
  T extends { report_type: CsvReport; games: number },
>(
  rows: readonly T[],
  reportType: CsvReport,
): T[] => rows.filter((row) => row.report_type === reportType && row.games > 0);

const sortCareerListItems = <T extends { name: string; id: string }>(
  items: readonly T[],
): T[] =>
  items
    .slice()
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );

const buildPlayerCareerListItem = (
  rows: readonly PlayerCareerRow[],
): CareerPlayerListItem => {
  const regularPlayedRows = filterPlayedRowsByReport(rows, "regular");
  const playoffPlayedRows = filterPlayedRowsByReport(rows, "playoffs");

  return {
    id: rows[0].player_id,
    name: rows[0].name,
    position: requirePlayerPosition(rows.find((row) => row.position)?.position),
    firstSeason: Math.min(...rows.map((row) => row.season)),
    lastSeason: Math.max(...rows.map((row) => row.season)),
    seasonsOwned: countDistinctSeasons(rows),
    seasonsPlayedRegular: countDistinctSeasons(regularPlayedRows),
    seasonsPlayedPlayoffs: countDistinctSeasons(playoffPlayedRows),
    teamsOwned: countDistinctTeams(rows),
    teamsPlayedRegular: countDistinctTeams(regularPlayedRows),
    teamsPlayedPlayoffs: countDistinctTeams(playoffPlayedRows),
    regularGames: rows
      .filter((row) => row.report_type === "regular")
      .reduce((sum, row) => sum + row.games, 0),
    playoffGames: rows
      .filter((row) => row.report_type === "playoffs")
      .reduce((sum, row) => sum + row.games, 0),
  };
};

const buildGoalieCareerListItem = (
  rows: readonly GoalieCareerRow[],
): CareerGoalieListItem => {
  const regularPlayedRows = filterPlayedRowsByReport(rows, "regular");
  const playoffPlayedRows = filterPlayedRowsByReport(rows, "playoffs");

  return {
    id: rows[0].goalie_id,
    name: rows[0].name,
    firstSeason: Math.min(...rows.map((row) => row.season)),
    lastSeason: Math.max(...rows.map((row) => row.season)),
    seasonsOwned: countDistinctSeasons(rows),
    seasonsPlayedRegular: countDistinctSeasons(regularPlayedRows),
    seasonsPlayedPlayoffs: countDistinctSeasons(playoffPlayedRows),
    teamsOwned: countDistinctTeams(rows),
    teamsPlayedRegular: countDistinctTeams(regularPlayedRows),
    teamsPlayedPlayoffs: countDistinctTeams(playoffPlayedRows),
    regularGames: rows
      .filter((row) => row.report_type === "regular")
      .reduce((sum, row) => sum + row.games, 0),
    playoffGames: rows
      .filter((row) => row.report_type === "playoffs")
      .reduce((sum, row) => sum + row.games, 0),
  };
};

const mapPlayerCareerHighlightRows = (
  rows: readonly PlayerCareerRow[],
): CareerHighlightRow[] =>
  rows.map((row) => ({
    source: "player",
    id: row.player_id,
    name: row.name,
    position: requirePlayerPosition(row.position),
    teamId: row.team_id,
    season: row.season,
    reportType: row.report_type,
    games: row.games,
  }));

const mapGoalieCareerHighlightRows = (
  rows: readonly GoalieCareerRow[],
): CareerHighlightRow[] =>
  rows.map((row) => ({
    source: "goalie",
    id: row.goalie_id,
    name: row.name,
    position: "G",
    teamId: row.team_id,
    season: row.season,
    reportType: row.report_type,
    games: row.games,
  }));

const groupCareerHighlightRows = (
  rows: readonly CareerHighlightRow[],
): Map<string, CareerHighlightRow[]> => {
  const grouped = new Map<string, CareerHighlightRow[]>();
  for (const row of rows) {
    const key = `${row.source}:${row.id}`;
    const list = grouped.get(key);
    if (list) {
      list.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }
  return grouped;
};

const mapCareerTransactionHighlightRows = (
  rows: readonly CareerTransactionHighlightDbRow[],
): CareerTransactionHighlightRow[] =>
  rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: requirePlayerPosition(row.position),
    teamId: row.teamId,
    transactionCount: row.transactionCount,
  }));

const mapCareerReunionHighlightRows = (
  rows: readonly CareerReunionHighlightDbRow[],
): CareerReunionHighlightRow[] =>
  rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: requirePlayerPosition(row.position),
    teamId: row.teamId,
    date: row.date,
    type: row.type,
  }));

const groupCareerTransactionHighlightRows = (
  rows: readonly CareerTransactionHighlightRow[],
): Map<string, CareerTransactionHighlightRow[]> => {
  const grouped = new Map<string, CareerTransactionHighlightRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.id);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.id, [row]);
    }
  }
  return grouped;
};

const groupCareerReunionHighlightRows = (
  rows: readonly CareerReunionHighlightRow[],
): Map<string, CareerReunionHighlightRow[]> => {
  const grouped = new Map<string, CareerReunionHighlightRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.id);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.id, [row]);
    }
  }
  return grouped;
};

const sortCareerHighlightTeams = (
  teams: readonly TeamFirstSeason[],
): CareerHighlightTeam[] =>
  teams
    .slice()
    .sort(
      (left, right) =>
        left.firstSeason - right.firstSeason ||
        left.name.localeCompare(right.name),
    )
    .map(({ id, name }) => ({ id, name }));

const buildCareerHighlightTeams = (
  rows: readonly CareerHighlightRow[],
): CareerHighlightTeam[] => {
  const firstSeasonByTeam = new Map<string, number>();
  for (const row of rows) {
    const current = firstSeasonByTeam.get(row.teamId);
    if (current === undefined || row.season < current) {
      firstSeasonByTeam.set(row.teamId, row.season);
    }
  }

  return sortCareerHighlightTeams(
    [...firstSeasonByTeam.entries()].map(([id, firstSeason]) => ({
      id,
      name: getTeamName(id),
      firstSeason,
    })),
  );
};

const sortCareerTransactionHighlightTeams = (
  teams: readonly CareerTransactionHighlightTeam[],
): CareerTransactionHighlightTeam[] =>
  teams
    .slice()
    .sort(
      (left, right) =>
        right.count - left.count ||
        `${left.name}:${left.id}`.localeCompare(`${right.name}:${right.id}`),
    );

const buildCareerTransactionHighlightTeams = (
  rows: readonly CareerTransactionHighlightRow[],
): CareerTransactionHighlightTeam[] => {
  const countsByTeam = new Map<string, number>();
  for (const row of rows) {
    countsByTeam.set(
      row.teamId,
      (countsByTeam.get(row.teamId) ?? 0) + row.transactionCount,
    );
  }

  return sortCareerTransactionHighlightTeams(
    [...countsByTeam.entries()].map(([id, count]) => ({
      id,
      name: getTeamName(id),
      count,
    })),
  );
};

const compareCareerHighlightIdentity = (
  left: { name: string; id: string; position: string },
  right: { name: string; id: string; position: string },
): number =>
  left.name.localeCompare(right.name) ||
  left.id.localeCompare(right.id) ||
  left.position.localeCompare(right.position);

const buildCareerTeamCountHighlightItem = (
  rows: readonly CareerHighlightRow[],
  playedOnly: boolean,
  minTeamCount: number,
): CareerTeamCountHighlightItem | null => {
  const countedRows = playedOnly
    ? rows.filter((row) => row.games > 0)
    : [...rows];
  const teams = buildCareerHighlightTeams(countedRows);
  if (teams.length < minTeamCount) {
    return null;
  }

  return {
    id: rows[0].id,
    name: rows[0].name,
    position: rows[0].position,
    teamCount: teams.length,
    teams,
  };
};

const buildCareerSameTeamHighlightItems = (
  rows: readonly CareerHighlightRow[],
  playedOnly: boolean,
  minSeasonCount: number,
): CareerSameTeamHighlightItem[] => {
  const countedRows = playedOnly
    ? rows.filter((row) => row.games > 0)
    : [...rows];
  const seasonsByTeam = new Map<string, Set<number>>();

  for (const row of countedRows) {
    const seasons = seasonsByTeam.get(row.teamId);
    if (seasons) {
      seasons.add(row.season);
    } else {
      seasonsByTeam.set(row.teamId, new Set([row.season]));
    }
  }

  const maxSeasonCount = Math.max(
    0,
    ...[...seasonsByTeam.values()].map((seasons) => seasons.size),
  );
  if (maxSeasonCount < minSeasonCount) {
    return [];
  }

  return [...seasonsByTeam.entries()]
    .filter(([, seasons]) => seasons.size === maxSeasonCount)
    .map(([teamId]) => ({
      id: rows[0].id,
      name: rows[0].name,
      position: rows[0].position,
      seasonCount: maxSeasonCount,
      team: {
        id: teamId,
        name: getTeamName(teamId),
      },
    }))
    .sort((left, right) => left.team.name.localeCompare(right.team.name));
};

const buildCareerStanleyCupHighlightCups = (
  rows: readonly CareerHighlightRow[],
  championSeasonKeys: ReadonlySet<string>,
): CareerStanleyCupHighlightCup[] => {
  const cups = new Map<string, CareerStanleyCupHighlightCup>();

  for (const row of rows) {
    if (row.reportType !== "playoffs" || row.games <= 0) continue;

    const key = `${row.teamId}:${row.season}`;
    if (!championSeasonKeys.has(key) || cups.has(key)) continue;

    cups.set(key, {
      season: row.season,
      team: {
        id: row.teamId,
        name: getTeamName(row.teamId),
      },
    });
  }

  return [...cups.values()].sort(
    (left, right) =>
      left.season - right.season ||
      left.team.name.localeCompare(right.team.name),
  );
};

const buildCareerStanleyCupHighlightItem = (
  rows: readonly CareerHighlightRow[],
  championSeasonKeys: ReadonlySet<string>,
  minCupCount: number,
): CareerStanleyCupHighlightItem | null => {
  const cups = buildCareerStanleyCupHighlightCups(rows, championSeasonKeys);
  if (cups.length < minCupCount) {
    return null;
  }

  return {
    id: rows[0].id,
    name: rows[0].name,
    position: rows[0].position,
    cupCount: cups.length,
    cups,
  };
};

const sortCareerReunionHighlightReunions = (
  reunions: readonly CareerReunionHighlightReunion[],
): CareerReunionHighlightReunion[] =>
  reunions.slice().sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    if (byDate !== 0) return byDate;
    return left.type.localeCompare(right.type);
  });

const buildCareerReunionHighlightItems = (
  rows: readonly CareerReunionHighlightRow[],
  minReunionCount: number,
): CareerReunionHighlightItem[] => {
  const reunionsByTeam = new Map<string, CareerReunionHighlightReunion[]>();
  for (const row of rows) {
    const reunions = reunionsByTeam.get(row.teamId);
    const reunion = { date: row.date, type: row.type };
    if (reunions) {
      reunions.push(reunion);
    } else {
      reunionsByTeam.set(row.teamId, [reunion]);
    }
  }

  const reunionCounts = [...reunionsByTeam.entries()].map(
    ([teamId, reunions]) => ({
      teamId,
      reunionCount: reunions.length,
      reunions: sortCareerReunionHighlightReunions(reunions),
    }),
  );
  const maxReunionCount = Math.max(
    0,
    ...reunionCounts.map((entry) => entry.reunionCount),
  );

  if (maxReunionCount < minReunionCount) {
    return [];
  }

  return reunionCounts
    .filter((entry) => entry.reunionCount === maxReunionCount)
    .map(({ teamId, reunionCount, reunions }) => ({
      id: rows[0].id,
      name: rows[0].name,
      position: rows[0].position,
      reunionCount,
      team: {
        id: teamId,
        name: getTeamName(teamId),
      },
      reunions,
    }))
    .sort((left, right) => left.team.name.localeCompare(right.team.name));
};

const buildCareerStashHighlightItems = (
  rows: readonly CareerHighlightRow[],
  minStashCount: number,
): CareerStashHighlightItem[] => {
  const maxGamesByTeamSeason = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.teamId}:${row.season}`;
    maxGamesByTeamSeason.set(
      key,
      Math.max(row.games, maxGamesByTeamSeason.get(key) ?? 0),
    );
  }

  const stashSeasonsByTeam = new Map<string, Set<number>>();
  for (const [key, games] of maxGamesByTeamSeason.entries()) {
    if (games !== 0) continue;

    const [teamId, season] = key.split(":");
    const seasons = stashSeasonsByTeam.get(teamId);
    if (seasons) {
      seasons.add(Number(season));
    } else {
      stashSeasonsByTeam.set(teamId, new Set([Number(season)]));
    }
  }

  const maxSeasonCount = Math.max(
    0,
    ...[...stashSeasonsByTeam.values()].map((seasons) => seasons.size),
  );
  if (maxSeasonCount < minStashCount) {
    return [];
  }

  return [...stashSeasonsByTeam.entries()]
    .filter(([, seasons]) => seasons.size === maxSeasonCount)
    .map(([teamId]) => ({
      id: rows[0].id,
      name: rows[0].name,
      position: rows[0].position,
      seasonCount: maxSeasonCount,
      team: {
        id: teamId,
        name: getTeamName(teamId),
      },
    }))
    .sort((left, right) => left.team.name.localeCompare(right.team.name));
};

const buildCareerRegularGrinderHighlightItem = (
  rows: readonly CareerHighlightRow[],
  minRegularGames: number,
): CareerRegularGrinderHighlightItem | null => {
  if (rows.some((row) => row.reportType === "playoffs" && row.games > 0)) {
    return null;
  }

  const maxRegularGamesBySeason = new Map<number, number>();
  const regularPlayedRows = rows.filter(
    (row) => row.reportType === "regular" && row.games > 0,
  );
  for (const row of rows) {
    if (row.reportType !== "regular" || row.games <= 0) continue;

    maxRegularGamesBySeason.set(
      row.season,
      Math.max(row.games, maxRegularGamesBySeason.get(row.season) ?? 0),
    );
  }

  const regularGames = [...maxRegularGamesBySeason.values()].reduce(
    (sum, games) => sum + games,
    0,
  );
  if (regularGames < minRegularGames) {
    return null;
  }

  return {
    id: rows[0].id,
    name: rows[0].name,
    position: rows[0].position,
    regularGames,
    teams: buildCareerHighlightTeams(regularPlayedRows),
  };
};

const buildCareerTransactionHighlightItem = (
  rows: readonly CareerTransactionHighlightRow[],
  minTransactionCount: number,
): CareerTransactionHighlightItem | null => {
  const teams = buildCareerTransactionHighlightTeams(rows);
  const transactionCount = teams.reduce((sum, team) => sum + team.count, 0);
  if (transactionCount < minTransactionCount) {
    return null;
  }

  return {
    id: rows[0].id,
    name: rows[0].name,
    position: rows[0].position,
    transactionCount,
    teams,
  };
};

const sortCareerTeamCountHighlightItems = (
  items: readonly CareerTeamCountHighlightItem[],
): CareerTeamCountHighlightItem[] =>
  items.slice().sort((left, right) => {
    const byCount = right.teamCount - left.teamCount;
    if (byCount !== 0) return byCount;

    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) return byName;

    const byId = left.id.localeCompare(right.id);
    if (byId !== 0) return byId;

    return left.position.localeCompare(right.position);
  });

const sortCareerSameTeamHighlightItems = (
  items: readonly CareerSameTeamHighlightItem[],
): CareerSameTeamHighlightItem[] =>
  items.slice().sort((left, right) => {
    const byCount = right.seasonCount - left.seasonCount;
    if (byCount !== 0) return byCount;

    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) return byName;

    const byId = left.id.localeCompare(right.id);
    if (byId !== 0) return byId;

    const byTeam = left.team.name.localeCompare(right.team.name);
    if (byTeam !== 0) return byTeam;

    return left.position.localeCompare(right.position);
  });

const sortCareerStanleyCupHighlightItems = (
  items: readonly CareerStanleyCupHighlightItem[],
): CareerStanleyCupHighlightItem[] =>
  items
    .slice()
    .sort(
      (left, right) =>
        right.cupCount - left.cupCount ||
        compareCareerHighlightIdentity(left, right),
    );

const sortCareerReunionHighlightItems = (
  items: readonly CareerReunionHighlightItem[],
): CareerReunionHighlightItem[] =>
  items
    .slice()
    .sort(
      (left, right) =>
        right.reunionCount - left.reunionCount ||
        compareCareerHighlightIdentity(left, right) ||
        left.team.name.localeCompare(right.team.name),
    );

const sortCareerStashHighlightItems = (
  items: readonly CareerStashHighlightItem[],
): CareerStashHighlightItem[] =>
  items
    .slice()
    .sort(
      (left, right) =>
        right.seasonCount - left.seasonCount ||
        compareCareerHighlightIdentity(left, right) ||
        left.team.name.localeCompare(right.team.name),
    );

const sortCareerRegularGrinderHighlightItems = (
  items: readonly CareerRegularGrinderHighlightItem[],
): CareerRegularGrinderHighlightItem[] =>
  items
    .slice()
    .sort(
      (left, right) =>
        right.regularGames - left.regularGames ||
        compareCareerHighlightIdentity(left, right),
    );

const sortCareerTransactionHighlightItems = (
  items: readonly CareerTransactionHighlightItem[],
): CareerTransactionHighlightItem[] =>
  items
    .slice()
    .sort(
      (left, right) =>
        right.transactionCount - left.transactionCount ||
        compareCareerHighlightIdentity(left, right),
    );

const CAREER_TRANSACTION_HIGHLIGHT_LOADERS = {
  claim: getClaimTransactionHighlightRowsFromDb,
  drop: getDropTransactionHighlightRowsFromDb,
  trade: getTradeTransactionHighlightRowsFromDb,
} as const;

const getCareerTransactionHighlightRows = async (
  transactionType: keyof typeof CAREER_TRANSACTION_HIGHLIGHT_LOADERS,
): Promise<CareerTransactionHighlightRow[]> =>
  mapCareerTransactionHighlightRows(
    await CAREER_TRANSACTION_HIGHLIGHT_LOADERS[transactionType](),
  );

const getCareerReunionHighlightRows = async (): Promise<
  CareerReunionHighlightRow[]
> => mapCareerReunionHighlightRows(await getReunionTransactionHighlightRowsFromDb());

export const getPlayerCareerData = async (
  playerId: string,
): Promise<CareerPlayerResponse> => {
  const rows = await getPlayerCareerRowsFromDb(playerId);
  if (!rows.length) {
    throw createNotFoundError("Player not found");
  }

  const seasons = mapPlayerCareerSeasonRows(rows);
  return {
    id: playerId,
    name: rows[0].name,
    position: requirePlayerPosition(rows.find((row) => row.position)?.position),
    summary: buildCareerSummary(seasons),
    totals: {
      career: buildPlayerTotalsForScope(seasons, "career"),
      regular: buildPlayerTotalsForScope(seasons, "regular"),
      playoffs: buildPlayerTotalsForScope(seasons, "playoffs"),
    },
    seasons,
  };
};

export const getGoalieCareerData = async (
  goalieId: string,
): Promise<CareerGoalieResponse> => {
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

export const getCareerPlayersData = async (): Promise<CareerPlayerListItem[]> => {
  const rows = await getAllPlayerCareerRowsFromDb();
  const grouped = groupCareerRowsById(
    rows.map((row) => ({ ...row, id: row.player_id })),
  );
  return sortCareerListItems(
    [...grouped.values()].map((playerRows) =>
      buildPlayerCareerListItem(playerRows),
    ),
  );
};

export const getCareerGoaliesData = async (): Promise<CareerGoalieListItem[]> => {
  const rows = await getAllGoalieCareerRowsFromDb();
  const grouped = groupCareerRowsById(
    rows.map((row) => ({ ...row, id: row.goalie_id })),
  );
  return sortCareerListItems(
    [...grouped.values()].map((goalieRows) =>
      buildGoalieCareerListItem(goalieRows),
    ),
  );
};

export const getCareerHighlightsData = async (
  type: CareerHighlightType,
): Promise<
  | CareerTeamCountHighlightItem[]
  | CareerSameTeamHighlightItem[]
  | CareerStanleyCupHighlightItem[]
  | CareerReunionHighlightItem[]
  | CareerStashHighlightItem[]
  | CareerRegularGrinderHighlightItem[]
  | CareerTransactionHighlightItem[]
> => {
  const config = CAREER_HIGHLIGHT_CONFIG[type];

  if (config.kind === "transaction-count") {
    const rows = await getCareerTransactionHighlightRows(config.transactionType);
    const grouped = groupCareerTransactionHighlightRows(rows);

    return sortCareerTransactionHighlightItems(
      [...grouped.values()]
        .map((groupRows) =>
          buildCareerTransactionHighlightItem(groupRows, config.minCount),
        )
        .filter(
          (item): item is CareerTransactionHighlightItem => item !== null,
        ),
    );
  }

  if (config.kind === "reunion-count") {
    const rows = await getCareerReunionHighlightRows();
    const grouped = groupCareerReunionHighlightRows(rows);

    return sortCareerReunionHighlightItems(
      [...grouped.values()].flatMap((groupRows) =>
        buildCareerReunionHighlightItems(groupRows, config.minCount),
      ),
    );
  }

  const [playerRows, goalieRows] = await Promise.all([
    getAllPlayerCareerRowsFromDb(),
    getAllGoalieCareerRowsFromDb(),
  ]);
  const grouped = groupCareerHighlightRows([
    ...mapPlayerCareerHighlightRows(playerRows),
    ...mapGoalieCareerHighlightRows(goalieRows),
  ]);

  if (config.kind === "team-count") {
    return sortCareerTeamCountHighlightItems(
      [...grouped.values()]
        .map((rows) =>
          buildCareerTeamCountHighlightItem(
            rows,
            config.playedOnly,
            config.minCount,
          ),
        )
        .filter((item): item is CareerTeamCountHighlightItem => item !== null),
    );
  }

  if (config.kind === "same-team-season-count") {
    return sortCareerSameTeamHighlightItems(
      [...grouped.values()].flatMap((rows) =>
        buildCareerSameTeamHighlightItems(
          rows,
          config.playedOnly,
          config.minCount,
        ),
      ),
    );
  }

  if (config.kind === "stanley-cups") {
    const championSeasonKeys = new Set(
      (await getPlayoffSeasons())
        .filter((entry) => entry.round === 5)
        .map((entry) => `${entry.teamId}:${entry.season}`),
    );

    return sortCareerStanleyCupHighlightItems(
      [...grouped.values()]
        .map((rows) =>
          buildCareerStanleyCupHighlightItem(
            rows,
            championSeasonKeys,
            config.minCount,
          ),
        )
        .filter((item): item is CareerStanleyCupHighlightItem => item !== null),
    );
  }

  if (config.kind === "stash-count") {
    return sortCareerStashHighlightItems(
      [...grouped.values()].flatMap((rows) =>
        buildCareerStashHighlightItems(rows, config.minCount),
      ),
    );
  }

  return sortCareerRegularGrinderHighlightItems(
    [...grouped.values()]
      .map((rows) =>
        buildCareerRegularGrinderHighlightItem(rows, config.minCount),
      )
      .filter(
        (item): item is CareerRegularGrinderHighlightItem => item !== null,
      ),
  );
};
