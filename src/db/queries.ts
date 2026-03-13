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
    sql: `SELECT p.player_id,
                 COALESCE(fe.name, p.name) AS name,
                 COALESCE(fe.position, p.position) AS position,
                 p.team_id,
                 p.season,
                 p.report_type,
                 p.games,
                 p.goals,
                 p.assists,
                 p.points,
                 p.plus_minus,
                 p.penalties,
                 p.shots,
                 p.ppp,
                 p.shp,
                 p.hits,
                 p.blocks
          FROM players p
          LEFT JOIN fantrax_entities fe ON fe.fantrax_id = p.player_id
          WHERE p.player_id = ?
          ORDER BY p.season DESC,
                   p.team_id ASC,
                   CASE p.report_type WHEN 'regular' THEN 0 ELSE 1 END ASC`,
    args: [playerId],
  });
  return castRows<PlayerCareerRow>(result.rows);
};

export const getGoalieCareerRowsFromDb = async (
  goalieId: string,
): Promise<GoalieCareerRow[]> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT g.goalie_id,
                 COALESCE(fe.name, g.name) AS name,
                 g.team_id,
                 g.season,
                 g.report_type,
                 g.games,
                 g.wins,
                 g.saves,
                 g.shutouts,
                 g.goals,
                 g.assists,
                 g.points,
                 g.penalties,
                 g.ppp,
                 g.shp,
                 g.gaa,
                 g.save_percent
          FROM goalies g
          LEFT JOIN fantrax_entities fe ON fe.fantrax_id = g.goalie_id
          WHERE g.goalie_id = ?
          ORDER BY g.season DESC,
                   g.team_id ASC,
                   CASE g.report_type WHEN 'regular' THEN 0 ELSE 1 END ASC`,
    args: [goalieId],
  });
  return castRows<GoalieCareerRow>(result.rows);
};

export const getAllPlayerCareerRowsFromDb = async (): Promise<PlayerCareerRow[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT p.player_id,
            COALESCE(fe.name, p.name) AS name,
            COALESCE(fe.position, p.position) AS position,
            p.team_id,
            p.season,
            p.report_type,
            p.games,
            p.goals,
            p.assists,
            p.points,
            p.plus_minus,
            p.penalties,
            p.shots,
            p.ppp,
            p.shp,
            p.hits,
            p.blocks
     FROM players p
     LEFT JOIN fantrax_entities fe ON fe.fantrax_id = p.player_id
     ORDER BY name ASC, p.player_id ASC, p.season DESC, p.team_id ASC,
              CASE p.report_type WHEN 'regular' THEN 0 ELSE 1 END ASC`,
  );
  return castRows<PlayerCareerRow>(result.rows);
};

export const getAllGoalieCareerRowsFromDb = async (): Promise<GoalieCareerRow[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT g.goalie_id,
            COALESCE(fe.name, g.name) AS name,
            g.team_id,
            g.season,
            g.report_type,
            g.games,
            g.wins,
            g.saves,
            g.shutouts,
            g.goals,
            g.assists,
            g.points,
            g.penalties,
            g.ppp,
            g.shp,
            g.gaa,
            g.save_percent
     FROM goalies g
     LEFT JOIN fantrax_entities fe ON fe.fantrax_id = g.goalie_id
     ORDER BY name ASC, g.goalie_id ASC, g.season DESC, g.team_id ASC,
              CASE g.report_type WHEN 'regular' THEN 0 ELSE 1 END ASC`,
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

interface TransactionLeaderboardRow {
  team_id: string;
  claims: number;
  drops: number;
  trades: number;
}

export type TransactionLeaderboardDbEntry = Omit<
  import("../types").TransactionLeaderboardEntry,
  "teamName" | "seasons" | "tieRank"
>;

interface TransactionSeasonRow {
  team_id: string;
  season: number;
  claims: number;
  drops: number;
  trades: number;
}

export type TransactionSeasonDbEntry = import("../types").TransactionLeaderboardSeason & {
  teamId: string;
};

const TRANSACTION_COUNTS_CTE = `WITH claim_drop_counts AS (
       SELECT
         team_id,
         season,
         SUM(CASE WHEN action_type = 'claim' THEN 1 ELSE 0 END) AS claims,
         SUM(CASE WHEN action_type = 'drop' THEN 1 ELSE 0 END) AS drops
       FROM claim_event_items
       GROUP BY team_id, season
     ),
     trade_participation AS (
       SELECT DISTINCT
         tsb.season AS season,
         tsb.occurred_at AS occurred_at,
         tbi.from_team_id AS team_id
       FROM trade_source_blocks tsb
       JOIN trade_block_items tbi ON tbi.trade_source_block_id = tsb.id
       UNION
       SELECT DISTINCT
         tsb.season AS season,
         tsb.occurred_at AS occurred_at,
         tbi.to_team_id AS team_id
       FROM trade_source_blocks tsb
       JOIN trade_block_items tbi ON tbi.trade_source_block_id = tsb.id
     ),
     trade_counts AS (
       SELECT
         team_id,
         season,
         COUNT(*) AS trades
       FROM trade_participation
       GROUP BY team_id, season
     ),
     all_team_seasons AS (
       SELECT team_id, season FROM claim_drop_counts
       UNION
       SELECT team_id, season FROM trade_counts
     ),
     transaction_counts AS (
       SELECT
         ats.team_id,
         ats.season,
         COALESCE(cdc.claims, 0) AS claims,
         COALESCE(cdc.drops, 0) AS drops,
         COALESCE(tc.trades, 0) AS trades
       FROM all_team_seasons ats
       LEFT JOIN claim_drop_counts cdc
         ON cdc.team_id = ats.team_id
        AND cdc.season = ats.season
       LEFT JOIN trade_counts tc
         ON tc.team_id = ats.team_id
        AND tc.season = ats.season
     )`;

const mapTransactionLeaderboardRow = (
  row: TransactionLeaderboardRow,
): TransactionLeaderboardDbEntry => ({
  teamId: row.team_id,
  claims: row.claims,
  drops: row.drops,
  trades: row.trades,
});

export const getTransactionLeaderboard = async (): Promise<
  TransactionLeaderboardDbEntry[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `${TRANSACTION_COUNTS_CTE}
     SELECT
       team_id,
       SUM(claims) AS claims,
       SUM(drops) AS drops,
       SUM(trades) AS trades
     FROM transaction_counts
     GROUP BY team_id
     ORDER BY
       SUM(claims + drops + trades) DESC,
       SUM(trades) DESC,
       SUM(claims) DESC,
       SUM(drops) DESC,
       team_id ASC`,
  );
  return castRows<TransactionLeaderboardRow>(result.rows).map(
    mapTransactionLeaderboardRow,
  );
};

export const getTransactionSeasons = async (): Promise<
  TransactionSeasonDbEntry[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `${TRANSACTION_COUNTS_CTE}
     SELECT
       team_id,
       season,
       claims,
       drops,
       trades
     FROM transaction_counts
     ORDER BY team_id ASC, season ASC`,
  );
  return castRows<TransactionSeasonRow>(result.rows).map((row) => ({
    teamId: row.team_id,
    season: row.season,
    claims: row.claims,
    drops: row.drops,
    trades: row.trades,
  }));
};
