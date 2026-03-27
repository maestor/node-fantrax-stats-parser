import fs from "fs/promises";
import path from "path";

import type { Client, InStatement } from "@libsql/client";

import { TEAMS } from "../../config/index.js";

const ENTRY_DRAFT_FILE_PATTERN = /^entry-draft-\d{4}\.json$/u;
const OPENING_DRAFT_FILE_NAME = "opening-draft.json";
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parsePositiveInteger = (value: unknown, context: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
};

const parseRequiredPlayerName = (value: unknown, context: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
};

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

const readJsonFile = async (filePath: string): Promise<unknown> =>
  JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;

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

const buildEntryDraftStatements = (
  entryDrafts: ReadonlyArray<{ season: number; picks: EntryDraftImportRow[] }>,
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
                season, pick_number, round, drafted_team_id, owner_team_id, player_name
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          pick.season,
          pick.pickNumber,
          pick.round,
          pick.draftedTeamId,
          pick.ownerTeamId,
          pick.playerName,
        ],
      });
    }
  }

  return statements;
};

const buildOpeningDraftStatements = (
  openingDraft: ReadonlyArray<OpeningDraftImportRow>,
): InStatement[] => [
  { sql: "DELETE FROM opening_draft_picks" },
  ...openingDraft.map<InStatement>((pick) => ({
    sql: `INSERT INTO opening_draft_picks (
            pick_number, round, drafted_team_id, owner_team_id, player_name
          ) VALUES (?, ?, ?, ?, ?)`,
    args: [
      pick.pickNumber,
      pick.round,
      pick.draftedTeamId,
      pick.ownerTeamId,
      pick.playerName,
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
  const entryDrafts = await Promise.all(entryFiles.map(readEntryDraftFile));
  const openingDraft = openingFile ? await readOpeningDraftFile(openingFile) : [];
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

  const statements: InStatement[] = [
    ...buildEntryDraftStatements(entryDrafts),
    ...(openingFile ? buildOpeningDraftStatements(openingDraft) : []),
    {
      sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
      args: ["last_modified", args.importedAt ?? new Date().toISOString()],
    },
  ];

  await args.db.batch(statements, "write");

  return summary;
};
