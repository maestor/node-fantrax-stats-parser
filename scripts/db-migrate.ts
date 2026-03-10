#!/usr/bin/env tsx

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import { getDbClient } from "../src/db/client";
import { migrateDb } from "../src/db/schema";

const main = async () => {
  const db = getDbClient();

  console.log("🗄️  Running database migration...");

  await migrateDb(db);

  console.log("✅ Migration complete!");
  console.log(
    "   Tables: players, goalies, import_metadata, playoff_results, regular_results",
  );
  console.log(
    "   Indexes: idx_players_lookup, idx_goalies_lookup, idx_players_career_id, idx_goalies_career_id, idx_players_name, idx_goalies_name, idx_playoff_results_season, idx_regular_results_season",
  );
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
