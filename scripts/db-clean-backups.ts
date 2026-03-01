#!/usr/bin/env tsx

import fs from "fs";
import path from "path";

const BACKUPS_DIR = path.resolve(process.cwd(), ".backups");

const main = async (): Promise<void> => {
  if (!fs.existsSync(BACKUPS_DIR)) {
    console.info("No backups folder found. Nothing to clean.");
    return;
  }

  const entries = fs.readdirSync(BACKUPS_DIR);
  if (entries.length === 0) {
    console.info("Backups folder is already empty.");
    return;
  }

  for (const entry of entries) {
    fs.rmSync(path.join(BACKUPS_DIR, entry), { recursive: true, force: true });
  }

  console.info(`Cleaned ${entries.length} item(s) from ${BACKUPS_DIR}`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
