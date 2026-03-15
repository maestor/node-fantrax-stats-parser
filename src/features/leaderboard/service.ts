import { CURRENT_SEASON, START_SEASON, TEAMS } from "../../config";
import {
  getPlayoffLeaderboard,
  getPlayoffSeasons,
  getRegularLeaderboard,
  getRegularSeasons,
  getTransactionLeaderboard,
  getTransactionSeasons,
  type PlayoffSeasonDbEntry,
  type RegularSeasonDbEntry,
  type TransactionSeasonDbEntry,
} from "../../db/queries";
import type {
  PlayoffLeaderboardEntry,
  PlayoffLeaderboardSeason,
  PlayoffRoundKey,
  RegularLeaderboardEntry,
  RegularLeaderboardSeason,
  TransactionLeaderboardEntry,
  TransactionLeaderboardSeason,
} from "./types";

type PlayoffLeaderboardRowData = Pick<
  PlayoffLeaderboardEntry,
  | "teamId"
  | "championships"
  | "finals"
  | "conferenceFinals"
  | "secondRound"
  | "firstRound"
>;

type RegularLeaderboardRowData = Pick<
  RegularLeaderboardEntry,
  | "teamId"
  | "wins"
  | "losses"
  | "ties"
  | "points"
  | "divWins"
  | "divLosses"
  | "divTies"
  | "regularTrophies"
>;

type TransactionLeaderboardRowData = Pick<
  TransactionLeaderboardEntry,
  "teamId" | "claims" | "drops" | "trades"
>;

export const getPlayoffLeaderboardData = async (): Promise<
  PlayoffLeaderboardEntry[]
> => {
  const rows: PlayoffLeaderboardRowData[] = await getPlayoffLeaderboard();
  const seasonsByTeam = await getPlayoffSeasons();
  const latestPlayoffSeason =
    seasonsByTeam.length > 0
      ? Math.max(...seasonsByTeam.map((entry) => entry.season))
      : CURRENT_SEASON;

  const missingTeams = TEAMS.filter((t) => !rows.some((r) => r.teamId === t.id));
  const allRows: PlayoffLeaderboardRowData[] = [
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
): Pick<
  RegularLeaderboardSeason,
  "winPercent" | "divWinPercent" | "pointsPercent"
> => {
  const total = row.wins + row.losses + row.ties;
  const divTotal = row.divWins + row.divLosses + row.divTies;
  const winPercent = total > 0 ? Math.round((row.wins / total) * 1000) / 1000 : 0;
  const divWinPercent =
    divTotal > 0 ? Math.round((row.divWins / divTotal) * 1000) / 1000 : 0;
  const pointsPercent =
    total > 0 ? Math.round((row.points / (total * 2)) * 1000) / 1000 : 0;
  return { winPercent, divWinPercent, pointsPercent };
};

export const getRegularLeaderboardData = async (): Promise<
  RegularLeaderboardEntry[]
> => {
  const rows: RegularLeaderboardRowData[] = await getRegularLeaderboard();
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

    const { winPercent, divWinPercent, pointsPercent } =
      computeRegularSeasonPercents(row);

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

export const getTransactionLeaderboardData = async (): Promise<
  TransactionLeaderboardEntry[]
> => {
  const rows: TransactionLeaderboardRowData[] = await getTransactionLeaderboard();
  const seasonsByTeam = await getTransactionSeasons();

  const seasonsByTeamId = new Map<string, TransactionSeasonDbEntry[]>();
  for (const seasonEntry of seasonsByTeam) {
    const list = seasonsByTeamId.get(seasonEntry.teamId);
    if (list) {
      list.push(seasonEntry);
    } else {
      seasonsByTeamId.set(seasonEntry.teamId, [seasonEntry]);
    }
  }

  const missingTeams = TEAMS.filter(
    (team) => !rows.some((row) => row.teamId === team.id),
  );
  const allRows: TransactionLeaderboardRowData[] = [
    ...rows,
    ...missingTeams.map((team) => ({
      teamId: team.id,
      claims: 0,
      drops: 0,
      trades: 0,
    })),
  ];

  const buildTransactionSeasons = (
    teamId: string,
  ): TransactionLeaderboardSeason[] =>
    (seasonsByTeamId.get(teamId) ?? []).map((row) => ({
      season: row.season,
      claims: row.claims,
      drops: row.drops,
      trades: row.trades,
    }));

  return allRows.map((row, i) => {
    const team = TEAMS.find((entry) => entry.id === row.teamId);
    const teamName = team?.presentName ?? row.teamId;
    const prev = i > 0 ? allRows[i - 1] : null;
    const tieRank =
      prev !== null &&
      prev.claims === row.claims &&
      prev.drops === row.drops &&
      prev.trades === row.trades;

    return {
      ...row,
      teamName,
      seasons: buildTransactionSeasons(row.teamId),
      tieRank,
    };
  });
};
