import { TEAMS } from "../../config/index.js";
import {
  getCareerHistoryRowsFromDb,
  getTradeHistoryRowsFromDb,
  type TradeGroupKey,
  type TradeHistoryRow,
} from "../../db/career-history.js";
import type {
  CareerHistory,
  CareerHistoryEvent,
  HistoryTeam,
  TradeDetail,
} from "./types.js";

const team = (id: string): HistoryTeam => ({
  id,
  name: TEAMS.find((candidate) => candidate.id === id)?.presentName ?? id,
});
const notFound = (body: string): Error =>
  Object.assign(new Error(body), { statusCode: 404, body });
const encodeId = (key: readonly (string | number)[]): string =>
  Buffer.from(JSON.stringify(key)).toString("base64url");
const groupKey = (row: TradeHistoryRow): TradeGroupKey => [
  row.season,
  row.source_file,
  row.occurred_at,
  row.participant_signature,
];
const historyDateKey = (event: CareerHistoryEvent): string => event.date ?? "";

const decodeTradeId = (id: string): TradeGroupKey => {
  let key: unknown;
  try {
    key = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
  } catch {
    throw notFound("Trade not found");
  }
  if (
    !Array.isArray(key) ||
    key.length !== 4 ||
    !Number.isSafeInteger(key[0]) ||
    !key
      .slice(1)
      .every(
        (value: unknown) => typeof value === "string" && value.length > 0,
      ) ||
    encodeId(key) !== id
  ) {
    throw notFound("Trade not found");
  }
  return key as TradeGroupKey;
};

const buildTrade = (rows: TradeHistoryRow[]): TradeDetail => {
  const first = rows[0];
  const blocks = new Map<number, TradeDetail["blocks"][number]>();
  for (const row of rows) {
    let block = blocks.get(row.source_block_index);
    if (!block) {
      block = {
        sourceBlockIndex: row.source_block_index,
        sourcePeriod: row.source_period,
        assets: [],
      };
      blocks.set(row.source_block_index, block);
    }
    block.assets.push({
      type: row.asset_type,
      name: row.name,
      rawName: row.raw_name,
      entityId: row.fantrax_entity_id,
      careerType: row.career_type,
      position: row.position,
      fromTeam: team(row.from_team_id),
      toTeam: team(row.to_team_id),
      draftSeason: row.draft_season,
      draftRound: row.draft_round,
      draftOriginalOwner:
        row.draft_original_team_id === null
          ? null
          : team(row.draft_original_team_id),
    });
  }
  const allBlocks = [...blocks.values()];
  const directions = new Set(
    rows.map((row) => `${row.from_team_id}|${row.to_team_id}`),
  );
  const participants = first.participant_signature.split("|");
  const opposing =
    participants.length === 2 &&
    participants[0] !== participants[1] &&
    directions.size === 2 &&
    directions.has(`${participants[0]}|${participants[1]}`) &&
    directions.has(`${participants[1]}|${participants[0]}`);
  const status = !opposing
    ? "incomplete"
    : allBlocks.length === 2 &&
        allBlocks[0].sourcePeriod === allBlocks[1].sourcePeriod
      ? "reconstructed"
      : "ambiguous";
  return {
    id: encodeId(groupKey(first)),
    season: first.season,
    date: first.occurred_at,
    status,
    blocks: allBlocks,
  };
};

export const getTradeDetailData = async (id: string): Promise<TradeDetail> => {
  const rows = await getTradeHistoryRowsFromDb({ key: decodeTradeId(id) });
  if (!rows.length) throw notFound("Trade not found");
  return buildTrade(rows);
};

export const getCareerHistoryData = async (
  id: string,
): Promise<CareerHistory> => {
  const rows = await getCareerHistoryRowsFromDb(id);
  if (!rows.exists) throw notFound("Career not found");
  const events: CareerHistoryEvent[] = rows.drafts.map((row) => ({
    id: `draft-${row.draft_type}-${row.season ?? "opening"}-${row.pick_number}`,
    type: "draft",
    draftType: row.draft_type,
    date: null,
    season: row.season,
    round: row.round,
    pickNumber: row.pick_number,
    team: team(row.drafted_team_id),
    originalOwner: team(row.owner_team_id),
  }));
  for (const row of rows.expansions) {
    events.push({
      id: `expansion-${row.season}-${row.expansion_team_id}-${row.source_team_id}`,
      type: "expansion",
      season: row.season,
      date: null,
      fromTeam: team(row.source_team_id),
      team: team(row.expansion_team_id),
    });
  }
  for (const row of rows.claims) {
    events.push({
      id: `claim-${encodeId([row.source_file, row.source_group_index, row.sequence])}`,
      type: row.action_type,
      date: row.occurred_at,
      season: row.season,
      team: team(row.team_id),
    });
  }
  const groups = new Map<string, TradeHistoryRow[]>();
  for (const row of rows.trades) {
    const key = encodeId(groupKey(row));
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }
  for (const group of groups.values()) {
    const trade = buildTrade(group);
    const movements = new Map<
      string,
      { fromTeam: HistoryTeam; toTeam: HistoryTeam }
    >();
    for (const row of group.filter((item) => item.fantrax_entity_id === id)) {
      movements.set(`${row.from_team_id}|${row.to_team_id}`, {
        fromTeam: team(row.from_team_id),
        toTeam: team(row.to_team_id),
      });
    }
    events.push({
      id: `trade-${trade.id}`,
      type: "trade",
      season: trade.season,
      date: trade.date,
      tradeId: trade.id,
      status: trade.status,
      movements: [...movements.values()],
    });
  }
  events.sort(
    (left, right) =>
      (right.season ?? -1) - (left.season ?? -1) ||
      historyDateKey(right).localeCompare(historyDateKey(left)) ||
      Number(left.type === "expansion") - Number(right.type === "expansion") ||
      left.id.localeCompare(right.id),
  );
  const seasonsFor = (
    source: "entry" | "expansion" | "claim" | "trade",
  ): number[] =>
    rows.coverage
      .filter((row) => row.source === source)
      .map((row) => row.season as number)
      .sort((a, b) => a - b);
  return {
    id,
    coverage: {
      entryDraftSeasons: seasonsFor("entry"),
      expansionDraftSeasons: seasonsFor("expansion"),
      openingDraftPresent: rows.coverage.some(
        (row) => row.source === "opening",
      ),
      claimSeasons: seasonsFor("claim"),
      tradeSeasons: seasonsFor("trade"),
      completeness: "unknown",
    },
    events: events.filter((event, index) => {
      const older = events[index + 1];
      const newer = events[index - 1];
      // Drafts precede dated events in their season. Inspect the original list
      // so hiding one setup claim cannot make a later claim look adjacent.
      return !(
        event.type === "claim" &&
        (older?.type === "draft" || older?.type === "expansion") &&
        event.team.id === older.team.id &&
        !(newer?.season === event.season && newer.date === event.date)
      );
    }),
  };
};
