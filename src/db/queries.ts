import { getDbClient } from "./client.js";
import type {
  GoalieWithSeason,
  PlayerWithSeason,
} from "../features/stats/types.js";
import type {
  PlayoffLeaderboardEntry,
  RegularLeaderboardEntry,
  TransactionLeaderboardEntry,
  TransactionLeaderboardSeason,
} from "../features/leaderboard/types.js";
import type {
  FinalsCategoryDbEntry,
  FinalsMatchupDbEntry,
  FinalsTeamData,
  FinalsTeamTotals,
} from "../features/finals/types.js";
import {
  formatOptionalGoalieGaa,
  formatOptionalGoalieSavePercent,
} from "../shared/goalie-rates.js";
import type { CsvReport } from "../shared/types/core.js";
import { FINALS_STAT_KEYS } from "../features/finals/types.js";

/** Cast DB rows to a known shape. Trust the schema — no runtime validation. */
function castRows<T>(rows: unknown[]): T[] {
  return rows as T[];
}

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
  gaa: formatOptionalGoalieGaa(row.gaa, row.games),
  savePercent: formatOptionalGoalieSavePercent(row.save_percent, row.games),
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

interface CareerTransactionHighlightSqlRow {
  entity_id: string;
  name: string;
  position: string | null;
  team_id: string;
  transaction_count: number;
}

interface CareerReunionHighlightSqlRow {
  entity_id: string;
  name: string;
  position: string | null;
  team_id: string;
  reunion_date: string;
  reunion_type: "claim" | "trade";
}

export type CareerTransactionHighlightDbRow = {
  id: string;
  name: string;
  position: string | null;
  teamId: string;
  transactionCount: number;
};

export type CareerReunionHighlightDbRow = {
  id: string;
  name: string;
  position: string | null;
  teamId: string;
  date: string;
  type: "claim" | "trade";
};

const mapCareerTransactionHighlightRow = (
  row: CareerTransactionHighlightSqlRow,
): CareerTransactionHighlightDbRow => ({
  id: row.entity_id,
  name: row.name,
  position: row.position,
  teamId: row.team_id,
  transactionCount: row.transaction_count,
});

const mapCareerReunionHighlightRow = (
  row: CareerReunionHighlightSqlRow,
): CareerReunionHighlightDbRow => ({
  id: row.entity_id,
  name: row.name,
  position: row.position,
  teamId: row.team_id,
  date: row.reunion_date,
  type: row.reunion_type,
});

export const getClaimTransactionHighlightRowsFromDb = async (): Promise<
  CareerTransactionHighlightDbRow[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT
       cei.fantrax_entity_id AS entity_id,
       COALESCE(fe.name, cei.raw_name) AS name,
       COALESCE(fe.position, cei.raw_position) AS position,
       cei.team_id,
       COUNT(*) AS transaction_count
     FROM claim_event_items cei
     LEFT JOIN fantrax_entities fe ON fe.fantrax_id = cei.fantrax_entity_id
     WHERE cei.action_type = 'claim'
       AND cei.fantrax_entity_id IS NOT NULL
     GROUP BY
       cei.fantrax_entity_id,
       COALESCE(fe.name, cei.raw_name),
       COALESCE(fe.position, cei.raw_position),
       cei.team_id
     ORDER BY name ASC, entity_id ASC, cei.team_id ASC`,
  );
  return castRows<CareerTransactionHighlightSqlRow>(result.rows).map(
    mapCareerTransactionHighlightRow,
  );
};

export const getDropTransactionHighlightRowsFromDb = async (): Promise<
  CareerTransactionHighlightDbRow[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT
       cei.fantrax_entity_id AS entity_id,
       COALESCE(fe.name, cei.raw_name) AS name,
       COALESCE(fe.position, cei.raw_position) AS position,
       cei.team_id,
       COUNT(*) AS transaction_count
     FROM claim_event_items cei
     LEFT JOIN fantrax_entities fe ON fe.fantrax_id = cei.fantrax_entity_id
     WHERE cei.action_type = 'drop'
       AND cei.fantrax_entity_id IS NOT NULL
     GROUP BY
       cei.fantrax_entity_id,
       COALESCE(fe.name, cei.raw_name),
       COALESCE(fe.position, cei.raw_position),
       cei.team_id
     ORDER BY name ASC, entity_id ASC, cei.team_id ASC`,
  );
  return castRows<CareerTransactionHighlightSqlRow>(result.rows).map(
    mapCareerTransactionHighlightRow,
  );
};

export const getTradeTransactionHighlightRowsFromDb = async (): Promise<
  CareerTransactionHighlightDbRow[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT
       tbi.fantrax_entity_id AS entity_id,
       COALESCE(fe.name, tbi.raw_name) AS name,
       COALESCE(fe.position, tbi.raw_position) AS position,
       tbi.from_team_id AS team_id,
       COUNT(*) AS transaction_count
     FROM trade_block_items tbi
     LEFT JOIN fantrax_entities fe ON fe.fantrax_id = tbi.fantrax_entity_id
     WHERE tbi.asset_type = 'player'
       AND tbi.fantrax_entity_id IS NOT NULL
     GROUP BY
       tbi.fantrax_entity_id,
       COALESCE(fe.name, tbi.raw_name),
       COALESCE(fe.position, tbi.raw_position),
       tbi.from_team_id
     ORDER BY name ASC, entity_id ASC, tbi.from_team_id ASC`,
  );
  return castRows<CareerTransactionHighlightSqlRow>(result.rows).map(
    mapCareerTransactionHighlightRow,
  );
};

export const getReunionTransactionHighlightRowsFromDb = async (): Promise<
  CareerReunionHighlightDbRow[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `WITH drop_baselines AS (
       SELECT
         cei.fantrax_entity_id AS entity_id,
         cei.team_id,
         MIN(cei.occurred_at) AS first_drop_at
       FROM claim_event_items cei
       WHERE cei.action_type = 'drop'
         AND cei.fantrax_entity_id IS NOT NULL
       GROUP BY cei.fantrax_entity_id, cei.team_id
     ),
     reunion_events AS (
       SELECT
         cei.fantrax_entity_id AS entity_id,
         COALESCE(fe.name, cei.raw_name) AS name,
         COALESCE(fe.position, cei.raw_position) AS position,
         cei.team_id,
         cei.occurred_at AS reunion_date,
         'claim' AS reunion_type
       FROM claim_event_items cei
       JOIN drop_baselines db
         ON db.entity_id = cei.fantrax_entity_id
        AND db.team_id = cei.team_id
       LEFT JOIN fantrax_entities fe ON fe.fantrax_id = cei.fantrax_entity_id
       WHERE cei.action_type = 'claim'
         AND cei.fantrax_entity_id IS NOT NULL
         AND cei.occurred_at > db.first_drop_at
       UNION ALL
       SELECT
         tbi.fantrax_entity_id AS entity_id,
         COALESCE(fe.name, tbi.raw_name) AS name,
         COALESCE(fe.position, tbi.raw_position) AS position,
         tbi.to_team_id AS team_id,
         tsb.occurred_at AS reunion_date,
         'trade' AS reunion_type
       FROM trade_block_items tbi
       JOIN trade_source_blocks tsb ON tsb.id = tbi.trade_source_block_id
       JOIN drop_baselines db
         ON db.entity_id = tbi.fantrax_entity_id
        AND db.team_id = tbi.to_team_id
       LEFT JOIN fantrax_entities fe ON fe.fantrax_id = tbi.fantrax_entity_id
       WHERE tbi.asset_type = 'player'
         AND tbi.fantrax_entity_id IS NOT NULL
         AND tsb.occurred_at > db.first_drop_at
     )
     SELECT
       entity_id,
       name,
       position,
       team_id,
       reunion_date,
       reunion_type
     FROM reunion_events
     ORDER BY
       name ASC,
       entity_id ASC,
       team_id ASC,
       reunion_date ASC,
       CASE reunion_type WHEN 'claim' THEN 0 ELSE 1 END ASC`,
  );
  return castRows<CareerReunionHighlightSqlRow>(result.rows).map(
    mapCareerReunionHighlightRow,
  );
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

interface DraftPickRowBase {
  pick_number: number;
  round: number;
  drafted_team_id: string;
  owner_team_id: string;
}

interface OpeningDraftPickRow extends DraftPickRowBase {
  player_name: string;
}

export type OpeningDraftPickDbRow = {
  round: number;
  pickNumber: number;
  draftedTeamId: string;
  originalOwnerTeamId: string;
  draftedPlayer: string;
};

const mapOpeningDraftPickRow = (
  row: OpeningDraftPickRow,
): OpeningDraftPickDbRow => ({
  round: row.round,
  pickNumber: row.pick_number,
  draftedTeamId: row.drafted_team_id,
  originalOwnerTeamId: row.owner_team_id,
  draftedPlayer: row.player_name,
});

export const getOpeningDraftPicksFromDb = async (): Promise<
  OpeningDraftPickDbRow[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT pick_number, round, drafted_team_id, owner_team_id, player_name
     FROM opening_draft_picks
     ORDER BY pick_number ASC`,
  );
  return castRows<OpeningDraftPickRow>(result.rows).map(mapOpeningDraftPickRow);
};

interface EntryDraftPickRow extends DraftPickRowBase {
  season: number;
  player_name: string | null;
  played_in_league: number;
  played_for_drafted_team: number;
}

export type EntryDraftPickDbRow = Omit<OpeningDraftPickDbRow, "draftedPlayer"> & {
  season: number;
  draftedPlayer: string | null;
  playedInLeague: boolean;
  playedForDraftingTeam: boolean;
};

const mapEntryDraftPickRow = (row: EntryDraftPickRow): EntryDraftPickDbRow => ({
  season: row.season,
  round: row.round,
  pickNumber: row.pick_number,
  draftedTeamId: row.drafted_team_id,
  originalOwnerTeamId: row.owner_team_id,
  draftedPlayer: row.player_name,
  playedInLeague: Boolean(row.played_in_league),
  playedForDraftingTeam: Boolean(row.played_for_drafted_team),
});

export const getEntryDraftPicksFromDb = async (): Promise<EntryDraftPickDbRow[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `WITH played_entities AS (
       SELECT DISTINCT player_id AS fantrax_entity_id
       FROM players
       WHERE games > 0
       UNION
       SELECT DISTINCT goalie_id AS fantrax_entity_id
       FROM goalies
       WHERE games > 0
     ),
     played_entities_by_team AS (
       SELECT DISTINCT player_id AS fantrax_entity_id, team_id
       FROM players
       WHERE games > 0
       UNION
       SELECT DISTINCT goalie_id AS fantrax_entity_id, team_id
       FROM goalies
       WHERE games > 0
     )
     SELECT
       edp.season,
       edp.pick_number,
       edp.round,
       edp.drafted_team_id,
       edp.owner_team_id,
       edp.player_name,
       CASE
         WHEN pe.fantrax_entity_id IS NULL THEN 0
         ELSE 1
       END AS played_in_league,
       CASE
         WHEN pet.fantrax_entity_id IS NULL THEN 0
         ELSE 1
       END AS played_for_drafted_team
     FROM entry_draft_picks edp
     LEFT JOIN played_entities pe
       ON pe.fantrax_entity_id = edp.fantrax_entity_id
     LEFT JOIN played_entities_by_team pet
       ON pet.fantrax_entity_id = edp.fantrax_entity_id
      AND pet.team_id = edp.drafted_team_id
     ORDER BY edp.season DESC, edp.pick_number ASC`,
  );
  return castRows<EntryDraftPickRow>(result.rows).map(mapEntryDraftPickRow);
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
  PlayoffLeaderboardEntry,
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
  RegularLeaderboardEntry,
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
  players: number;
  goalies: number;
}

export type TransactionLeaderboardDbEntry = Omit<
  TransactionLeaderboardEntry,
  "teamName" | "seasons" | "tieRank"
>;

interface TransactionSeasonRow {
  team_id: string;
  season: number;
  claims: number;
  drops: number;
  trades: number;
  players: number;
  goalies: number;
}

export type TransactionSeasonDbEntry = TransactionLeaderboardSeason & {
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
     player_counts AS (
       SELECT
         team_id,
         season,
         COUNT(DISTINCT player_id) AS players
       FROM players
       WHERE NULLIF(TRIM(player_id), '') IS NOT NULL
       GROUP BY team_id, season
     ),
     goalie_counts AS (
       SELECT
         team_id,
         season,
         COUNT(DISTINCT goalie_id) AS goalies
       FROM goalies
       WHERE NULLIF(TRIM(goalie_id), '') IS NOT NULL
       GROUP BY team_id, season
     ),
     player_totals AS (
       SELECT
         team_id,
         COUNT(DISTINCT player_id) AS players
       FROM players
       WHERE NULLIF(TRIM(player_id), '') IS NOT NULL
       GROUP BY team_id
     ),
     goalie_totals AS (
       SELECT
         team_id,
         COUNT(DISTINCT goalie_id) AS goalies
       FROM goalies
       WHERE NULLIF(TRIM(goalie_id), '') IS NOT NULL
       GROUP BY team_id
     ),
     all_teams AS (
       SELECT team_id FROM claim_drop_counts
       UNION
       SELECT team_id FROM trade_counts
       UNION
       SELECT team_id FROM player_totals
       UNION
       SELECT team_id FROM goalie_totals
     ),
     all_team_seasons AS (
       SELECT team_id, season FROM claim_drop_counts
       UNION
       SELECT team_id, season FROM trade_counts
       UNION
       SELECT team_id, season FROM player_counts
       UNION
       SELECT team_id, season FROM goalie_counts
     ),
     transaction_counts AS (
       SELECT
         ats.team_id,
         ats.season,
         COALESCE(cdc.claims, 0) AS claims,
         COALESCE(cdc.drops, 0) AS drops,
         COALESCE(tc.trades, 0) AS trades,
         COALESCE(pc.players, 0) AS players,
         COALESCE(gc.goalies, 0) AS goalies
       FROM all_team_seasons ats
       LEFT JOIN claim_drop_counts cdc
         ON cdc.team_id = ats.team_id
        AND cdc.season = ats.season
       LEFT JOIN trade_counts tc
         ON tc.team_id = ats.team_id
        AND tc.season = ats.season
       LEFT JOIN player_counts pc
         ON pc.team_id = ats.team_id
        AND pc.season = ats.season
       LEFT JOIN goalie_counts gc
         ON gc.team_id = ats.team_id
        AND gc.season = ats.season
     )`;

const mapTransactionLeaderboardRow = (
  row: TransactionLeaderboardRow,
): TransactionLeaderboardDbEntry => ({
  teamId: row.team_id,
  claims: row.claims,
  drops: row.drops,
  trades: row.trades,
  players: row.players,
  goalies: row.goalies,
});

export const getTransactionLeaderboard = async (): Promise<
  TransactionLeaderboardDbEntry[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `${TRANSACTION_COUNTS_CTE}
     SELECT
       at.team_id,
       COALESCE(SUM(tc.claims), 0) AS claims,
       COALESCE(SUM(tc.drops), 0) AS drops,
       COALESCE(SUM(tc.trades), 0) AS trades,
       COALESCE(pt.players, 0) AS players,
       COALESCE(gt.goalies, 0) AS goalies
     FROM all_teams at
     LEFT JOIN transaction_counts tc ON tc.team_id = at.team_id
     LEFT JOIN player_totals pt ON pt.team_id = at.team_id
     LEFT JOIN goalie_totals gt ON gt.team_id = at.team_id
     GROUP BY at.team_id, pt.players, gt.goalies
     ORDER BY
       COALESCE(SUM(tc.claims + tc.drops + tc.trades), 0) DESC,
       COALESCE(SUM(tc.trades), 0) DESC,
       COALESCE(SUM(tc.claims), 0) DESC,
       COALESCE(SUM(tc.drops), 0) DESC,
       at.team_id ASC`,
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
       trades,
       players,
       goalies
     FROM transaction_counts
     ORDER BY team_id ASC, season ASC`,
  );
  return castRows<TransactionSeasonRow>(result.rows).map((row) => ({
    teamId: row.team_id,
    season: row.season,
    claims: row.claims,
    drops: row.drops,
    trades: row.trades,
    players: row.players,
    goalies: row.goalies,
  }));
};

type FinalsMatchupRow = {
  season: number;
  home_tiebreak_won: number;
  winner_team_id: string;
  away_team_id: string;
  away_is_winner: number;
  away_categories_won: number;
  away_categories_lost: number;
  away_categories_tied: number;
  away_match_points: number;
  away_played_games_total: number;
  away_played_games_skaters: number;
  away_played_games_goalies: number;
  away_goals: number;
  away_assists: number;
  away_points: number;
  away_plus_minus: number;
  away_penalties: number;
  away_shots: number;
  away_ppp: number;
  away_shp: number;
  away_hits: number;
  away_blocks: number;
  away_wins: number;
  away_saves: number;
  away_shutouts: number;
  away_gaa: number | null;
  away_save_percent: number | null;
  home_team_id: string;
  home_is_winner: number;
  home_categories_won: number;
  home_categories_lost: number;
  home_categories_tied: number;
  home_match_points: number;
  home_played_games_total: number;
  home_played_games_skaters: number;
  home_played_games_goalies: number;
  home_goals: number;
  home_assists: number;
  home_points: number;
  home_plus_minus: number;
  home_penalties: number;
  home_shots: number;
  home_ppp: number;
  home_shp: number;
  home_hits: number;
  home_blocks: number;
  home_wins: number;
  home_saves: number;
  home_shutouts: number;
  home_gaa: number | null;
  home_save_percent: number | null;
};

const mapFinalsTeamTotals = (
  row: FinalsMatchupRow,
  side: "away" | "home",
): FinalsTeamTotals =>
  side === "away"
    ? {
        goals: row.away_goals,
        assists: row.away_assists,
        points: row.away_points,
        plusMinus: row.away_plus_minus,
        penalties: row.away_penalties,
        shots: row.away_shots,
        ppp: row.away_ppp,
        shp: row.away_shp,
        hits: row.away_hits,
        blocks: row.away_blocks,
        wins: row.away_wins,
        gaa: row.away_gaa,
        saves: row.away_saves,
        savePercent: row.away_save_percent,
        shutouts: row.away_shutouts,
      }
    : {
        goals: row.home_goals,
        assists: row.home_assists,
        points: row.home_points,
        plusMinus: row.home_plus_minus,
        penalties: row.home_penalties,
        shots: row.home_shots,
        ppp: row.home_ppp,
        shp: row.home_shp,
        hits: row.home_hits,
        blocks: row.home_blocks,
        wins: row.home_wins,
        gaa: row.home_gaa,
        saves: row.home_saves,
        savePercent: row.home_save_percent,
        shutouts: row.home_shutouts,
      };

const mapFinalsTeam = (
  row: FinalsMatchupRow,
  side: "away" | "home",
): FinalsTeamData =>
  side === "away"
    ? {
        teamId: row.away_team_id,
        isWinner: row.away_is_winner === 1,
        score: {
          matchPoints: row.away_match_points,
          categoriesWon: row.away_categories_won,
          categoriesLost: row.away_categories_lost,
          categoriesTied: row.away_categories_tied,
        },
        playedGames: {
          total: row.away_played_games_total,
          skaters: row.away_played_games_skaters,
          goalies: row.away_played_games_goalies,
        },
        totals: mapFinalsTeamTotals(row, side),
      }
    : {
        teamId: row.home_team_id,
        isWinner: row.home_is_winner === 1,
        score: {
          matchPoints: row.home_match_points,
          categoriesWon: row.home_categories_won,
          categoriesLost: row.home_categories_lost,
          categoriesTied: row.home_categories_tied,
        },
        playedGames: {
          total: row.home_played_games_total,
          skaters: row.home_played_games_skaters,
          goalies: row.home_played_games_goalies,
        },
        totals: mapFinalsTeamTotals(row, side),
      };

const mapFinalsMatchupRow = (row: FinalsMatchupRow): FinalsMatchupDbEntry => ({
  season: row.season,
  wonOnHomeTiebreak: row.home_tiebreak_won === 1,
  winnerTeamId: row.winner_team_id,
  awayTeam: mapFinalsTeam(row, "away"),
  homeTeam: mapFinalsTeam(row, "home"),
});

type FinalsCategoryRow = {
  season: number;
  stat_key: FinalsCategoryDbEntry["statKey"];
  away_value: number | null;
  home_value: number | null;
  winner_team_id: string | null;
};

const FINALS_STAT_ORDER_SQL = `CASE stat_key
${FINALS_STAT_KEYS.map((statKey, index) => `  WHEN '${statKey}' THEN ${index}`).join("\n")}
  ELSE ${FINALS_STAT_KEYS.length}
END`;

export const getFinalsMatchups = async (): Promise<FinalsMatchupDbEntry[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT
       fm.season,
       fm.home_tiebreak_won,
       fm.winner_team_id,
       away.team_id AS away_team_id,
       away.is_winner AS away_is_winner,
       away.categories_won AS away_categories_won,
       away.categories_lost AS away_categories_lost,
       away.categories_tied AS away_categories_tied,
       away.match_points AS away_match_points,
       away.played_games_total AS away_played_games_total,
       away.played_games_skaters AS away_played_games_skaters,
       away.played_games_goalies AS away_played_games_goalies,
       away.goals AS away_goals,
       away.assists AS away_assists,
       away.points AS away_points,
       away.plus_minus AS away_plus_minus,
       away.penalties AS away_penalties,
       away.shots AS away_shots,
       away.ppp AS away_ppp,
       away.shp AS away_shp,
       away.hits AS away_hits,
       away.blocks AS away_blocks,
       away.wins AS away_wins,
       away.saves AS away_saves,
       away.shutouts AS away_shutouts,
       away.gaa AS away_gaa,
       away.save_percent AS away_save_percent,
       home.team_id AS home_team_id,
       home.is_winner AS home_is_winner,
       home.categories_won AS home_categories_won,
       home.categories_lost AS home_categories_lost,
       home.categories_tied AS home_categories_tied,
       home.match_points AS home_match_points,
       home.played_games_total AS home_played_games_total,
       home.played_games_skaters AS home_played_games_skaters,
       home.played_games_goalies AS home_played_games_goalies,
       home.goals AS home_goals,
       home.assists AS home_assists,
       home.points AS home_points,
       home.plus_minus AS home_plus_minus,
       home.penalties AS home_penalties,
       home.shots AS home_shots,
       home.ppp AS home_ppp,
       home.shp AS home_shp,
       home.hits AS home_hits,
       home.blocks AS home_blocks,
       home.wins AS home_wins,
       home.saves AS home_saves,
       home.shutouts AS home_shutouts,
       home.gaa AS home_gaa,
       home.save_percent AS home_save_percent
     FROM finals_matchups fm
     JOIN finals_matchup_teams away
       ON away.season = fm.season
      AND away.side = 'away'
     JOIN finals_matchup_teams home
       ON home.season = fm.season
      AND home.side = 'home'
     ORDER BY fm.season DESC`,
  );

  return castRows<FinalsMatchupRow>(result.rows).map(mapFinalsMatchupRow);
};

export const getFinalsCategories = async (): Promise<FinalsCategoryDbEntry[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT
       season,
       stat_key,
       away_value,
       home_value,
       winner_team_id
     FROM finals_matchup_categories
     ORDER BY season DESC, ${FINALS_STAT_ORDER_SQL}`,
  );

  return castRows<FinalsCategoryRow>(result.rows).map((row) => ({
    season: row.season,
    statKey: row.stat_key,
    awayValue: row.away_value,
    homeValue: row.home_value,
    winnerTeamId: row.winner_team_id,
  }));
};
