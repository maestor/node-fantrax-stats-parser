import assert from "node:assert/strict";
import childProcess, { spawn, spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@libsql/client";
import { CURRENT_SEASON } from "../../src/config/index.js";

const year = CURRENT_SEASON;
const periods = {
  regularStartDate: `${year}-09-29`,
  regularEndDate: `${year + 1}-03-07`,
  playoffsStartDate: `${year + 1}-03-08`,
  playoffsEndDate: `${year + 1}-04-04`,
};
const auth = { cookies: [], origins: [] };
const key = (phase: string) => `daily-import:${year}:${phase}-finalized`;

if (process.argv[2] === "--fixture") {
  const [scenario, timestamp] = process.argv.slice(3);
  mock.timers.enable({ apis: ["Date"], now: Date.parse(timestamp) });
  childProcess.spawnSync = ((
    _cmd: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv },
  ) => {
    assert.equal(_cmd, "npm");
    assert.deepEqual(args.slice(0, 2), ["run", "--ignore-scripts"]);
    const script = args[2];
    const flags = args.slice(4);
    if (script.startsWith("playwright:"))
      assert.ok(flags.includes(`--year=${year}`));
    if (script.startsWith("playwright:sync:"))
      assert.ok(flags.includes("--strict"));
    if (script.startsWith("db:import:") && script !== "db:import:transactions")
      assert.ok(flags.includes(`--season=${year}`));
    if (script === "db:import:transactions")
      assert.deepEqual(flags, ["--current-only"]);
    assert.equal(options.env.TZ, "Europe/Helsinki");
    process.stdout.write(`COMMAND ${script}\n`);
    if (scenario === "stats-failure" && script === "playwright:import:regular")
      return { status: 1 };
    if (scenario === "final-failure" && script === "db:import:finals-results")
      return { status: 1 };
    if (scenario === "bracket-failure" && script === "playwright:sync:playoffs")
      return { status: 1 };
    if (script === "playwright:sync:playoffs") {
      writeFileSync(
        "src/playwright/.fantrax/fantrax-playoffs.json",
        JSON.stringify({
          schemaVersion: 3,
          seasons: [
            {
              year,
              teams: Array.from({ length: 16 }, (_, i) => ({
                id: String(i + 1),
                isChampion: scenario !== "no-champion" && i === 0,
              })),
            },
          ],
        }),
      );
    }
    return { status: 0 };
  }) as typeof childProcess.spawnSync;
  syncBuiltinESMExports();
  process.argv = [
    process.argv[0],
    "daily-import",
    ...(scenario === "dry" ? ["--dry-run"] : []),
    ...(scenario === "remote-guard" ? ["--require-remote"] : []),
    ...(scenario === "refresh" ? ["--refresh-finalized"] : []),
  ];
  await import("../daily-import.js");
} else {
  const cases = [
    ["preseason", `${year}-08-01T08:00:00Z`],
    ["regular", `${year}-10-17T07:30:00Z`],
    ["last-regular", `${year + 1}-03-07T08:30:00Z`],
    ["playoffs", `${year + 1}-03-09T08:30:00Z`],
    ["helsinki-transition", `${year + 1}-03-07T22:30:00Z`],
    ["last-playoff", `${year + 1}-04-04T07:30:00Z`],
    ["finalize", `${year + 1}-04-05T07:30:00Z`],
    ["no-champion", `${year + 1}-04-05T07:30:00Z`],
    ["final-failure", `${year + 1}-04-05T07:30:00Z`],
    ["offseason", `${year + 1}-07-01T07:30:00Z`],
    ["refresh", `${year + 1}-07-01T07:30:00Z`],
    ["stats-failure", `${year}-10-17T07:30:00Z`],
    ["bracket-failure", `${year + 1}-03-09T08:30:00Z`],
    ["missing-season", `${year}-10-17T07:30:00Z`],
    ["invalid-dates", `${year}-10-17T07:30:00Z`],
    ["bad-secret", `${year}-10-17T07:30:00Z`],
    ["remote-guard", `${year}-10-17T07:30:00Z`],
    ["dry", `${year}-10-17T07:30:00Z`],
  ];
  for (const [scenario, timestamp] of cases)
    test(`Daily import: ${scenario}`, async () => {
      const cwd = mkdtempSync(path.join(tmpdir(), "daily-import-"));
      const dir = path.join(cwd, "src/playwright/.fantrax");
      const db = createClient({ url: `file:${path.join(cwd, "local.db")}` });
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          path.join(dir, "fantrax-leagues.json"),
          JSON.stringify({
            schemaVersion: 2,
            seasons: [
              ...(scenario === "missing-season"
                ? []
                : [
                    {
                      year,
                      leagueId: "fixture",
                      periods:
                        scenario === "invalid-dates"
                          ? { ...periods, regularEndDate: "bad-date" }
                          : periods,
                    },
                  ]),
              { year: year + 1, leagueId: "future-fixture", periods },
            ],
          }),
        );
        await db.execute(
          "CREATE TABLE import_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        );
        if (
          ["offseason", "refresh", "last-playoff", "no-champion"].includes(
            scenario,
          )
        ) {
          await db.execute({
            sql: "INSERT INTO import_metadata VALUES (?, ?)",
            args: [key("regular"), "done"],
          });
        }
        if (["offseason", "refresh"].includes(scenario))
          await db.execute({
            sql: "INSERT INTO import_metadata VALUES (?, ?)",
            args: [key("playoffs"), "done"],
          });
        const env: NodeJS.ProcessEnv & { FANTRAX_AUTH_STATE: string } = {
          ...process.env,
          USE_REMOTE_DB: "false",
          USE_R2_STORAGE: "false",
          USE_R2_SNAPSHOTS: "false",
          RAW_UPLOAD: "false",
          FANTRAX_AUTH_STATE:
            scenario === "bad-secret"
              ? "invalid"
              : gzipSync(JSON.stringify(auth)).toString("base64"),
          GITHUB_STEP_SUMMARY: path.join(cwd, "summary.md"),
        };
        delete env.TURSO_DATABASE_URL;
        delete env.TURSO_AUTH_TOKEN;
        const child = spawn(
          process.execPath,
          [
            "--import",
            import.meta.resolve("tsx"),
            fileURLToPath(import.meta.url),
            "--fixture",
            scenario,
            timestamp,
          ],
          { cwd, env, stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 },
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
        const fails = [
          "stats-failure",
          "bracket-failure",
          "no-champion",
          "final-failure",
          "missing-season",
          "invalid-dates",
          "bad-secret",
          "remote-guard",
        ].includes(scenario);
        assert.equal(code, fails ? 1 : 0, output);
        const commands = [...output.matchAll(/^COMMAND (.+)$/gm)].map(
          (m) => m[1],
        );
        const blocked = [
          "missing-season",
          "invalid-dates",
          "bad-secret",
          "remote-guard",
          "dry",
        ].includes(scenario);
        if (blocked) assert.deepEqual(commands, []);
        else {
          assert.ok(
            commands.includes("playwright:import:transactions"),
            output,
          );
          assert.ok(commands.includes("db:import:transactions"), output);
          if (["preseason", "offseason"].includes(scenario))
            assert.deepEqual(commands, [
              "playwright:import:transactions",
              "db:import:transactions",
            ]);
          if (["regular", "last-regular", "stats-failure"].includes(scenario))
            assert.ok(!commands.includes("playwright:sync:playoffs"), output);
          if (["regular", "last-regular"].includes(scenario))
            assert.ok(commands.includes("db:import:regular-results"), output);
          if (
            [
              "playoffs",
              "helsinki-transition",
              "last-playoff",
              "finalize",
              "refresh",
            ].includes(scenario)
          ) {
            assert.ok(
              commands.indexOf("playwright:sync:playoffs") <
                commands.indexOf("playwright:import:playoffs"),
              output,
            );
            assert.ok(commands.includes("db:import:finals-results"), output);
          }
        }
        const markers = new Set(
          (await db.execute("SELECT key FROM import_metadata")).rows.map((r) =>
            String(r.key),
          ),
        );
        if (scenario === "finalize") {
          assert.ok(markers.has(key("regular")));
          assert.ok(markers.has(key("playoffs")));
        }
        if (["regular", "last-regular", "stats-failure"].includes(scenario))
          assert.ok(!markers.has(key("regular")), output);
        if (scenario === "final-failure")
          assert.ok(markers.has(key("regular")), output);
        if (["last-playoff", "no-champion", "final-failure"].includes(scenario))
          assert.ok(!markers.has(key("playoffs")), output);
        if (!blocked)
          assert.ok(existsSync(path.join(cwd, "summary.md")), output);
        if (scenario === "dry")
          assert.ok(!existsSync(path.join(dir, "fantrax-auth.json")), output);
        assert.ok(
          !output.includes(env.FANTRAX_AUTH_STATE),
          "Auth secret must never be logged",
        );
        if (!blocked)
          assert.deepEqual(
            JSON.parse(
              readFileSync(path.join(dir, "fantrax-auth.json"), "utf8"),
            ),
            JSON.parse(
              gunzipSync(
                Buffer.from(env.FANTRAX_AUTH_STATE, "base64"),
              ).toString(),
            ),
          );
        if (scenario === "final-failure") {
          const retry = spawnSync(
            process.execPath,
            [
              "--import",
              import.meta.resolve("tsx"),
              fileURLToPath(import.meta.url),
              "--fixture",
              "finalize",
              timestamp,
            ],
            { cwd, env, encoding: "utf8", timeout: 15_000 },
          );
          assert.equal(retry.status, 0, retry.stdout + retry.stderr);
          assert.doesNotMatch(
            retry.stdout,
            /COMMAND playwright:import:regular/,
          );
          assert.ok(
            (
              await db.execute({
                sql: "SELECT value FROM import_metadata WHERE key = ?",
                args: [key("playoffs")],
              })
            ).rows.length === 1,
          );
        }
      } finally {
        db.close();
        rmSync(cwd, { recursive: true, force: true });
      }
    });
}
