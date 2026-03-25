import fs from "fs/promises";
import os from "os";
import path from "path";

import { parseCsvFile } from "../../scripts/csv.js";
import {
  mapGoalieData,
  mapPlayerData,
} from "../features/stats/mapping.js";
import type { RawData } from "../features/stats/types.js";

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

  test("preserves Fantrax stats exports in the raw-data shape expected by the importer", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffhl-script-csv-"));
    const filePath = path.join(tempDir, "stats.csv");

    try {
      await fs.writeFile(
        filePath,
        [
          `"Skaters"`,
          `"ID","Pos","Player","Team","Eligible","Status","Opponent","GP","G","A","Pt","+/-","PIM","SOG","PPP","SHP","Hit","Blk"`,
          `"*p001*","F","Connor McDavid","EDM","F","Act","@SJS","82","50","75","125","25","20","350","40","5","30","25"`,
          `"Goalies"`,
          `"ID","Pos","Player","Team","Eligible","Status","Opponent","GP","W-G","GAA","SV","SV%","SHO","PIM","G","A","Pt","PPP","SHP"`,
          `"*g001*","G","Jake Oettinger","DAL","G","Act","","23","15","2.44","570",".911","2","0","0","1","1","0","0"`,
          "",
        ].join("\n"),
        "utf8",
      );

      const rawRows = await parseCsvFile<Omit<RawData, "season">>(filePath);

      expect(rawRows).toEqual([
        {
          Skaters: "Skaters",
        },
        {
          Skaters: "ID",
          field2: "Pos",
          field3: "Player",
          field4: "Team",
          field5: "Eligible",
          field6: "Status",
          field7: "Opponent",
          field8: "GP",
          field9: "G",
          field10: "A",
          field11: "Pt",
          field12: "+/-",
          field13: "PIM",
          field14: "SOG",
          field15: "PPP",
          field16: "SHP",
          field17: "Hit",
          field18: "Blk",
        },
        {
          Skaters: "*p001*",
          field2: "F",
          field3: "Connor McDavid",
          field4: "EDM",
          field5: "F",
          field6: "Act",
          field7: "@SJS",
          field8: "82",
          field9: "50",
          field10: "75",
          field11: "125",
          field12: "25",
          field13: "20",
          field14: "350",
          field15: "40",
          field16: "5",
          field17: "30",
          field18: "25",
        },
        {
          Skaters: "Goalies",
        },
        {
          Skaters: "ID",
          field2: "Pos",
          field3: "Player",
          field4: "Team",
          field5: "Eligible",
          field6: "Status",
          field7: "Opponent",
          field8: "GP",
          field9: "W-G",
          field10: "GAA",
          field11: "SV",
          field12: "SV%",
          field13: "SHO",
          field14: "PIM",
          field15: "G",
          field16: "A",
          field17: "Pt",
          field18: "PPP",
          field19: "SHP",
        },
        {
          Skaters: "*g001*",
          field2: "G",
          field3: "Jake Oettinger",
          field4: "DAL",
          field5: "G",
          field6: "Act",
          field7: "",
          field8: "23",
          field9: "15",
          field10: "2.44",
          field11: "570",
          field12: ".911",
          field13: "2",
          field14: "0",
          field15: "0",
          field16: "1",
          field17: "1",
          field18: "0",
          field19: "0",
        },
      ]);

      const rowsWithSeason: RawData[] = rawRows.map((row) => ({
        ...row,
        season: 2025,
      }));

      expect(
        mapPlayerData(rowsWithSeason, { includeZeroGames: true }),
      ).toHaveLength(1);
      expect(
        mapGoalieData(rowsWithSeason, { includeZeroGames: true }),
      ).toHaveLength(1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
