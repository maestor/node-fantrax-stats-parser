import fs from "fs";
import path from "path";
import type { Client } from "@libsql/client";

import { CURRENT_SEASON, TEAMS } from "../src/config/index.js";
import type { Team } from "../src/shared/types/index.js";
import {
  parseTransactionCsvFileName,
  type TransactionType,
} from "../src/features/transactions/files.js";
import { parseCsvFile } from "./csv.js";

const DROP_MARKER = "(Drop)";

const MONTH_INDEX_BY_ABBR = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
} as const satisfies Record<string, number>;

export type ClaimActionType = "claim" | "drop";
export type TradeAssetType = "player" | "draft_pick" | "other";
export type TransactionMatchStatus =
  | "matched"
  | "unresolved_missing_entity"
  | "unresolved_ambiguous_entity"
  | "not_applicable";
export type TransactionMatchStrategy =
  | "exact_name_position"
  | "season_team_context"
  | "not_applicable";

type ClaimCsvRow = {
  Player: string;
  Position: string;
  Type: string;
  Team: string;
  "Date (EDT)": string;
  Period: string;
};

type TradeCsvRow = {
  Player: string;
  Position: string;
  From: string;
  To: string;
  "Date (EDT)": string;
  Period: string;
};

type DbExecutor = Pick<Client, "execute">;

type EntityCandidate = {
  fantraxId: string;
  position: string | null;
  lastSeenSeason: number;
};

type ResolvedEntityMatch = {
  fantraxEntityId: string | null;
  matchStatus: TransactionMatchStatus;
  matchStrategy: TransactionMatchStrategy;
};

type ClaimEventItemSeed = {
  sequence: number;
  actionType: ClaimActionType;
  fantraxEntityId: string | null;
  rawName: string;
  rawPosition: string | null;
  matchStatus: TransactionMatchStatus;
  matchStrategy: TransactionMatchStrategy;
};

export type ClaimEventSeed = {
  season: number;
  teamId: string;
  occurredAt: string;
  sourceFile: string;
  sourceGroupIndex: number;
  items: ClaimEventItemSeed[];
};

type TradeBlockItemSeed = {
  sequence: number;
  fromTeamId: string;
  toTeamId: string;
  assetType: TradeAssetType;
  fantraxEntityId: string | null;
  rawName: string;
  rawPosition: string | null;
  matchStatus: TransactionMatchStatus;
  matchStrategy: TransactionMatchStrategy;
  draftSeason: number | null;
  draftRound: number | null;
  draftOriginalTeamId: string | null;
  rawAssetText: string;
};

export type TradeSourceBlockSeed = {
  season: number;
  occurredAt: string;
  sourceFile: string;
  sourceBlockIndex: number;
  sourcePeriod: number;
  participantSignature: string;
  items: TradeBlockItemSeed[];
};

type ParsedTransactionFile = {
  type: TransactionType;
  seasonStartYear: number;
  fileName: string;
  filePath: string;
};

type NormalizedClaimRow = {
  rawName: string;
  rawPosition: string | null;
  actionType: ClaimActionType | "lineup_change";
  teamId: string;
  occurredAt: string;
};

type NormalizedTradeRow = {
  rawName: string;
  rawPosition: string | null;
  fromTeamId: string | null;
  toTeamId: string | null;
  occurredAt: string;
  sourcePeriod: number;
  isDropRow: boolean;
};

type RawTradeSourceBlock = {
  sourceBlockIndex: number;
  occurredAt: string;
  sourcePeriod: number;
  fromTeamId: string | null;
  toTeamId: string | null;
  isDropBlock: boolean;
  rows: NormalizedTradeRow[];
};

type ClaimBuildResult = {
  events: ClaimEventSeed[];
  ignoredLineupChanges: number;
};

type TradeBuildResult = {
  dropEvents: ClaimEventSeed[];
  tradeBlocks: TradeSourceBlockSeed[];
  ignoredCommissionerBlocks: number;
};

export type TransactionImportSummary = {
  processedFiles: number;
  importedSeasons: number[];
  claimEvents: number;
  claimItems: number;
  tradeBlocks: number;
  tradeItems: number;
  unresolvedClaimItems: number;
  unresolvedTradeItems: number;
  ignoredLineupChanges: number;
  ignoredCommissionerBlocks: number;
};

export type ImportTransactionsToDbArgs = {
  db: DbExecutor;
  csvDir: string;
  seasons?: readonly number[];
  currentOnly?: boolean;
  dryRun?: boolean;
  incremental?: boolean;
};

const normalizeSpacesLower = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const normalizeTransactionEntityName = (value: string): string =>
  value
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const buildTeamIdLookup = (
  teams: readonly Team[],
): ReadonlyMap<string, string> => {
  const byName = new Map<string, string>();

  for (const team of teams) {
    for (const name of [team.presentName, ...(team.nameAliases ?? [])]) {
      const normalized = normalizeSpacesLower(name);
      if (normalized) {
        byName.set(normalized, team.id);
      }
    }
  }

  return byName;
};

const TEAM_ID_BY_NAME = buildTeamIdLookup(TEAMS);

/** @internal Test-only export for transaction team-name mapping. */
export const resolveTransactionTeamId = (rawTeamName: string): string | null => {
  const normalized = normalizeSpacesLower(rawTeamName);
  return normalized ? TEAM_ID_BY_NAME.get(normalized) ?? null : null;
};

const parseClaimActionType = (
  rawType: string,
): ClaimActionType | "lineup_change" => {
  const normalized = normalizeSpacesLower(rawType);

  if (normalized === "claim") {
    return "claim";
  }
  if (normalized === "drop") {
    return "drop";
  }
  if (normalized === "lineup change") {
    return "lineup_change";
  }

  throw new Error(`Unsupported claim action type: ${rawType}`);
};

/** @internal Test-only export for transaction timestamp parsing. */
export const parseTransactionDateToIso = (rawDate: string): string => {
  const normalized = rawDate.replace(/\s+/g, " ").trim();
  const match =
    /^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})(AM|PM)$/.exec(
      normalized,
    );

  if (!match) {
    throw new Error(`Unsupported transaction date: ${rawDate}`);
  }

  const monthKey = match[1] as keyof typeof MONTH_INDEX_BY_ABBR;
  const monthIndex = MONTH_INDEX_BY_ABBR[monthKey];
  if (monthIndex === undefined) {
    throw new Error(`Unsupported transaction month: ${rawDate}`);
  }

  const day = Number(match[2]);
  const year = Number(match[3]);
  const rawHour = Number(match[4]);
  const minute = Number(match[5]);
  const meridiem = match[6];

  const hour =
    meridiem === "AM"
      ? rawHour % 12
      : (rawHour % 12) + 12;
  const utcTimestamp = Date.UTC(year, monthIndex, day, hour + 4, minute);

  return new Date(utcTimestamp).toISOString();
};

const parseTransactionPeriod = (rawPeriod: string): number => {
  const parsed = Number.parseInt(rawPeriod, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid transaction period: ${rawPeriod}`);
  }
  return parsed;
};

/** @internal Test-only export for structured draft-pick parsing. */
export const parseDraftPickAsset = (rawAssetText: string): {
  draftSeason: number;
  draftRound: number;
  draftOriginalTeamId: string | null;
} | null => {
  const match = /^(\d{4}) Draft Pick, Round (\d+) \((.+)\)$/.exec(
    rawAssetText.trim(),
  );
  if (!match) {
    return null;
  }

  return {
    draftSeason: Number.parseInt(match[1], 10),
    draftRound: Number.parseInt(match[2], 10),
    draftOriginalTeamId: resolveTransactionTeamId(match[3]),
  };
};

const dedupe = <T>(values: readonly T[]): T[] => [...new Set(values)];

const buildDynamicInList = (count: number): string =>
  Array.from({ length: count }, () => "?").join(", ");

const toNumber = (value: bigint | number | string | null | undefined): number => {
  if (value === undefined || value === null) {
    throw new Error("Missing numeric value from database operation");
  }
  return Number(value);
};

const listTransactionCsvFiles = (
  csvDir: string,
): ParsedTransactionFile[] => {
  if (!fs.existsSync(csvDir)) {
    throw new Error(`Transactions directory not found: ${csvDir}`);
  }

  return fs
    .readdirSync(csvDir)
    .map((fileName) => {
      const parsed = parseTransactionCsvFileName(fileName);
      if (!parsed) {
        return null;
      }

      return {
        ...parsed,
        fileName,
        filePath: path.resolve(csvDir, fileName),
      };
    })
    .filter((entry): entry is ParsedTransactionFile => entry !== null)
    .sort((a, b) => {
      if (a.seasonStartYear !== b.seasonStartYear) {
        return a.seasonStartYear - b.seasonStartYear;
      }
      if (a.type === b.type) {
        return a.fileName.localeCompare(b.fileName);
      }
      return a.type === "claims" ? -1 : 1;
    });
};

const resolveRequestedSeasons = (
  files: readonly ParsedTransactionFile[],
  args: Pick<ImportTransactionsToDbArgs, "seasons" | "currentOnly">,
): number[] => {
  const availableSeasons = dedupe(files.map((file) => file.seasonStartYear)).sort(
    (a, b) => a - b,
  );

  if (args.seasons?.length) {
    return dedupe(args.seasons.map((season) => Number(season))).sort((a, b) => a - b);
  }

  if (args.currentOnly) {
    return availableSeasons.filter((season) => season === CURRENT_SEASON);
  }

  return availableSeasons;
};

const getMaxOccurredAtForClaimSourceFile = async (
  db: DbExecutor,
  sourceFile: string,
): Promise<string | null> => {
  const result = await db.execute({
    sql: `SELECT MAX(occurred_at) AS max_occurred_at
          FROM claim_events
          WHERE source_file = ?`,
    args: [sourceFile],
  });

  const value = (
    result.rows[0] as unknown as { max_occurred_at?: string | null } | undefined
  )?.max_occurred_at;
  return value == null ? null : String(value);
};

const getMaxOccurredAtForTradeSourceFile = async (
  db: DbExecutor,
  sourceFile: string,
): Promise<string | null> => {
  const [tradeResult, dropResult] = await Promise.all([
    db.execute({
      sql: `SELECT MAX(occurred_at) AS max_occurred_at
            FROM trade_source_blocks
            WHERE source_file = ?`,
      args: [sourceFile],
    }),
    db.execute({
      sql: `SELECT MAX(occurred_at) AS max_occurred_at
            FROM claim_events
            WHERE source_file = ?`,
      args: [sourceFile],
    }),
  ]);

  const tradeValue = (
    tradeResult.rows[0] as unknown as {
      max_occurred_at?: string | null;
    } | undefined
  )?.max_occurred_at;
  const dropValue = (
    dropResult.rows[0] as unknown as {
      max_occurred_at?: string | null;
    } | undefined
  )?.max_occurred_at;

  return [tradeValue, dropValue]
    .filter((value): value is string => value != null)
    .sort()
    .at(-1) ?? null;
};

const getSourceFileWatermark = async (
  db: DbExecutor,
  file: ParsedTransactionFile,
): Promise<string | null> =>
  file.type === "claims"
    ? getMaxOccurredAtForClaimSourceFile(db, file.fileName)
    : getMaxOccurredAtForTradeSourceFile(db, file.fileName);

const getNextClaimSourceGroupIndex = async (
  db: DbExecutor,
  sourceFile: string,
): Promise<number> => {
  const result = await db.execute({
    sql: `SELECT MAX(source_group_index) AS max_source_group_index
          FROM claim_events
          WHERE source_file = ?`,
    args: [sourceFile],
  });

  const value = (
    result.rows[0] as unknown as {
      max_source_group_index?: number | string | bigint | null;
    } | undefined
  )?.max_source_group_index;

  return value == null ? 0 : Number(value) + 1;
};

const getNextTradeSourceBlockIndex = async (
  db: DbExecutor,
  sourceFile: string,
): Promise<number> => {
  const result = await db.execute({
    sql: `SELECT MAX(source_block_index) AS max_source_block_index
          FROM trade_source_blocks
          WHERE source_file = ?`,
    args: [sourceFile],
  });

  const value = (
    result.rows[0] as unknown as {
      max_source_block_index?: number | string | bigint | null;
    } | undefined
  )?.max_source_block_index;

  return value == null ? 0 : Number(value) + 1;
};

const deleteClaimSourceFileFromWatermark = async (
  db: DbExecutor,
  sourceFile: string,
  occurredAt: string,
): Promise<void> => {
  await db.execute({
    sql: `DELETE FROM claim_event_items
          WHERE claim_event_id IN (
            SELECT id
            FROM claim_events
            WHERE source_file = ?
              AND occurred_at >= ?
          )`,
    args: [sourceFile, occurredAt],
  });
  await db.execute({
    sql: `DELETE FROM claim_events
          WHERE source_file = ?
            AND occurred_at >= ?`,
    args: [sourceFile, occurredAt],
  });
};

const deleteTradeSourceFileFromWatermark = async (
  db: DbExecutor,
  sourceFile: string,
  occurredAt: string,
): Promise<void> => {
  await deleteClaimSourceFileFromWatermark(db, sourceFile, occurredAt);
  await db.execute({
    sql: `DELETE FROM trade_block_items
          WHERE trade_source_block_id IN (
            SELECT id
            FROM trade_source_blocks
            WHERE source_file = ?
              AND occurred_at >= ?
          )`,
    args: [sourceFile, occurredAt],
  });
  await db.execute({
    sql: `DELETE FROM trade_source_blocks
          WHERE source_file = ?
            AND occurred_at >= ?`,
    args: [sourceFile, occurredAt],
  });
};

const filterClaimRowsByWatermark = (
  rows: readonly ClaimCsvRow[],
  watermark: string | null,
): ClaimCsvRow[] => {
  if (!watermark) {
    return [...rows];
  }

  return rows.filter(
    (row) => parseTransactionDateToIso(row["Date (EDT)"]) >= watermark,
  );
};

const filterTradeRowsByWatermark = (
  rows: readonly TradeCsvRow[],
  watermark: string | null,
): TradeCsvRow[] => {
  if (!watermark) {
    return [...rows];
  }

  return rows.filter(
    (row) => parseTransactionDateToIso(row["Date (EDT)"]) >= watermark,
  );
};

const offsetClaimEventIndexes = (
  events: readonly ClaimEventSeed[],
  startIndex: number,
): ClaimEventSeed[] =>
  events.map((event, index) => ({
    ...event,
    sourceGroupIndex: startIndex + index,
  }));

const offsetTradeBlockIndexes = (
  blocks: readonly TradeSourceBlockSeed[],
  startIndex: number,
): TradeSourceBlockSeed[] =>
  blocks.map((block, index) => ({
    ...block,
    sourceBlockIndex: startIndex + index,
  }));

const buildClaimEntityKey = (
  name: string,
  positions: readonly string[],
): string =>
  `${normalizeTransactionEntityName(name)}|${positions.join(",")}`;

const buildTeamLookupKey = (
  fantraxId: string,
  season: number,
  teamIds: readonly string[],
): string => `${fantraxId}|${season}|${teamIds.join(",")}`;

export type TransactionEntityResolver = {
  resolveEntity: (args: {
    name: string;
    rawPosition: string | null;
    season: number;
    teamIds: readonly string[];
  }) => Promise<ResolvedEntityMatch>;
};

/** @internal Test-only export for transaction entity matching. */
export const createTransactionEntityResolver = (
  db: DbExecutor,
): TransactionEntityResolver => {
  const candidatesByKey = new Map<string, Promise<EntityCandidate[]>>();
  const teamHitByKey = new Map<string, Promise<boolean>>();

  const getCandidates = async (
    name: string,
    positions: readonly string[],
  ): Promise<EntityCandidate[]> => {
    const normalizedName = normalizeTransactionEntityName(name);
    const key = buildClaimEntityKey(normalizedName, positions);
    const cached = candidatesByKey.get(key);
    if (cached) {
      return cached;
    }

    const promise = db
      .execute({
        sql: `SELECT fantrax_id, position, last_seen_season
              FROM fantrax_entities
              WHERE name = ? AND position IN (${buildDynamicInList(positions.length)})`,
        args: [normalizedName, ...positions],
      })
      .then((result) =>
        result.rows.map((row) => {
          const candidateRow = row as unknown as {
            fantrax_id: string;
            position?: string | null;
            last_seen_season: number | string | bigint;
          };

          return {
            fantraxId: String(candidateRow.fantrax_id),
            position:
              candidateRow.position == null
              ? null
              : String(candidateRow.position),
            lastSeenSeason: toNumber(candidateRow.last_seen_season),
          };
        }),
      );

    candidatesByKey.set(key, promise);
    return promise;
  };

  const candidateHasTeamHit = async (args: {
    candidate: EntityCandidate;
    season: number;
    teamIds: readonly string[];
  }): Promise<boolean> => {
    const uniqueTeamIds = dedupe(args.teamIds);
    if (!uniqueTeamIds.length) {
      return false;
    }

    const cacheKey = buildTeamLookupKey(
      args.candidate.fantraxId,
      args.season,
      uniqueTeamIds,
    );
    const cached = teamHitByKey.get(cacheKey);
    if (cached) {
      return cached;
    }

    const isGoalie = args.candidate.position === "G";
    const idColumn = isGoalie ? "goalie_id" : "player_id";
    const tableName = isGoalie ? "goalies" : "players";
    const promise = db
      .execute({
        sql: `SELECT 1
              FROM ${tableName}
              WHERE ${idColumn} = ?
                AND season = ?
                AND team_id IN (${buildDynamicInList(uniqueTeamIds.length)})
              LIMIT 1`,
        args: [args.candidate.fantraxId, args.season, ...uniqueTeamIds],
      })
      .then((result) => result.rows.length > 0);

    teamHitByKey.set(cacheKey, promise);
    return promise;
  };

  const resolveLatestLastSeenCandidate = (
    candidates: readonly EntityCandidate[],
  ): EntityCandidate | null => {
    const sortedByLastSeen = [...candidates].sort(
      (a, b) => b.lastSeenSeason - a.lastSeenSeason,
    );
    const latestCandidate = sortedByLastSeen[0];
    const nextCandidate = sortedByLastSeen[1];

    if (latestCandidate.lastSeenSeason === nextCandidate.lastSeenSeason) {
      return null;
    }

    return latestCandidate;
  };

  return {
    resolveEntity: async (args) => {
      const positions = dedupe(
        (args.rawPosition ?? "")
          .split(",")
          .map((position) => position.trim())
          .filter(Boolean),
      );

      if (!positions.length) {
        return {
          fantraxEntityId: null,
          matchStatus: "unresolved_missing_entity",
          matchStrategy: "exact_name_position",
        };
      }

      const candidates = await getCandidates(args.name, positions);

      if (candidates.length === 0) {
        return {
          fantraxEntityId: null,
          matchStatus: "unresolved_missing_entity",
          matchStrategy: "exact_name_position",
        };
      }

      if (candidates.length === 1) {
        return {
          fantraxEntityId: candidates[0].fantraxId,
          matchStatus: "matched",
          matchStrategy: "exact_name_position",
        };
      }

      const matchedCandidates: EntityCandidate[] = [];
      for (const candidate of candidates) {
        if (
          await candidateHasTeamHit({
            candidate,
            season: args.season,
            teamIds: args.teamIds,
          })
        ) {
          matchedCandidates.push(candidate);
        }
      }

      if (matchedCandidates.length === 1) {
        return {
          fantraxEntityId: matchedCandidates[0].fantraxId,
          matchStatus: "matched",
          matchStrategy: "season_team_context",
        };
      }

      const latestLastSeenCandidate = resolveLatestLastSeenCandidate(
        matchedCandidates.length > 1 ? matchedCandidates : candidates,
      );

      if (latestLastSeenCandidate) {
        return {
          fantraxEntityId: latestLastSeenCandidate.fantraxId,
          matchStatus: "matched",
          matchStrategy: "season_team_context",
        };
      }

      return {
        fantraxEntityId: null,
        matchStatus: "unresolved_ambiguous_entity",
        matchStrategy: "season_team_context",
      };
    },
  };
};

const normalizeClaimRows = (rows: readonly ClaimCsvRow[]): NormalizedClaimRow[] =>
  rows.map((row) => {
    const teamId = resolveTransactionTeamId(row.Team);
    if (!teamId) {
      throw new Error(`Unknown fantasy team in claims CSV: ${row.Team}`);
    }

    return {
      rawName: row.Player.trim(),
      rawPosition: row.Position.trim() || null,
      actionType: parseClaimActionType(row.Type),
      teamId,
      occurredAt: parseTransactionDateToIso(row["Date (EDT)"]),
    };
  });

/** @internal Test-only export for claims/drop grouping. */
export const buildClaimEvents = async (args: {
  rows: readonly ClaimCsvRow[];
  season: number;
  sourceFile: string;
  resolver: TransactionEntityResolver;
}): Promise<ClaimBuildResult> => {
  const rows = normalizeClaimRows(args.rows);
  const events: ClaimEventSeed[] = [];
  let ignoredLineupChanges = 0;
  let currentRows: NormalizedClaimRow[] = [];
  let currentTeamId: string | null = null;
  let currentOccurredAt: string | null = null;
  let nextSourceGroupIndex = 0;

  const flush = async (): Promise<void> => {
    if (!currentRows.length || !currentTeamId || !currentOccurredAt) {
      currentRows = [];
      return;
    }

    const items: ClaimEventItemSeed[] = [];
    for (const row of currentRows) {
      if (row.actionType === "lineup_change") {
        ignoredLineupChanges++;
        continue;
      }

      const resolved = await args.resolver.resolveEntity({
        name: row.rawName,
        rawPosition: row.rawPosition,
        season: args.season,
        teamIds: [row.teamId],
      });

      items.push({
        sequence: items.length,
        actionType: row.actionType,
        fantraxEntityId: resolved.fantraxEntityId,
        rawName: row.rawName,
        rawPosition: row.rawPosition,
        matchStatus: resolved.matchStatus,
        matchStrategy: resolved.matchStrategy,
      });
    }

    if (items.length) {
      events.push({
        season: args.season,
        teamId: currentTeamId,
        occurredAt: currentOccurredAt,
        sourceFile: args.sourceFile,
        sourceGroupIndex: nextSourceGroupIndex,
        items,
      });
    }

    nextSourceGroupIndex++;
    currentRows = [];
  };

  for (const row of rows) {
    if (
      currentRows.length > 0 &&
      row.teamId === currentTeamId &&
      row.occurredAt === currentOccurredAt
    ) {
      currentRows.push(row);
      continue;
    }

    await flush();
    currentRows = [row];
    currentTeamId = row.teamId;
    currentOccurredAt = row.occurredAt;
  }

  await flush();

  return {
    events,
    ignoredLineupChanges,
  };
};

const normalizeTradeRows = (rows: readonly TradeCsvRow[]): NormalizedTradeRow[] =>
  rows.map((row) => {
    const fromIsDrop = row.From.trim() === DROP_MARKER;
    const toIsDrop = row.To.trim() === DROP_MARKER;
    const fromTeamId = fromIsDrop ? null : resolveTransactionTeamId(row.From);
    const toTeamId = toIsDrop ? null : resolveTransactionTeamId(row.To);

    if (!fromIsDrop && !fromTeamId) {
      throw new Error(`Unknown fantasy team in trades CSV: ${row.From}`);
    }
    if (!toIsDrop && !toTeamId) {
      throw new Error(`Unknown fantasy team in trades CSV: ${row.To}`);
    }

    return {
      rawName: row.Player.trim(),
      rawPosition: row.Position.trim() || null,
      fromTeamId,
      toTeamId,
      occurredAt: parseTransactionDateToIso(row["Date (EDT)"]),
      sourcePeriod: parseTransactionPeriod(row.Period),
      isDropRow: fromIsDrop || toIsDrop,
    };
  });

const buildTradeRawBlocks = (
  rows: readonly NormalizedTradeRow[],
): RawTradeSourceBlock[] => {
  const blocks: RawTradeSourceBlock[] = [];
  let currentBlock: RawTradeSourceBlock | null = null;

  for (const row of rows) {
    const isSameBlock =
      currentBlock !== null &&
      currentBlock.occurredAt === row.occurredAt &&
      currentBlock.sourcePeriod === row.sourcePeriod &&
      currentBlock.fromTeamId === row.fromTeamId &&
      currentBlock.toTeamId === row.toTeamId;

    if (currentBlock && isSameBlock) {
      currentBlock.rows.push(row);
      continue;
    }

    const nextBlock: RawTradeSourceBlock = {
      sourceBlockIndex: blocks.length,
      occurredAt: row.occurredAt,
      sourcePeriod: row.sourcePeriod,
      fromTeamId: row.fromTeamId,
      toTeamId: row.toTeamId,
      isDropBlock: row.isDropRow,
      rows: [row],
    };
    blocks.push(nextBlock);
    currentBlock = nextBlock;
  }

  return blocks;
};

const buildParticipantSignature = (
  fromTeamId: string,
  toTeamId: string,
): string => [fromTeamId, toTeamId].sort().join("|");

const getTradeTeamIdForDrop = (row: NormalizedTradeRow): string => {
  const teamId = row.fromTeamId ?? row.toTeamId;
  if (!teamId) {
    throw new Error(`Drop transaction row is missing a fantasy team: ${row.rawName}`);
  }
  return teamId;
};

const classifyCommissionerFixBlocks = (
  blocks: readonly RawTradeSourceBlock[],
): Set<number> => {
  const ignoredBlockIndexes = new Set<number>();
  const blocksByOccurredAt = new Map<string, RawTradeSourceBlock[]>();

  for (const block of blocks) {
    if (block.isDropBlock || !block.fromTeamId || !block.toTeamId) {
      continue;
    }

    const existing = blocksByOccurredAt.get(block.occurredAt) ?? [];
    existing.push(block);
    blocksByOccurredAt.set(block.occurredAt, existing);
  }

  for (const blocksAtTime of blocksByOccurredAt.values()) {
    const adjacency = new Map<string, Set<string>>();
    for (const block of blocksAtTime) {
      const fromSet = adjacency.get(block.fromTeamId!) ?? new Set<string>();
      fromSet.add(block.toTeamId!);
      adjacency.set(block.fromTeamId!, fromSet);

      const toSet = adjacency.get(block.toTeamId!) ?? new Set<string>();
      toSet.add(block.fromTeamId!);
      adjacency.set(block.toTeamId!, toSet);
    }

    const visitedTeams = new Set<string>();
    for (const startTeamId of adjacency.keys()) {
      if (visitedTeams.has(startTeamId)) {
        continue;
      }

      const queue = [startTeamId];
      const componentTeams = new Set<string>();

      while (queue.length) {
        const teamId = queue.shift()!;
        if (visitedTeams.has(teamId)) {
          continue;
        }

        visitedTeams.add(teamId);
        componentTeams.add(teamId);

        for (const neighbor of adjacency.get(teamId) ?? []) {
          if (!visitedTeams.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }

      const blocksInComponent = blocksAtTime.filter(
        (block) =>
          componentTeams.has(block.fromTeamId!) && componentTeams.has(block.toTeamId!),
      );
      const fromTeamCount = new Set(
        blocksInComponent.map((block) => block.fromTeamId!),
      ).size;
      const toTeamCount = new Set(
        blocksInComponent.map((block) => block.toTeamId!),
      ).size;

      if (fromTeamCount === 1 || toTeamCount === 1) {
        for (const block of blocksInComponent) {
          ignoredBlockIndexes.add(block.sourceBlockIndex);
        }
      }
    }
  }

  return ignoredBlockIndexes;
};

const buildTradeDropEvents = async (args: {
  rows: readonly NormalizedTradeRow[];
  season: number;
  sourceFile: string;
  resolver: TransactionEntityResolver;
}): Promise<ClaimEventSeed[]> => {
  const events: ClaimEventSeed[] = [];
  let currentRows: NormalizedTradeRow[] = [];
  let currentTeamId: string | null = null;
  let currentOccurredAt: string | null = null;
  let nextSourceGroupIndex = 0;

  const flush = async (): Promise<void> => {
    if (!currentRows.length || !currentTeamId || !currentOccurredAt) {
      currentRows = [];
      return;
    }

    const items: ClaimEventItemSeed[] = [];
    for (const row of currentRows) {
      const resolved = await args.resolver.resolveEntity({
        name: row.rawName,
        rawPosition: row.rawPosition,
        season: args.season,
        teamIds: [currentTeamId],
      });

      items.push({
        sequence: items.length,
        actionType: "drop",
        fantraxEntityId: resolved.fantraxEntityId,
        rawName: row.rawName,
        rawPosition: row.rawPosition,
        matchStatus: resolved.matchStatus,
        matchStrategy: resolved.matchStrategy,
      });
    }

    events.push({
      season: args.season,
      teamId: currentTeamId,
      occurredAt: currentOccurredAt,
      sourceFile: args.sourceFile,
      sourceGroupIndex: nextSourceGroupIndex,
      items,
    });

    nextSourceGroupIndex++;
    currentRows = [];
  };

  for (const row of args.rows) {
    if (!row.isDropRow) {
      await flush();
      currentTeamId = null;
      currentOccurredAt = null;
      continue;
    }

    const teamId = getTradeTeamIdForDrop(row);
    if (
      currentRows.length > 0 &&
      teamId === currentTeamId &&
      row.occurredAt === currentOccurredAt
    ) {
      currentRows.push(row);
      continue;
    }

    await flush();
    currentRows = [row];
    currentTeamId = teamId;
    currentOccurredAt = row.occurredAt;
  }

  await flush();
  return events;
};

/** @internal Test-only export for trades/drop extraction. */
export const buildTradeImportData = async (args: {
  rows: readonly TradeCsvRow[];
  season: number;
  sourceFile: string;
  resolver: TransactionEntityResolver;
}): Promise<TradeBuildResult> => {
  const normalizedRows = normalizeTradeRows(args.rows);
  const rawBlocks = buildTradeRawBlocks(normalizedRows);
  const ignoredBlockIndexes = classifyCommissionerFixBlocks(rawBlocks);
  const dropEvents = await buildTradeDropEvents({
    rows: normalizedRows,
    season: args.season,
    sourceFile: args.sourceFile,
    resolver: args.resolver,
  });

  const tradeBlocks: TradeSourceBlockSeed[] = [];

  for (const block of rawBlocks) {
    if (block.isDropBlock || ignoredBlockIndexes.has(block.sourceBlockIndex)) {
      continue;
    }

    if (!block.fromTeamId || !block.toTeamId) {
      throw new Error(
        `Trade block ${block.sourceBlockIndex} is missing fantasy team metadata`,
      );
    }

    const items: TradeBlockItemSeed[] = [];
    for (const row of block.rows) {
      const draftPick = parseDraftPickAsset(row.rawName);

      if (row.rawPosition) {
        const resolved = await args.resolver.resolveEntity({
          name: row.rawName,
          rawPosition: row.rawPosition,
          season: args.season,
          teamIds: [block.fromTeamId, block.toTeamId],
        });

        items.push({
          sequence: items.length,
          fromTeamId: block.fromTeamId,
          toTeamId: block.toTeamId,
          assetType: "player",
          fantraxEntityId: resolved.fantraxEntityId,
          rawName: row.rawName,
          rawPosition: row.rawPosition,
          matchStatus: resolved.matchStatus,
          matchStrategy: resolved.matchStrategy,
          draftSeason: null,
          draftRound: null,
          draftOriginalTeamId: null,
          rawAssetText: row.rawName,
        });
        continue;
      }

      if (draftPick) {
        items.push({
          sequence: items.length,
          fromTeamId: block.fromTeamId,
          toTeamId: block.toTeamId,
          assetType: "draft_pick",
          fantraxEntityId: null,
          rawName: row.rawName,
          rawPosition: null,
          matchStatus: "not_applicable",
          matchStrategy: "not_applicable",
          draftSeason: draftPick.draftSeason,
          draftRound: draftPick.draftRound,
          draftOriginalTeamId: draftPick.draftOriginalTeamId,
          rawAssetText: row.rawName,
        });
        continue;
      }

      items.push({
        sequence: items.length,
        fromTeamId: block.fromTeamId,
        toTeamId: block.toTeamId,
        assetType: "other",
        fantraxEntityId: null,
        rawName: row.rawName,
        rawPosition: null,
        matchStatus: "not_applicable",
        matchStrategy: "not_applicable",
        draftSeason: null,
        draftRound: null,
        draftOriginalTeamId: null,
        rawAssetText: row.rawName,
      });
    }

    tradeBlocks.push({
      season: args.season,
      occurredAt: block.occurredAt,
      sourceFile: args.sourceFile,
      sourceBlockIndex: block.sourceBlockIndex,
      sourcePeriod: block.sourcePeriod,
      participantSignature: buildParticipantSignature(
        block.fromTeamId,
        block.toTeamId,
      ),
      items,
    });
  }

  return {
    dropEvents,
    tradeBlocks,
    ignoredCommissionerBlocks: ignoredBlockIndexes.size,
  };
};

const deleteSeasonTransactions = async (
  db: DbExecutor,
  season: number,
): Promise<void> => {
  await db.execute({
    sql: `DELETE FROM claim_event_items
          WHERE claim_event_id IN (
            SELECT id FROM claim_events WHERE season = ?
          )`,
    args: [season],
  });
  await db.execute({
    sql: "DELETE FROM claim_events WHERE season = ?",
    args: [season],
  });
  await db.execute({
    sql: `DELETE FROM trade_block_items
          WHERE trade_source_block_id IN (
            SELECT id FROM trade_source_blocks WHERE season = ?
          )`,
    args: [season],
  });
  await db.execute({
    sql: "DELETE FROM trade_source_blocks WHERE season = ?",
    args: [season],
  });
};

const insertClaimEvent = async (
  db: DbExecutor,
  event: ClaimEventSeed,
): Promise<void> => {
  const result = await db.execute({
    sql: `INSERT INTO claim_events (
            season, team_id, occurred_at, source_file, source_group_index
          ) VALUES (?, ?, ?, ?, ?)`,
    args: [
      event.season,
      event.teamId,
      event.occurredAt,
      event.sourceFile,
      event.sourceGroupIndex,
    ],
  });
  const claimEventId = toNumber(result.lastInsertRowid);

  for (const item of event.items) {
    await db.execute({
      sql: `INSERT INTO claim_event_items (
              claim_event_id, season, team_id, occurred_at, sequence, action_type,
              fantrax_entity_id, raw_name, raw_position, match_status, match_strategy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        claimEventId,
        event.season,
        event.teamId,
        event.occurredAt,
        item.sequence,
        item.actionType,
        item.fantraxEntityId,
        item.rawName,
        item.rawPosition,
        item.matchStatus,
        item.matchStrategy,
      ],
    });
  }
};

const insertTradeBlock = async (
  db: DbExecutor,
  block: TradeSourceBlockSeed,
): Promise<void> => {
  const result = await db.execute({
    sql: `INSERT INTO trade_source_blocks (
            season, occurred_at, source_file, source_block_index, source_period,
            participant_signature
          ) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      block.season,
      block.occurredAt,
      block.sourceFile,
      block.sourceBlockIndex,
      block.sourcePeriod,
      block.participantSignature,
    ],
  });
  const tradeSourceBlockId = toNumber(result.lastInsertRowid);

  for (const item of block.items) {
    await db.execute({
      sql: `INSERT INTO trade_block_items (
              trade_source_block_id, sequence, from_team_id, to_team_id, asset_type,
              fantrax_entity_id, raw_name, raw_position, match_status, match_strategy,
              draft_season, draft_round, draft_original_team_id, raw_asset_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        tradeSourceBlockId,
        item.sequence,
        item.fromTeamId,
        item.toTeamId,
        item.assetType,
        item.fantraxEntityId,
        item.rawName,
        item.rawPosition,
        item.matchStatus,
        item.matchStrategy,
        item.draftSeason,
        item.draftRound,
        item.draftOriginalTeamId,
        item.rawAssetText,
      ],
    });
  }
};

export const importTransactionsToDb = async (
  args: ImportTransactionsToDbArgs,
): Promise<TransactionImportSummary> => {
  const files = listTransactionCsvFiles(args.csvDir);
  const seasons = resolveRequestedSeasons(files, args);
  if (
    args.incremental &&
    (seasons.length !== 1 || seasons[0] !== CURRENT_SEASON)
  ) {
    throw new Error(
      "Incremental transaction import is only supported for the current season.",
    );
  }
  const seasonSet = new Set(seasons);
  const selectedFiles = files.filter((file) => seasonSet.has(file.seasonStartYear));
  const resolver = createTransactionEntityResolver(args.db);

  const summary: TransactionImportSummary = {
    processedFiles: selectedFiles.length,
    importedSeasons: seasons,
    claimEvents: 0,
    claimItems: 0,
    tradeBlocks: 0,
    tradeItems: 0,
    unresolvedClaimItems: 0,
    unresolvedTradeItems: 0,
    ignoredLineupChanges: 0,
    ignoredCommissionerBlocks: 0,
  };

  if (!args.dryRun && !args.incremental) {
    for (const season of seasons) {
      await deleteSeasonTransactions(args.db, season);
    }
  }

  for (const file of selectedFiles) {
    const rawRows = await parseCsvFile(file.filePath);
    const watermark =
      args.incremental && !args.dryRun
        ? await getSourceFileWatermark(args.db, file)
        : null;

    if (!args.dryRun && args.incremental && watermark) {
      if (file.type === "claims") {
        await deleteClaimSourceFileFromWatermark(args.db, file.fileName, watermark);
      } else {
        await deleteTradeSourceFileFromWatermark(args.db, file.fileName, watermark);
      }
    }

    if (file.type === "claims") {
      const filteredRows = filterClaimRowsByWatermark(
        rawRows as ClaimCsvRow[],
        watermark,
      );
      const result = await buildClaimEvents({
        rows: filteredRows,
        season: file.seasonStartYear,
        sourceFile: file.fileName,
        resolver,
      });
      const events =
        args.incremental && !args.dryRun
          ? offsetClaimEventIndexes(
              result.events,
              await getNextClaimSourceGroupIndex(args.db, file.fileName),
            )
          : result.events;

      summary.ignoredLineupChanges += result.ignoredLineupChanges;

      for (const event of events) {
        summary.claimEvents++;
        summary.claimItems += event.items.length;
        summary.unresolvedClaimItems += event.items.filter(
          (item) => item.matchStatus !== "matched",
        ).length;

        if (!args.dryRun) {
          await insertClaimEvent(args.db, event);
        }
      }

      continue;
    }

    const filteredRows = filterTradeRowsByWatermark(
      rawRows as TradeCsvRow[],
      watermark,
    );
    const result = await buildTradeImportData({
      rows: filteredRows,
      season: file.seasonStartYear,
      sourceFile: file.fileName,
      resolver,
    });
    const dropEvents =
      args.incremental && !args.dryRun
        ? offsetClaimEventIndexes(
            result.dropEvents,
            await getNextClaimSourceGroupIndex(args.db, file.fileName),
          )
        : result.dropEvents;
    const tradeBlocks =
      args.incremental && !args.dryRun
        ? offsetTradeBlockIndexes(
            result.tradeBlocks,
            await getNextTradeSourceBlockIndex(args.db, file.fileName),
          )
        : result.tradeBlocks;

    summary.ignoredCommissionerBlocks += result.ignoredCommissionerBlocks;

    for (const event of dropEvents) {
      summary.claimEvents++;
      summary.claimItems += event.items.length;
      summary.unresolvedClaimItems += event.items.filter(
        (item) => item.matchStatus !== "matched",
      ).length;

      if (!args.dryRun) {
        await insertClaimEvent(args.db, event);
      }
    }

    for (const block of tradeBlocks) {
      summary.tradeBlocks++;
      summary.tradeItems += block.items.length;
      summary.unresolvedTradeItems += block.items.filter(
        (item) => item.assetType === "player" && item.matchStatus !== "matched",
      ).length;

      if (!args.dryRun) {
        await insertTradeBlock(args.db, block);
      }
    }
  }

  if (!args.dryRun) {
    await args.db.execute({
      sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
      args: ["last_modified", new Date().toISOString()],
    });
  }

  return summary;
};
