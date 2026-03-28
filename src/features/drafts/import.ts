import fs from "fs/promises";
import path from "path";

import type { Client, InStatement } from "@libsql/client";

import { TEAMS } from "../../config/index.js";

const ENTRY_DRAFT_FILE_PATTERN = /^entry-draft-\d{4}\.json$/u;
const OPENING_DRAFT_FILE_NAME = "opening-draft.json";
const ENTRY_DRAFT_ENTITY_FILE_NAME = "entities-entry-draft.json";
const OPENING_DRAFT_ENTITY_FILE_NAME = "entities-opening-draft.json";
const TEAM_IDS = new Set(TEAMS.map((team) => team.id));
const getDefaultDraftsDir = (): string =>
  path.resolve("src", "playwright", ".fantrax", "drafts");
const buildEntryDraftFileName = (season: number): string => `entry-draft-${season}.json`;

export type EntryDraftImportRow = {
  season: number;
  round: number;
  pickNumber: number;
  draftedTeamId: string;
  ownerTeamId: string;
  playerName: string | null;
};

export type OpeningDraftImportRow = {
  round: number;
  pickNumber: number;
  draftedTeamId: string;
  ownerTeamId: string;
  playerName: string;
};

export type DraftImportSummary = {
  draftsDir: string;
  entryFileCount: number;
  entrySeasons: number[];
  entryPickCount: number;
  openingPickCount: number;
  dryRun: boolean;
};

type DraftDbWriter = Pick<Client, "batch">;
type EntryDraftEntityMapping = {
  id: number;
  season: number;
  pickNumber: number;
  draftedTeamId: string;
  fantraxEntityId: string;
  fantraxEntityName: string;
};
type OpeningDraftEntityMapping = {
  id: number;
  pickNumber: number;
  draftedTeamId: string;
  fantraxEntityId: string;
  fantraxEntityName: string;
};
type EntryDraftStoredRow = EntryDraftImportRow & {
  fantraxEntityId: string | null;
};
type OpeningDraftStoredRow = OpeningDraftImportRow & {
  fantraxEntityId: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parsePositiveInteger = (value: unknown, context: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
};

const parseRequiredString = (value: unknown, context: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
};

const parseRequiredPlayerName = (value: unknown, context: string): string =>
  parseRequiredString(value, context);

const parseNullablePlayerName = (
  value: unknown,
  context: string,
): string | null => {
  if (value === null) {
    return null;
  }

  return parseRequiredPlayerName(value, context);
};

const parseTeamId = (value: unknown, context: string): string => {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object with a valid teamId.`);
  }

  const teamId = value.teamId;
  if (typeof teamId !== "string" || !TEAM_IDS.has(teamId)) {
    throw new Error(`${context}.teamId is missing or unsupported.`);
  }

  return teamId;
};

const parseEntryDraftPick = (
  value: unknown,
  context: string,
): EntryDraftImportRow => {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return {
    season: parsePositiveInteger(value.season, `${context}.season`),
    round: parsePositiveInteger(value.round, `${context}.round`),
    pickNumber: parsePositiveInteger(value.pickNumber, `${context}.pickNumber`),
    draftedTeamId: parseTeamId(value.draftedTeam, `${context}.draftedTeam`),
    ownerTeamId: parseTeamId(value.originalOwnerTeam, `${context}.originalOwnerTeam`),
    playerName: parseNullablePlayerName(value.playerName, `${context}.playerName`),
  };
};

const parseOpeningDraftPick = (
  value: unknown,
  context: string,
): OpeningDraftImportRow => {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return {
    round: parsePositiveInteger(value.round, `${context}.round`),
    pickNumber: parsePositiveInteger(value.pickNumber, `${context}.pickNumber`),
    draftedTeamId: parseTeamId(value.draftedTeam, `${context}.draftedTeam`),
    ownerTeamId: parseTeamId(value.originalOwnerTeam, `${context}.originalOwnerTeam`),
    playerName: parseRequiredPlayerName(value.playerName, `${context}.playerName`),
  };
};

const parseEntryDraftEntityMapping = (
  value: unknown,
  context: string,
): EntryDraftEntityMapping => {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return {
    id: parsePositiveInteger(value.id, `${context}.id`),
    season: parsePositiveInteger(value.season, `${context}.season`),
    pickNumber: parsePositiveInteger(value.pickNumber, `${context}.pickNumber`),
    draftedTeamId: parseRequiredString(value.draftedTeamId, `${context}.draftedTeamId`),
    fantraxEntityId: parseRequiredString(
      value.fantraxEntityId,
      `${context}.fantraxEntityId`,
    ),
    fantraxEntityName: parseRequiredString(
      value.fantraxEntityName,
      `${context}.fantraxEntityName`,
    ),
  };
};

const parseOpeningDraftEntityMapping = (
  value: unknown,
  context: string,
): OpeningDraftEntityMapping => {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return {
    id: parsePositiveInteger(value.id, `${context}.id`),
    pickNumber: parsePositiveInteger(value.pickNumber, `${context}.pickNumber`),
    draftedTeamId: parseRequiredString(value.draftedTeamId, `${context}.draftedTeamId`),
    fantraxEntityId: parseRequiredString(
      value.fantraxEntityId,
      `${context}.fantraxEntityId`,
    ),
    fantraxEntityName: parseRequiredString(
      value.fantraxEntityName,
      `${context}.fantraxEntityName`,
    ),
  };
};

const readJsonFile = async (filePath: string): Promise<unknown> =>
  JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;

const readOptionalJsonFile = async (filePath: string): Promise<unknown | null> => {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
};

const readEntryDraftFile = async (filePath: string): Promise<{
  season: number;
  picks: EntryDraftImportRow[];
}> => {
  const payload = await readJsonFile(filePath);
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error(`Entry draft file must contain a non-empty array: ${filePath}`);
  }

  const picks = payload.map((value, index) =>
    parseEntryDraftPick(value, `Entry draft ${path.basename(filePath)} row ${index + 1}`),
  );
  const seasons = new Set(picks.map((pick) => pick.season));

  if (seasons.size !== 1) {
    throw new Error(`Entry draft file must contain exactly one season: ${filePath}`);
  }

  return {
    season: picks[0].season,
    picks,
  };
};

const readOpeningDraftFile = async (
  filePath: string,
): Promise<OpeningDraftImportRow[]> => {
  const payload = await readJsonFile(filePath);
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error(`Opening draft file must contain a non-empty array: ${filePath}`);
  }

  return payload.map((value, index) =>
    parseOpeningDraftPick(
      value,
      `Opening draft ${path.basename(filePath)} row ${index + 1}`,
    ),
  );
};

const readEntryDraftEntityMappings = async (
  filePath: string,
): Promise<EntryDraftEntityMapping[]> => {
  const payload = await readOptionalJsonFile(filePath);

  if (payload === null) {
    return [];
  }

  if (!Array.isArray(payload)) {
    throw new Error(`Draft entity mapping file must contain an array: ${filePath}`);
  }

  return payload.map((value, index) =>
    parseEntryDraftEntityMapping(
      value,
      `Draft entity mapping ${path.basename(filePath)} row ${index + 1}`,
    ),
  );
};

const readOpeningDraftEntityMappings = async (
  filePath: string,
): Promise<OpeningDraftEntityMapping[]> => {
  const payload = await readOptionalJsonFile(filePath);

  if (payload === null) {
    return [];
  }

  if (!Array.isArray(payload)) {
    throw new Error(`Draft entity mapping file must contain an array: ${filePath}`);
  }

  return payload.map((value, index) =>
    parseOpeningDraftEntityMapping(
      value,
      `Draft entity mapping ${path.basename(filePath)} row ${index + 1}`,
    ),
  );
};

const resolveDraftFiles = async (args: {
  draftsDir: string;
  season?: number;
  openingOnly?: boolean;
}): Promise<{
  entryFiles: string[];
  openingFile: string | null;
}> => {
  const fileNames = await fs.readdir(args.draftsDir);
  const entryFiles = fileNames
    .filter((fileName) => ENTRY_DRAFT_FILE_PATTERN.test(fileName))
    .sort()
    .map((fileName) => path.resolve(args.draftsDir, fileName));
  const openingFile = fileNames.includes(OPENING_DRAFT_FILE_NAME)
    ? path.resolve(args.draftsDir, OPENING_DRAFT_FILE_NAME)
    : null;

  if (args.openingOnly) {
    if (!openingFile) {
      throw new Error(`Could not find ${OPENING_DRAFT_FILE_NAME} in ${args.draftsDir}`);
    }

    return {
      entryFiles: [],
      openingFile,
    };
  }

  if (args.season !== undefined) {
    const requestedFile = path.resolve(args.draftsDir, buildEntryDraftFileName(args.season));
    if (!entryFiles.includes(requestedFile)) {
      throw new Error(
        `Could not find ${buildEntryDraftFileName(args.season)} in ${args.draftsDir}`,
      );
    }

    return {
      entryFiles: [requestedFile],
      openingFile: null,
    };
  }

  if (entryFiles.length === 0) {
    throw new Error(`No entry-draft JSON files found in ${args.draftsDir}`);
  }

  if (!openingFile) {
    throw new Error(`Could not find ${OPENING_DRAFT_FILE_NAME} in ${args.draftsDir}`);
  }

  return {
    entryFiles,
    openingFile,
  };
};

const buildEntryDraftKey = (season: number, pickNumber: number): string =>
  `${season}:${pickNumber}`;

const buildOpeningDraftKey = (pickNumber: number): string => String(pickNumber);

const buildEntryDraftEntityMappingByKey = (
  mappings: readonly EntryDraftEntityMapping[],
): ReadonlyMap<string, EntryDraftEntityMapping> => {
  const mappingsByKey = new Map<string, EntryDraftEntityMapping>();

  for (const mapping of mappings) {
    const key = buildEntryDraftKey(mapping.season, mapping.pickNumber);
    if (mappingsByKey.has(key)) {
      throw new Error(
        `Duplicate entry draft entity mapping for season ${mapping.season}, pick ${mapping.pickNumber}.`,
      );
    }

    mappingsByKey.set(key, mapping);
  }

  return mappingsByKey;
};

const buildOpeningDraftEntityMappingByKey = (
  mappings: readonly OpeningDraftEntityMapping[],
): ReadonlyMap<string, OpeningDraftEntityMapping> => {
  const mappingsByKey = new Map<string, OpeningDraftEntityMapping>();

  for (const mapping of mappings) {
    const key = buildOpeningDraftKey(mapping.pickNumber);
    if (mappingsByKey.has(key)) {
      throw new Error(`Duplicate opening draft entity mapping for pick ${mapping.pickNumber}.`);
    }

    mappingsByKey.set(key, mapping);
  }

  return mappingsByKey;
};

const getEntryDraftEntityMapping = (
  mappingsByKey: ReadonlyMap<string, EntryDraftEntityMapping>,
  pick: EntryDraftImportRow,
): EntryDraftEntityMapping | undefined => {
  const mapping = mappingsByKey.get(buildEntryDraftKey(pick.season, pick.pickNumber));

  if (mapping === undefined || mapping.draftedTeamId !== pick.draftedTeamId) {
    return undefined;
  }

  return mapping;
};

const getOpeningDraftEntityMapping = (
  mappingsByKey: ReadonlyMap<string, OpeningDraftEntityMapping>,
  pick: OpeningDraftImportRow,
): OpeningDraftEntityMapping | undefined => {
  const mapping = mappingsByKey.get(buildOpeningDraftKey(pick.pickNumber));

  if (mapping === undefined || mapping.draftedTeamId !== pick.draftedTeamId) {
    return undefined;
  }

  return mapping;
};

const buildEntryDraftStatements = (
  entryDrafts: ReadonlyArray<{ season: number; picks: EntryDraftStoredRow[] }>,
): InStatement[] => {
  const statements: InStatement[] = [];
  const seenSeasons = new Set<number>();

  for (const draft of [...entryDrafts].sort((left, right) => left.season - right.season)) {
    if (seenSeasons.has(draft.season)) {
      throw new Error(`Duplicate entry draft season in import set: ${draft.season}`);
    }
    seenSeasons.add(draft.season);

    statements.push({
      sql: "DELETE FROM entry_draft_picks WHERE season = ?",
      args: [draft.season],
    });

    for (const pick of draft.picks) {
      statements.push({
        sql: `INSERT INTO entry_draft_picks (
                season, pick_number, round, drafted_team_id, owner_team_id, player_name,
                fantrax_entity_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          pick.season,
          pick.pickNumber,
          pick.round,
          pick.draftedTeamId,
          pick.ownerTeamId,
          pick.playerName,
          pick.fantraxEntityId,
        ],
      });
    }
  }

  return statements;
};

const buildOpeningDraftStatements = (
  openingDraft: ReadonlyArray<OpeningDraftStoredRow>,
): InStatement[] => [
  { sql: "DELETE FROM opening_draft_picks" },
  ...openingDraft.map<InStatement>((pick) => ({
    sql: `INSERT INTO opening_draft_picks (
            pick_number, round, drafted_team_id, owner_team_id, player_name, fantrax_entity_id
          ) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      pick.pickNumber,
      pick.round,
      pick.draftedTeamId,
      pick.ownerTeamId,
      pick.playerName,
      pick.fantraxEntityId,
    ],
  })),
];

export const importDraftPicksToDb = async (args: {
  db: DraftDbWriter;
  draftsDir?: string;
  dryRun?: boolean;
  importedAt?: string;
  season?: number;
  openingOnly?: boolean;
}): Promise<DraftImportSummary> => {
  if (args.openingOnly && args.season !== undefined) {
    throw new Error("Use either season or openingOnly, not both.");
  }

  const draftsDir = path.resolve(args.draftsDir ?? getDefaultDraftsDir());
  const { entryFiles, openingFile } = await resolveDraftFiles({
    draftsDir,
    season: args.season,
    openingOnly: args.openingOnly,
  });
  const [entryDrafts, openingDraft, entryMappings, openingMappings] = await Promise.all([
    Promise.all(entryFiles.map(readEntryDraftFile)),
    openingFile ? readOpeningDraftFile(openingFile) : Promise.resolve([]),
    readEntryDraftEntityMappings(path.resolve(draftsDir, ENTRY_DRAFT_ENTITY_FILE_NAME)),
    readOpeningDraftEntityMappings(path.resolve(draftsDir, OPENING_DRAFT_ENTITY_FILE_NAME)),
  ]);
  const summary: DraftImportSummary = {
    draftsDir,
    entryFileCount: entryDrafts.length,
    entrySeasons: entryDrafts.map((draft) => draft.season).sort((left, right) => left - right),
    entryPickCount: entryDrafts.reduce((sum, draft) => sum + draft.picks.length, 0),
    openingPickCount: openingDraft.length,
    dryRun: args.dryRun ?? false,
  };

  if (summary.dryRun) {
    return summary;
  }

  const entryMappingsByKey = buildEntryDraftEntityMappingByKey(entryMappings);
  const openingMappingsByKey = buildOpeningDraftEntityMappingByKey(openingMappings);
  const storedEntryDrafts = entryDrafts.map((draft) => ({
    season: draft.season,
    picks: draft.picks.map<EntryDraftStoredRow>((pick) => {
      const mapping = getEntryDraftEntityMapping(entryMappingsByKey, pick);

      return {
        ...pick,
        playerName: mapping?.fantraxEntityName ?? pick.playerName,
        fantraxEntityId: mapping?.fantraxEntityId ?? null,
      };
    }),
  }));
  const storedOpeningDraft = openingDraft.map<OpeningDraftStoredRow>((pick) => {
    const mapping = getOpeningDraftEntityMapping(openingMappingsByKey, pick);

    return {
      ...pick,
      playerName: mapping?.fantraxEntityName ?? pick.playerName,
      fantraxEntityId: mapping?.fantraxEntityId ?? null,
    };
  });

  const statements: InStatement[] = [
    ...buildEntryDraftStatements(storedEntryDrafts),
    ...(openingFile ? buildOpeningDraftStatements(storedOpeningDraft) : []),
    {
      sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
      args: ["last_modified", args.importedAt ?? new Date().toISOString()],
    },
  ];

  await args.db.batch(statements, "write");

  return summary;
};
