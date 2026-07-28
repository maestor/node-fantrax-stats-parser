#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

if (process.env.USE_REMOTE_DB !== "true") {
  process.env.TURSO_DATABASE_URL = "file:local.db";
  delete process.env.TURSO_AUTH_TOKEN;
}

import fs from "fs/promises";
import path from "path";

import { getDbClient } from "../src/db/client.js";
import { DEFAULT_ENTRY_DRAFT_OUT_DIR, type EntryDraftPick } from "../src/features/drafts/parser.js";
import {
  generateEntryDraftEntityMappings,
  type EntryDraftEntityMappingRecord,
  type FantraxEntityCandidate,
} from "../src/features/drafts/entity-mappings.js";

type ExistingMappingRow = EntryDraftEntityMappingRecord;

const parseSeasonArg = (args: readonly string[]): number => {
  const seasonArg = args.find((arg) => arg.startsWith("--season="));
  if (!seasonArg) {
    throw new Error("Missing required --season=YYYY argument.");
  }

  const season = Number.parseInt(seasonArg.split("=")[1], 10);
  if (!Number.isFinite(season)) {
    throw new Error(`Invalid --season value: ${seasonArg.split("=")[1]}`);
  }

  return season;
};

const readJsonFile = async (filePath: string): Promise<unknown> =>
  JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readEntryDraftPicks = async (filePath: string, season: number): Promise<EntryDraftPick[]> => {
  const payload = await readJsonFile(filePath);
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error(`Entry draft file must contain a non-empty array: ${filePath}`);
  }

  const picks = payload as EntryDraftPick[];
  const invalidSeason = picks.find((pick) => pick.season !== season);
  if (invalidSeason) {
    throw new Error(
      `Entry draft file ${filePath} contains season ${invalidSeason.season} while --season=${season} was requested.`,
    );
  }

  return picks;
};

const readExistingMappings = async (
  filePath: string,
): Promise<ExistingMappingRow[]> => {
  try {
    const payload = await readJsonFile(filePath);
    if (!Array.isArray(payload)) {
      throw new Error(`Draft entity mapping file must contain an array: ${filePath}`);
    }

    return payload.map((row, index) => {
      if (!isRecord(row)) {
        throw new Error(
          `Draft entity mapping ${path.basename(filePath)} row ${index + 1} must be an object.`,
        );
      }

      const season = Number(row.season);
      const pickNumber = Number(row.pickNumber);
      const id = Number(row.id);
      const draftedTeamId = String(row.draftedTeamId ?? "");
      const fantraxEntityId = String(row.fantraxEntityId ?? "");
      const fantraxEntityName = String(row.fantraxEntityName ?? "");

      if (
        !Number.isInteger(id) ||
        !Number.isInteger(season) ||
        !Number.isInteger(pickNumber) ||
        !draftedTeamId ||
        !fantraxEntityId ||
        !fantraxEntityName
      ) {
        throw new Error(
          `Draft entity mapping ${path.basename(filePath)} row ${index + 1} is missing required values.`,
        );
      }

      return {
        id,
        season,
        pickNumber,
        draftedTeamId,
        fantraxEntityId,
        fantraxEntityName,
      };
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
};

const loadFantraxEntities = async (): Promise<FantraxEntityCandidate[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT fantrax_id, name, last_seen_season
     FROM fantrax_entities`,
  );

  return result.rows.map((row) => ({
    fantraxId: String(row.fantrax_id),
    name: String(row.name),
    lastSeenSeason: Number(row.last_seen_season),
  }));
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const season = parseSeasonArg(args);
  const dryRun = args.includes("--dry-run");
  const draftsDirArg = args.find((arg) => arg.startsWith("--dir="));
  const draftsDir =
    draftsDirArg !== undefined
      ? path.resolve(draftsDirArg.split("=")[1])
      : DEFAULT_ENTRY_DRAFT_OUT_DIR;
  const inputFile = path.join(draftsDir, `entry-draft-${season}.json`);
  const outputFile = path.join(draftsDir, "entities-entry-draft.json");

  const [picks, entities, existingMappings] = await Promise.all([
    readEntryDraftPicks(inputFile, season),
    loadFantraxEntities(),
    readExistingMappings(outputFile),
  ]);

  const report = generateEntryDraftEntityMappings({
    picks,
    entities,
  });

  const preservedMappings = existingMappings.filter((mapping) => mapping.season !== season);
  const mergedMappings = [...preservedMappings, ...report.generatedMappings]
    .sort(
      (left, right) =>
        left.season - right.season ||
        left.pickNumber - right.pickNumber ||
        left.draftedTeamId.localeCompare(right.draftedTeamId),
    )
    .map((mapping, index) => ({
      ...mapping,
      id: index + 1,
    }));

  console.info("✅ Draft entity mapping generation complete");
  console.info(`   Input file: ${inputFile}`);
  console.info(`   Output file: ${outputFile}`);
  console.info(`   Season: ${season}`);
  console.info(`   Draft picks: ${picks.length}`);
  console.info(`   Matched: ${report.matchedCount}`);
  console.info(`   Ambiguous: ${report.ambiguousCount}`);
  console.info(`   Missing: ${report.unresolvedCount}`);
  console.info(`   Skipped null player names: ${report.skippedCount}`);
  console.info(`   Dry run: ${dryRun}`);

  const unresolved = report.results.filter(
    (result) =>
      result.status === "unresolved_missing_entity" ||
      result.status === "unresolved_ambiguous_entity",
  );
  if (unresolved.length > 0) {
    console.info("");
    console.info("Unresolved picks:");
    for (const result of unresolved) {
      const candidateNote =
        result.candidateNames.length > 0
          ? ` Candidates: ${result.candidateNames.join(", ")}`
          : "";
      console.info(
        `   Pick ${result.pickNumber}: ${result.playerName} [${result.status}]${candidateNote}`,
      );
    }
  }

  if (dryRun) {
    return;
  }

  await fs.writeFile(outputFile, `${JSON.stringify(mergedMappings, null, 2)}\n`, "utf8");
  console.info("");
  console.info(`Wrote ${report.generatedMappings.length} mapping row(s) for season ${season}.`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
