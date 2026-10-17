import dotenv from "dotenv";
import { spawnSync } from "node:child_process";

// Load defaults without overriding an explicit caller/hosted database target.
dotenv.config({ quiet: true });
const result = spawnSync(
  "bash",
  ["scripts/import-temp-csv.sh", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: process.env,
  },
);
if (result.error)
  process.stderr.write("Could not start the CSV import pipeline.\n");
process.exitCode = result.status ?? 1;
