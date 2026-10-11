import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { CURRENT_SEASON } from "../config/index.js";
import { getCareerHighlightsData } from "../features/career/service.js";
import { createIntegrationDb } from "./integration-db.js";

const runFile = promisify(execFile);
const highlightType = "regular-grinder-without-playoffs";

describe("stats import command highlight refresh", () => {
  test.each([
    { report: "regular", current: true, dryRun: false },
    { report: "playoffs", current: true, dryRun: false },
    { report: "regular", current: false, dryRun: false },
    { report: "playoffs", current: false, dryRun: false },
    { report: "regular", current: true, dryRun: true },
  ] as const)(
    "$report import (current: $current, dry run: $dryRun)",
    async ({ report, current, dryRun }) => {
      const context = await createIntegrationDb();
      const cwd = path.dirname(context.snapshotDir);
      const season = current ? CURRENT_SEASON : CURRENT_SEASON - 1;
      const snapshotFile = path.join(
        context.snapshotDir,
        `career/highlights/${highlightType}.json`,
      );
      try {
        await context.insertPlayers([
          {
            teamId: "7",
            season,
            reportType: "regular",
            playerId: "00abc",
            name: "Regular Grinder",
            position: "F",
            games: report === "playoffs" ? 60 : 59,
          },
        ]);
        const before = await getCareerHighlightsData(highlightType);
        await fs.mkdir(path.dirname(snapshotFile), { recursive: true });
        await fs.writeFile(snapshotFile, JSON.stringify(before));
        const csvDir = path.join(cwd, "csv/7");
        await fs.mkdir(csvDir, { recursive: true });
        await fs.writeFile(
          path.join(csvDir, `${report}-${season}-${season + 1}.csv`),
          [
            '"","Skaters"',
            '"ID","Pos","Player","Team","Eligible","Status","Age","Opponent","GP","G","A","Pt","+/-","PIM","SOG","PPP","SHP","Hit","Blk"',
            `"*00abc*","F","Regular Grinder","EDM","F","Act","27","","${report === "regular" ? 60 : 1}","1","1","2","1","0","6","0","0","3","1"`,
            '"","Goalies"',
            '"ID","Pos","Player","Team","Eligible","Status","Age","Opponent","GP","W-G","GAA","SV","SV%","SHO","PIM","G","A","Pt","PPP","SHP"',
            "",
          ].join("\n"),
        );
        await fs.symlink(
          path.resolve("node_modules"),
          path.join(cwd, "node_modules"),
        );
        await fs.symlink(path.resolve("scripts"), path.join(cwd, "scripts"));
        await fs.writeFile(
          path.join(cwd, "package.json"),
          JSON.stringify({
            scripts: {
              "snapshot:generate":
                "node --import tsx scripts/generate-snapshots.ts",
            },
          }),
        );
        const result = await runFile(
          process.execPath,
          [
            "--import",
            path.resolve("node_modules/tsx/dist/loader.mjs"),
            path.resolve("scripts/import-stats-to-db.ts"),
            `--season=${season}`,
            `--report-type=${report}`,
            "--team-id=7",
            ...(dryRun ? ["--dry-run"] : []),
          ],
          {
            cwd,
            env: {
              ...process.env,
              USE_REMOTE_DB: "true",
              TURSO_AUTH_TOKEN: "",
              USE_R2_SNAPSHOTS: "false",
            },
            timeout: 20_000,
          },
        );
        if (!dryRun) {
          expect(result.stdout + result.stderr).toContain(
            "(1 players, 0 goalies, 1 Fantrax entities)",
          );
        }
        const after = JSON.parse(await fs.readFile(snapshotFile, "utf8"));
        if (!current || dryRun) {
          expect(after).toEqual(before);
        } else if (report === "regular") {
          expect(before).toEqual([]);
          expect(after).toEqual([
            expect.objectContaining({ id: "00abc", regularGames: 60 }),
          ]);
        } else {
          expect(before).toHaveLength(1);
          expect(after).toEqual([]);
        }
        await expect(
          fs.access(
            path.join(
              context.snapshotDir,
              "career/highlights/most-claims.json",
            ),
          ),
        ).rejects.toThrow();
      } finally {
        await context.cleanup();
      }
    },
    30_000,
  );
});
