import { getDbClient } from "./client";
import type { PlayerWithSeason, GoalieWithSeason, CsvReport } from "../types";

/** Cast DB rows to a known shape. Trust the schema — no runtime validation. */
function castRows<T>(rows: unknown[]): T[] {
  return rows as T[];
}

const mapOptionalGoalieRate = (value: number | null): string | undefined =>
  value != null && value !== 0 ? String(value) : undefined;

interface PlayerRow {
  player_id: string;
  name: string;
  position: string | null;
  games: number;
  goals: number;
  assists: number;
  points: number;
  plus_minus: number;
  penalties: number;
  shots: number;
  ppp: number;
  shp: number;
  hits: number;
  blocks: number;
  season: number;
}

export interface PlayerCareerRow {
  player_id: string;
  name: string;
  position: string | null;
  team_id: string;
  season: number;
  report_type: CsvReport;
  games: number;
  goals: number;
  assists: number;
  points: number;
  plus_minus: number;
  penalties: number;
  shots: number;
  ppp: number;
  shp: number;
  hits: number;
  blocks: number;
}

interface GoalieRow {
  goalie_id: string;
  name: string;
  games: number;
  wins: number;
  saves: number;
  shutouts: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ppp: number;
  shp: number;
  gaa: number | null;
  save_percent: number | null;
  season: number;
}

export interface GoalieCareerRow {
  goalie_id: string;
  name: string;
  team_id: string;
  season: number;
  report_type: CsvReport;
  games: number;
  wins: number;
  saves: number;
  shutouts: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ppp: number;
  shp: number;
  gaa: number | null;
  save_percent: number | null;
}

const mapPlayerRow = (row: PlayerRow): PlayerWithSeason => ({
  id: row.player_id,
  name: row.name,
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
  score: 0,
  scoreAdjustedByGames: 0,
  season: row.season,
});

const mapGoalieRow = (row: GoalieRow): GoalieWithSeason => ({
  id: row.goalie_id,
  name: row.name,
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
  score: 0,
  scoreAdjustedByGames: 0,
  season: row.season,
});

export const getPlayersFromDb = async (
  teamId: string,
  season: number,
  reportType: CsvReport
): Promise<PlayerWithSeason[]> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT player_id, name, position, games, goals, assists, points, plus_minus,
                 penalties, shots, ppp, shp, hits, blocks, season
          FROM players
          WHERE team_id = ? AND season = ? AND report_type = ? AND games > 0`,
    args: [teamId, season, reportType],
  });
  return castRows<PlayerRow>(result.rows).map(mapPlayerRow);
};

export const getGoaliesFromDb = async (
  teamId: string,
  season: number,
  reportType: CsvReport
): Promise<GoalieWithSeason[]> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT goalie_id, name, games, wins, saves, shutouts, goals, assists, points,
                 penalties, ppp, shp, gaa, save_percent, season
          FROM goalies
          WHERE team_id = ? AND season = ? AND report_type = ? AND games > 0`,
    args: [teamId, season, reportType],
  });
  return castRows<GoalieRow>(result.rows).map(mapGoalieRow);
};

export const getPlayerCareerRowsFromDb = async (
  playerId: string,
): Promise<PlayerCareerRow[]> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT player_id, name, position, team_id, season, report_type, games, goals, assists, points,
                 plus_minus, penalties, shots, ppp, shp, hits, blocks
          FROM players
          WHERE player_id = ?
          ORDER BY season DESC,
                   team_id ASC,
                   CASE report_type WHEN 'regular' THEN 0 ELSE 1 END ASC`,
    args: [playerId],
  });
  return castRows<PlayerCareerRow>(result.rows);
};

export const getGoalieCareerRowsFromDb = async (
  goalieId: string,
): Promise<GoalieCareerRow[]> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT goalie_id, name, team_id, season, report_type, games, wins, saves, shutouts,
                 goals, assists, points, penalties, ppp, shp, gaa, save_percent
          FROM goalies
          WHERE goalie_id = ?
          ORDER BY season DESC,
                   team_id ASC,
                   CASE report_type WHEN 'regular' THEN 0 ELSE 1 END ASC`,
    args: [goalieId],
  });
  return castRows<GoalieCareerRow>(result.rows);
};

export const getAllPlayerCareerRowsFromDb = async (): Promise<PlayerCareerRow[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT player_id, name, position, team_id, season, report_type, games, goals, assists, points,
            plus_minus, penalties, shots, ppp, shp, hits, blocks
     FROM players
     ORDER BY name ASC, player_id ASC, season DESC, team_id ASC,
              CASE report_type WHEN 'regular' THEN 0 ELSE 1 END ASC`,
  );
  return castRows<PlayerCareerRow>(result.rows);
};

export const getAllGoalieCareerRowsFromDb = async (): Promise<GoalieCareerRow[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT goalie_id, name, team_id, season, report_type, games, wins, saves, shutouts,
            goals, assists, points, penalties, ppp, shp, gaa, save_percent
     FROM goalies
     ORDER BY name ASC, goalie_id ASC, season DESC, team_id ASC,
              CASE report_type WHEN 'regular' THEN 0 ELSE 1 END ASC`,
  );
  return castRows<GoalieCareerRow>(result.rows);
};

export const getAvailableSeasonsFromDb = async (
  teamId: string,
  reportType: CsvReport
): Promise<number[]> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT DISTINCT season FROM players
          WHERE team_id = ? AND report_type = ? AND games > 0
          ORDER BY season`,
    args: [teamId, reportType],
  });
  return castRows<{ season: number }>(result.rows).map((r) => r.season);
};

export const getLastModifiedFromDb = async (): Promise<string | null> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT value FROM import_metadata WHERE key = ?`,
    args: ["last_modified"],
  });
  if (!result.rows.length) return null;
  return castRows<{ value: string }>(result.rows)[0].value;
};

interface PlayoffLeaderboardRow {
  team_id: string;
  championships: number;
  finals: number;
  conference_finals: number;
  second_round: number;
  first_round: number;
}

type PlayoffLeaderboardDbEntry = Omit<
  import("../types").PlayoffLeaderboardEntry,
  "teamName" | "appearances" | "tieRank" | "seasons"
>;

const mapLeaderboardRow = (row: PlayoffLeaderboardRow): PlayoffLeaderboardDbEntry => ({
  teamId: row.team_id,
  championships: row.championships,
  finals: row.finals,
  conferenceFinals: row.conference_finals,
  secondRound: row.second_round,
  firstRound: row.first_round,
});

export const getPlayoffLeaderboard = async (): Promise<
  PlayoffLeaderboardDbEntry[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT
       team_id,
       SUM(CASE WHEN round = 5 THEN 1 ELSE 0 END) AS championships,
       SUM(CASE WHEN round = 4 THEN 1 ELSE 0 END) AS finals,
       SUM(CASE WHEN round = 3 THEN 1 ELSE 0 END) AS conference_finals,
       SUM(CASE WHEN round = 2 THEN 1 ELSE 0 END) AS second_round,
       SUM(CASE WHEN round = 1 THEN 1 ELSE 0 END) AS first_round
     FROM playoff_results
     GROUP BY team_id
     ORDER BY
       championships DESC,
       finals DESC,
       conference_finals DESC,
       second_round DESC,
       first_round DESC`,
  );
  return castRows<PlayoffLeaderboardRow>(result.rows).map(mapLeaderboardRow);
};

interface PlayoffSeasonRow {
  team_id: string;
  season: number;
  round: number;
}

export type PlayoffSeasonDbEntry = {
  teamId: string;
  season: number;
  round: number;
};

export const getPlayoffSeasons = async (): Promise<PlayoffSeasonDbEntry[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT team_id, season, round
     FROM playoff_results
     ORDER BY team_id, season`,
  );
  return castRows<PlayoffSeasonRow>(result.rows).map((row) => ({
    teamId: row.team_id,
    season: row.season,
    round: row.round,
  }));
};

interface RegularLeaderboardRow {
  team_id: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  div_wins: number;
  div_losses: number;
  div_ties: number;
  regular_trophies: number;
}

type RegularLeaderboardDbEntry = Omit<
  import("../types").RegularLeaderboardEntry,
  | "teamName"
  | "tieRank"
  | "winPercent"
  | "divWinPercent"
  | "pointsPercent"
  | "seasons"
>;

const mapRegularLeaderboardRow = (row: RegularLeaderboardRow): RegularLeaderboardDbEntry => ({
  teamId: row.team_id,
  wins: row.wins,
  losses: row.losses,
  ties: row.ties,
  points: row.points,
  divWins: row.div_wins,
  divLosses: row.div_losses,
  divTies: row.div_ties,
  regularTrophies: row.regular_trophies,
});

export const getRegularLeaderboard = async (): Promise<
  RegularLeaderboardDbEntry[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT
       team_id,
       SUM(wins) AS wins,
       SUM(losses) AS losses,
       SUM(ties) AS ties,
       SUM(points) AS points,
       SUM(div_wins) AS div_wins,
       SUM(div_losses) AS div_losses,
       SUM(div_ties) AS div_ties,
       SUM(is_regular_champion) AS regular_trophies
     FROM regular_results
     GROUP BY team_id
     ORDER BY
       SUM(points) DESC,
       SUM(wins) DESC`,
  );
  return castRows<RegularLeaderboardRow>(result.rows).map(mapRegularLeaderboardRow);
};

interface RegularSeasonRow {
  team_id: string;
  season: number;
  is_regular_champion: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  div_wins: number;
  div_losses: number;
  div_ties: number;
}

export type RegularSeasonDbEntry = {
  teamId: string;
  season: number;
  regularTrophy: boolean;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  divWins: number;
  divLosses: number;
  divTies: number;
};

export const getRegularSeasons = async (): Promise<RegularSeasonDbEntry[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT
       team_id,
       season,
       is_regular_champion,
       wins,
       losses,
       ties,
       points,
       div_wins,
       div_losses,
       div_ties
     FROM regular_results
     ORDER BY team_id, season`,
  );
  return castRows<RegularSeasonRow>(result.rows).map((row) => ({
    teamId: row.team_id,
    season: row.season,
    regularTrophy: row.is_regular_champion === 1,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    points: row.points,
    divWins: row.div_wins,
    divLosses: row.div_losses,
    divTies: row.div_ties,
  }));
};
