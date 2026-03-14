#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

if (process.env.USE_REMOTE_DB !== "true") {
  process.env.TURSO_DATABASE_URL = "file:local.db";
  delete process.env.TURSO_AUTH_TOKEN;
}

console.info(`Import to DB: ${process.env.TURSO_DATABASE_URL}`);

import path from "path";
import { spawnSync } from "child_process";

import { CURRENT_SEASON } from "../src/constants";
import { getDbClient } from "../src/db/client";
import { DEFAULT_TRANSACTIONS_OUT_DIR } from "../src/transactions";
import { importTransactionsToDb } from "./transaction-import-lib";

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const seasonArg = args.find((arg) => arg.startsWith("--season="));
  const outDirArg = args.find((arg) => arg.startsWith("--dir="));
  const importAll = args.includes("--all");
  const full = args.includes("--full");
  const currentOnly = args.includes("--current-only");
  const dryRun = args.includes("--dry-run");

  if (seasonArg && importAll) {
    throw new Error("Use either --season or --all, not both.");
  }
  if (seasonArg && currentOnly) {
    throw new Error("Use either --season or --current-only, not both.");
  }
  if (seasonArg && full) {
    throw new Error("Use --season by itself; it already runs a full season import.");
  }
  if (importAll && currentOnly) {
    throw new Error("Use either --all or --current-only, not both.");
  }
  if (importAll && full) {
    throw new Error("Use either --all or --full, not both.");
  }

  const seasonFilter =
    seasonArg !== undefined
      ? Number.parseInt(seasonArg.split("=")[1], 10)
      : undefined;
  if (seasonArg !== undefined && !Number.isFinite(seasonFilter)) {
    throw new Error(`Invalid --season value: ${seasonArg.split("=")[1]}`);
  }

  const csvDir =
    outDirArg !== undefined
      ? path.resolve(outDirArg.split("=")[1])
      : DEFAULT_TRANSACTIONS_OUT_DIR;

  const incremental =
    seasonFilter === undefined &&
    !importAll &&
    !full;
  const seasons =
    seasonFilter !== undefined
      ? [seasonFilter]
      : importAll
        ? undefined
        : [CURRENT_SEASON];
  const modeLabel =
    seasonFilter !== undefined
      ? `Full season ${seasonFilter}-${seasonFilter + 1}`
      : importAll
        ? "Full all seasons"
        : full
          ? `Full current season (${CURRENT_SEASON}-${CURRENT_SEASON + 1})`
          : `Incremental current season (${CURRENT_SEASON}-${CURRENT_SEASON + 1})`;

  const db = getDbClient();
  const summary = await importTransactionsToDb({
    db,
    csvDir,
    seasons,
    currentOnly: currentOnly || incremental,
    dryRun,
    incremental,
  });

  console.info("✅ Transaction import complete");
  console.info(`   CSV dir: ${csvDir}`);
  console.info(`   Mode: ${modeLabel}`);
  console.info(
    `   Seasons: ${
      summary.importedSeasons.length
        ? summary.importedSeasons.join(", ")
        : currentOnly || incremental
          ? String(CURRENT_SEASON)
          : "none"
    }`,
  );
  console.info(`   Files processed: ${summary.processedFiles}`);
  console.info(
    `   Claim events/items: ${summary.claimEvents}/${summary.claimItems} ` +
      `(unresolved items: ${summary.unresolvedClaimItems})`,
  );
  console.info(
    `   Trade blocks/items: ${summary.tradeBlocks}/${summary.tradeItems} ` +
      `(unresolved player items: ${summary.unresolvedTradeItems})`,
  );
  console.info(`   Ignored lineup-change rows: ${summary.ignoredLineupChanges}`);
  console.info(
    `   Ignored commissioner trade blocks: ${summary.ignoredCommissionerBlocks}`,
  );
  console.info(`   Dry run: ${dryRun}`);

  if (!dryRun) {
    console.info("📸 Regenerating transactions snapshot...");
    const snapshotRun = spawnSync(
      "npm",
      ["run", "snapshot:generate", "--", "--scope=transactions"],
      {
        stdio: "inherit",
        env: process.env,
      },
    );
    if (snapshotRun.status !== 0) {
      throw new Error("Snapshot generation failed after transaction import");
    }
  }
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
