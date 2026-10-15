#!/usr/bin/env tsx
import dotenv from "dotenv";
import { getDbClient } from "../src/db/client.js";
import { migrateDb } from "../src/db/schema.js";
import { TEAMS } from "../src/config/index.js";
import {
  EXPANSION_DRAFT_SOURCES,
  parseExpansionDraftHtml,
} from "../src/features/drafts/expansion-parser.js";
import { importExpansionDraftsToDb } from "../src/features/drafts/expansion-import.js";

dotenv.config({ quiet: true });
if (process.env.USE_REMOTE_DB !== "true") {
  process.env.TURSO_DATABASE_URL = "file:local.db";
  delete process.env.TURSO_AUTH_TOKEN;
}

const main = async () => {
  const argv = process.argv.slice(2);
  const seasonArg = argv.find((arg) => arg.startsWith("--season="));
  const season = seasonArg
    ? Number(seasonArg.slice("--season=".length))
    : undefined;
  const dryRun = argv.includes("--dry-run");
  const sources = EXPANSION_DRAFT_SOURCES.filter(
    (source) =>
      season === undefined ||
      TEAMS.find((team) => team.id === source.teamId)!.firstSeason === season,
  );
  if (!sources.length)
    throw new Error(
      "Use --season=2017 or --season=2021, or omit --season for both drafts.",
    );
  const drafts = await Promise.all(
    sources.map(async (source) => {
      const response = await fetch(source.url, {
        headers: {
          "user-agent": "node-fantrax-stats-parser/expansion-draft-sync",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(
          `Failed to fetch ${source.url}: HTTP ${response.status}`,
        );
      return parseExpansionDraftHtml(await response.text(), source);
    }),
  );
  const db = getDbClient();
  try {
    if (!dryRun) await migrateDb(db);
    const summary = await importExpansionDraftsToDb({ db, drafts, dryRun });
    console.info(
      JSON.stringify(
        {
          target: process.env.USE_REMOTE_DB === "true" ? "remote" : "local.db",
          seasons: drafts.map((draft) => draft.season),
          ...summary,
        },
        null,
        2,
      ),
    );
  } finally {
    db.close();
  }
};
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
