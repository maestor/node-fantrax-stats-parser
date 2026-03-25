import fs from "fs/promises";
import os from "os";
import path from "path";

import { parseCsvFile } from "../../scripts/csv.js";

describe("script CSV parser", () => {
  test("keeps the last duplicate header and parses quoted values", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffhl-script-csv-"));
    const filePath = path.join(tempDir, "claims.csv");

    try {
      await fs.writeFile(
        filePath,
        [
          `"Player","Team","Position","Type","Team","Date (EDT)","Period"`,
          `"Season 2025 Claim","EDM","F","Claim","Edmonton Oilers","Thu Mar 5, 2026, 12:38PM","150"`,
          `"2026 Draft Pick, Round 3 (Buffalo Sabres)","","","Claim","Tampa Bay Lightning","Thu Mar 5, 2026, 12:39PM","151"`,
          "",
        ].join("\n"),
        "utf8",
      );

      await expect(parseCsvFile(filePath)).resolves.toEqual([
        {
          Player: "Season 2025 Claim",
          Team: "Edmonton Oilers",
          Position: "F",
          Type: "Claim",
          "Date (EDT)": "Thu Mar 5, 2026, 12:38PM",
          Period: "150",
        },
        {
          Player: "2026 Draft Pick, Round 3 (Buffalo Sabres)",
          Team: "Tampa Bay Lightning",
          Position: "",
          Type: "Claim",
          "Date (EDT)": "Thu Mar 5, 2026, 12:39PM",
          Period: "151",
        },
      ]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
