#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

if (process.env.USE_REMOTE_DB !== "true") {
  process.env.TURSO_DATABASE_URL = "file:local.db";
  delete process.env.TURSO_AUTH_TOKEN;
}

console.info(`Import to DB: ${process.env.TURSO_DATABASE_URL}`);

import path from "path";

import { getDbClient } from "../src/db/client.js";
import { migrateDb } from "../src/db/schema.js";
import {
  DEFAULT_ENTRY_DRAFT_OUT_DIR,
} from "../src/features/drafts/parser.js";
import { importDraftPicksToDb } from "../src/features/drafts/import.js";

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const outDirArg = args.find((arg) => arg.startsWith("--dir="));
  const seasonArg = args.find((arg) => arg.startsWith("--season="));
  const openingOnly = args.includes("--opening-only");
  const dryRun = args.includes("--dry-run");
  const season =
    seasonArg !== undefined ? Number.parseInt(seasonArg.split("=")[1], 10) : undefined;

  if (seasonArg !== undefined && !Number.isFinite(season)) {
    throw new Error(`Invalid --season value: ${seasonArg.split("=")[1]}`);
  }
  if (openingOnly && season !== undefined) {
    throw new Error("Use either --season or --opening-only, not both.");
  }

  const draftsDir =
    outDirArg !== undefined
      ? path.resolve(outDirArg.split("=")[1])
      : DEFAULT_ENTRY_DRAFT_OUT_DIR;

  const db = getDbClient();
  await migrateDb(db);

  const summary = await importDraftPicksToDb({
    db,
    draftsDir,
    dryRun,
    season,
    openingOnly,
  });

  console.info("✅ Draft import complete");
  console.info(`   Draft dir: ${summary.draftsDir}`);
  console.info(
    `   Mode: ${
      openingOnly ? "opening only" : season !== undefined ? `entry season ${season}` : "full import"
    }`,
  );
  console.info(`   Entry files: ${summary.entryFileCount}`);
  console.info(
    `   Entry seasons: ${summary.entrySeasons.length ? summary.entrySeasons.join(", ") : "none"}`,
  );
  console.info(`   Entry picks: ${summary.entryPickCount}`);
  console.info(`   Opening picks: ${summary.openingPickCount}`);
  console.info(`   Dry run: ${summary.dryRun}`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
