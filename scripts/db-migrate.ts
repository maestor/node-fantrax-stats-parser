#!/usr/bin/env tsx

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import { getDbClient } from "../src/db/client.js";
import { migrateDb } from "../src/db/schema.js";

const main = async () => {
  const db = getDbClient();

  console.log("🗄️  Running database migration...");

  await migrateDb(db);

  console.log("✅ Migration complete!");
  console.log(
    "   Tables: players, goalies, fantrax_entities, import_metadata, playoff_results, regular_results, claim_events, claim_event_items, trade_source_blocks, trade_block_items",
  );
  console.log(
    "   Indexes: idx_players_lookup, idx_goalies_lookup, idx_players_career_id, idx_goalies_career_id, idx_players_name, idx_goalies_name, idx_fantrax_entities_name, idx_fantrax_entities_position, idx_playoff_results_season, idx_regular_results_season, idx_claim_events_season_date, idx_claim_events_team_date, idx_claim_event_items_entity, idx_claim_event_items_season_date, idx_claim_event_items_team_date, idx_trade_source_blocks_season_date, idx_trade_source_blocks_signature_date, idx_trade_block_items_entity, idx_trade_block_items_from_team, idx_trade_block_items_to_team",
  );
  console.log(
    "   Fantrax entity backfill runs only when upgrading an older schema or rebuilding an empty registry",
  );
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
