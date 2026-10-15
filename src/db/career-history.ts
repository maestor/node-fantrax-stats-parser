import { careerProfileTypeSql } from "./career-identity.js";
import type { Row } from "@libsql/client";
import { getDbClient } from "./client.js";

export type TradeGroupKey = [
  season: number,
  sourceFile: string,
  date: string,
  signature: string,
];
export type TradeHistoryRow = {
  season: number;
  source_file: string;
  occurred_at: string;
  participant_signature: string;
  source_block_index: number;
  source_period: number;
  sequence: number;
  from_team_id: string;
  to_team_id: string;
  asset_type: "player" | "draft_pick" | "other";
  fantrax_entity_id: string | null;
  name: string;
  raw_name: string;
  position: string | null;
  career_type: "player" | "goalie" | null;
  draft_season: number | null;
  draft_round: number | null;
  draft_original_team_id: string | null;
};
type DraftHistoryRow = {
  draft_type: "entry" | "opening";
  season: number | null;
  round: number;
  pick_number: number;
  drafted_team_id: string;
  owner_team_id: string;
};
type ClaimHistoryRow = {
  source_file: string;
  source_group_index: number;
  sequence: number;
  season: number;
  occurred_at: string;
  team_id: string;
  action_type: "claim" | "drop";
};
type ExpansionHistoryRow = {
  season: number;
  expansion_team_id: string;
  source_team_id: string;
};
type CoverageRow = {
  source: "entry" | "opening" | "expansion" | "claim" | "trade";
  season: number | null;
};

// SQL projection is the trust boundary for database response types.
const castRows = <T>(rows: Row[]): T[] => rows as unknown as T[];

export const getTradeHistoryRowsFromDb = async (
  filter: { entityId: string } | { key: TradeGroupKey },
): Promise<TradeHistoryRow[]> => {
  const forIdentity = "entityId" in filter;
  const groupQuery = forIdentity
    ? `SELECT DISTINCT b.season, b.source_file, b.occurred_at, b.participant_signature
       FROM trade_source_blocks b
       JOIN trade_block_items i ON i.trade_source_block_id = b.id
       WHERE i.fantrax_entity_id = ?`
    : `SELECT DISTINCT season, source_file, occurred_at, participant_signature
       FROM trade_source_blocks
       WHERE season = ? AND source_file = ? AND occurred_at = ? AND participant_signature = ?`;
  const result = await getDbClient().execute({
    sql: `WITH relevant_groups AS (${groupQuery})
      SELECT b.season, b.source_file, b.occurred_at, b.participant_signature,
        b.source_block_index, b.source_period, i.sequence, i.from_team_id, i.to_team_id,
        i.asset_type, i.fantrax_entity_id, COALESCE(fe.name, i.raw_name) AS name,
        i.raw_name, COALESCE(fe.position, i.raw_position) AS position,
        ${careerProfileTypeSql("i.fantrax_entity_id")} AS career_type,
        i.draft_season, i.draft_round, i.draft_original_team_id
      FROM trade_source_blocks b
      JOIN relevant_groups r
        ON r.season = b.season AND r.source_file = b.source_file
        AND r.occurred_at = b.occurred_at AND r.participant_signature = b.participant_signature
      JOIN trade_block_items i ON i.trade_source_block_id = b.id
      LEFT JOIN fantrax_entities fe ON fe.fantrax_id = i.fantrax_entity_id
      ORDER BY b.season DESC, b.occurred_at DESC, b.source_file, b.source_block_index, i.sequence`,
    args: forIdentity ? [filter.entityId] : filter.key,
  });
  return castRows<TradeHistoryRow>(result.rows);
};

export const getCareerHistoryRowsFromDb = async (id: string) => {
  const db = getDbClient();
  const [identity, drafts, claims, coverage, trades, expansions] = await Promise.all([
    db.execute({
      sql: `SELECT 1 FROM players WHERE player_id = ?
            UNION ALL SELECT 1 FROM goalies WHERE goalie_id = ?
            UNION ALL SELECT 1 FROM fantrax_entities WHERE fantrax_id = ? LIMIT 1`,
      args: [id, id, id],
    }),
    db.execute({
      sql: `SELECT 'entry' AS draft_type, season, round, pick_number, drafted_team_id, owner_team_id
            FROM entry_draft_picks WHERE fantrax_entity_id = ?
            UNION ALL
            SELECT 'opening', NULL, round, pick_number, drafted_team_id, owner_team_id
            FROM opening_draft_picks WHERE fantrax_entity_id = ?`,
      args: [id, id],
    }),
    db.execute({
      sql: `SELECT e.source_file, e.source_group_index, i.sequence, i.season, i.occurred_at,
              i.team_id, i.action_type
            FROM claim_event_items i JOIN claim_events e ON e.id = i.claim_event_id
            WHERE i.fantrax_entity_id = ?`,
      args: [id],
    }),
    db.execute(`SELECT 'entry' AS source, season FROM entry_draft_picks GROUP BY season
      UNION ALL SELECT 'opening', NULL WHERE EXISTS (SELECT 1 FROM opening_draft_picks)
      UNION ALL SELECT 'expansion', season FROM expansion_draft_picks GROUP BY season
      UNION ALL SELECT 'claim', season FROM claim_events GROUP BY season
      UNION ALL SELECT 'trade', season FROM trade_source_blocks GROUP BY season`),
    getTradeHistoryRowsFromDb({ entityId: id }),
    db.execute({
      sql: `SELECT season, expansion_team_id, source_team_id FROM expansion_draft_picks
        WHERE fantrax_entity_id = ?`,
      args: [id],
    }),
  ]);
  return {
    exists: identity.rows.length > 0,
    drafts: castRows<DraftHistoryRow>(drafts.rows),
    expansions: castRows<ExpansionHistoryRow>(expansions.rows),
    claims: castRows<ClaimHistoryRow>(claims.rows),
    coverage: castRows<CoverageRow>(coverage.rows),
    trades,
  };
};
