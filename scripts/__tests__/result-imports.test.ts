import assert from "node:assert/strict";
import childProcess, { spawn } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { migrateDb } from "../../src/db/schema.js";
import { CURRENT_SEASON } from "../../src/config/index.js";
import { FINAL_STAT_KEYS } from "../../src/playwright/finals-file.js";

if (process.argv[2] === "--fixture") {
  const [report, season] = process.argv.slice(3);
  childProcess.spawnSync = (() => ({
    status: 0,
  })) as unknown as typeof childProcess.spawnSync;
  syncBuiltinESMExports();
  process.argv = [
    process.argv[0],
    `db-import-${report}-results`,
    `--season=${season}`,
  ];
  await import(`../db-import-${report}-results.js`);
} else {
  for (const [report, table] of [
    ["regular", "regular_results"],
    ["playoff", "playoff_results"],
    ["finals", "finals_matchups"],
  ])
    test(`${report} result import changes only the requested season`, async () => {
      const cwd = mkdtempSync(path.join(tmpdir(), "result-import-"));
      const dir = path.join(cwd, "src/playwright/.fantrax");
      const db = createClient({ url: `file:${path.join(cwd, "local.db")}` });
      const team = (id: string, winner: boolean) => ({
        teamId: id,
        teamName: "Fixture",
        isWinner: winner,
        score: {
          categoriesWon: 1,
          categoriesLost: 1,
          categoriesTied: 0,
          rotisseriePoints: 1,
        },
        playedGames: { total: 3, skaters: 2, goalies: 1 },
        totals: {
          ...Object.fromEntries(FINAL_STAT_KEYS.map((k) => [k, 1])),
          gaa: "1.0",
          savePercent: ".900",
        },
      });
      const season = (year: number) =>
        report === "regular"
          ? {
              year,
              teams: [
                {
                  id: "1",
                  wins: 1,
                  losses: 1,
                  ties: 0,
                  points: 1,
                  divWins: 1,
                  divLosses: 1,
                  divTies: 0,
                  isRegularChampion: true,
                },
              ],
            }
          : report === "playoff"
            ? { year, teams: [{ id: "1", roundReached: 2, isChampion: false }] }
            : {
                year,
                awayTeam: team("1", true),
                homeTeam: team("2", false),
                wonOnHomeTiebreak: false,
                categoryResults: Object.fromEntries(
                  FINAL_STAT_KEYS.map((k) => [
                    k,
                    { away: 1, home: 1, winner: "tie" },
                  ]),
                ),
              };
      const filename = path.join(
        dir,
        `fantrax-${report === "playoff" ? "playoffs" : report}.json`,
      );
      const run = async (year: number) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            import.meta.resolve("tsx"),
            fileURLToPath(import.meta.url),
            "--fixture",
            report,
            String(year),
          ],
          {
            cwd,
            env: {
              ...process.env,
              USE_REMOTE_DB: "false",
              USE_R2_SNAPSHOTS: "false",
            },
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 10_000,
          },
        );
        let output = "";
        child.stdout.on("data", (d) => {
          output += String(d);
        });
        child.stderr.on("data", (d) => {
          output += String(d);
        });
        const code = await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", resolve);
        });
        return { code, output };
      };
      try {
        await migrateDb(db);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          filename,
          JSON.stringify({
            schemaVersion: report === "playoff" ? 3 : 1,
            leagueName: "Fixture",
            scrapedAt: "fixture",
            seasons: [season(CURRENT_SEASON - 1), season(CURRENT_SEASON)],
          }),
        );
        const first = await run(CURRENT_SEASON - 1);
        assert.equal(first.code, 0, first.output);
        const previous = (
          await db.execute({
            sql: `SELECT * FROM ${table} WHERE season = ?`,
            args: [CURRENT_SEASON - 1],
          })
        ).rows;
        const mapping = JSON.parse(readFileSync(filename, "utf8"));
        if (report === "regular") mapping.seasons[0].teams[0].points = 999;
        else if (report === "playoff")
          mapping.seasons[0].teams[0].roundReached = 4;
        else mapping.seasons[0].wonOnHomeTiebreak = true;
        writeFileSync(filename, JSON.stringify(mapping));
        const current = await run(CURRENT_SEASON);
        assert.equal(current.code, 0, current.output);
        assert.deepEqual(
          (
            await db.execute({
              sql: `SELECT * FROM ${table} WHERE season = ?`,
              args: [CURRENT_SEASON - 1],
            })
          ).rows,
          previous,
        );
        assert.equal(
          (
            await db.execute({
              sql: `SELECT * FROM ${table} WHERE season = ?`,
              args: [CURRENT_SEASON],
            })
          ).rows.length,
          1,
        );
        const missing = await run(CURRENT_SEASON + 1);
        assert.equal(missing.code, 1, missing.output);
        assert.match(missing.output, /Expected one mapped season/);
      } finally {
        db.close();
        rmSync(cwd, { recursive: true, force: true });
      }
    });
}
