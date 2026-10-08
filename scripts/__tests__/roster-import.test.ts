import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CURRENT_SEASON, TEAMS } from "../../src/config/index.js";

const csv =
  '"","Skaters"\n"ID","Pos","Player","Team","Eligible","Status","Age","Opponent","GP","G","A","Pt","+/-","PIM","SOG","PPP","SHP","Hit","Blk"\n"*00qs7*","F","Jamie Benn","DAL","F","Act","37","","3","1","1","2","1","0","6","0","0","3","1"\n"","Goalies"\n"ID","Pos","Player","Team","Eligible","Status","Age","Opponent","GP","W-G","GAA","SV","SV%","SHO","PIM","G","A","Pt","PPP","SHP"\n"*0457k*","G","Jake Oettinger","DAL","G","Act","27","","2","1","1.01","33",".943","1","0","0","0","0","0","0"\n';
const fileName = (team: (typeof TEAMS)[number], year: number, report: string) =>
  `${team.name}-${team.id}-${report}-${year}-${year + 1}.csv`;

if (process.argv[2] === "--fixture") {
  const [scenario, report, yearString, outDir] = process.argv.slice(3);
  const year = Number(yearString);
  // An import must never start a browser, even if Chromium happens to be installed.
  const { chromium } = await import("playwright");
  chromium.launch = async () => {
    throw new Error("Browser launch forbidden in HTTP import tests");
  };
  const attempts = new Map<string, number>();
  let active = 0;
  let maxActive = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("cookie"), "session=fixture");
    assert.equal(init?.redirect, "error");
    assert.ok(headers.get("user-agent"));
    if (url.pathname.endsWith("getLeagueInfo")) {
      process.stdout.write("FIXTURE league metadata\n");
      assert.equal(url.searchParams.get("leagueId"), "fixture-league");
      return Response.json({
        teamInfo: Object.fromEntries(
          TEAMS.slice(0, 2).map((team) => [
            `remote-${team.id}`,
            { id: `remote-${team.id}`, name: team.presentName },
          ]),
        ),
      });
    }
    assert.equal(url.pathname, "/fxpa/downloadTeamRosterStats");
    const teamId = url.searchParams.get("teamId");
    assert.ok(teamId);
    assert.equal(url.searchParams.get("statsType"), "3");
    assert.equal(url.searchParams.get("timeframeTypeCode"), "BY_DATE");
    assert.equal(
      url.searchParams.get("startDate"),
      `${year + (report === "playoffs" ? 1 : 0)}-${report === "playoffs" ? "03-08" : "09-29"}`,
    );
    assert.equal(
      url.searchParams.get("endDate"),
      `${year + 1}-${report === "playoffs" ? (teamId === "remote-1" ? "03-14" : "04-04") : "03-07"}`,
    );
    assert.equal(
      url.searchParams.get("seasonOrProjection"),
      year === CURRENT_SEASON && report === "regular"
        ? "SEASON_31n_YEAR_TO_DATE"
        : null,
    );
    const attempt = (attempts.get(teamId) ?? 0) + 1;
    attempts.set(teamId, attempt);
    process.stdout.write(`FIXTURE export ${teamId} attempt ${attempt}\n`);
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 30));
    active--;
    if (teamId === "remote-2") {
      if (scenario === "expired")
        return new Response("Login required", { status: 401 });
      if (scenario === "invalid-csv" && attempt === 1)
        return Response.json({ error: "Not a roster export" });
      if (scenario === "truncated" && attempt === 1)
        return new Response(csv.slice(0, -5));
      if (scenario === "exhausted" || (scenario === "retry" && attempt === 1))
        return new Response("Temporary error", { status: 503 });
    }
    return new Response(csv, {
      headers: { "content-type": "application/csv" },
    });
  };
  childProcess.spawnSync = ((
    command: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv },
  ) => {
    assert.equal(command, "npm");
    assert.equal(args[1], "parseAndUploadCsv");
    assert.equal(options.env.IMPORT_SEASON_START_YEAR, String(year));
    assert.equal(options.env.IMPORT_REPORT_TYPE, report);
    process.stdout.write(`FIXTURE pipeline ${year} ${report}\n`);
    return { status: 0 };
  }) as typeof childProcess.spawnSync;
  syncBuiltinESMExports();
  process.argv = [
    process.argv[0],
    `import-league-${report}`,
    ...(scenario === "remaining" ? [] : [`--year=${year}`]),
    "--pause=0",
    "--concurrency=2",
    `--out=${outDir}`,
  ];
  await import(`../../src/playwright/import-league-${report}.js`);
  process.stdout.write(`FIXTURE maximum concurrent exports ${maxActive}\n`);
} else {
  for (const [scenario, report, year, defaultOut] of [
    ["retry", "regular", CURRENT_SEASON, false],
    ["success", "regular", 2012, true],
    ["success", "playoffs", 2012, true],
    ["invalid-csv", "playoffs", 2025, false],
    ["truncated", "regular", CURRENT_SEASON, false],
    ["exhausted", "regular", CURRENT_SEASON, true],
    ["expired", "playoffs", 2025, true],
    ["existing", "regular", 2012, false],
    ["remaining", "playoffs", 2012, false],
  ] as const) {
    test(
      `roster import: ${report} ${year} ${scenario}`,
      { timeout: 30_000 },
      async () => {
        const cwd = mkdtempSync(path.join(tmpdir(), "roster-import-"));
        try {
          const artifacts = path.join(cwd, "src/playwright/.fantrax");
          mkdirSync(artifacts, { recursive: true });
          writeFileSync(
            path.join(cwd, "package.json"),
            JSON.stringify({
              scripts: {
                parseAndUploadCsv: "fixture",
                parseAndUploadRawCsv: "fixture",
              },
            }),
          );
          writeFileSync(
            path.join(artifacts, "fantrax-auth.json"),
            JSON.stringify({
              cookies: [
                {
                  name: "session",
                  value: "fixture",
                  domain: ".fantrax.com",
                  path: "/",
                  expires: -1,
                  secure: true,
                },
                {
                  name: "expired",
                  value: "do-not-send",
                  domain: ".fantrax.com",
                  path: "/",
                  expires: 1,
                },
                {
                  name: "foreign",
                  value: "do-not-send",
                  domain: ".evilfantrax.com",
                  path: "/",
                  expires: -1,
                },
                {
                  name: "other-path",
                  value: "do-not-send",
                  domain: ".fantrax.com",
                  path: "/profile",
                  expires: -1,
                },
              ],
              origins: [],
            }),
          );
          writeFileSync(
            path.join(artifacts, "fantrax-leagues.json"),
            JSON.stringify({
              schemaVersion: 2,
              seasons: [
                {
                  year,
                  leagueId: "fixture-league",
                  periods: {
                    regularStartDate: `${year}-09-29`,
                    regularEndDate: `${year + 1}-03-07`,
                  },
                },
              ],
            }),
          );
          writeFileSync(
            path.join(artifacts, "fantrax-playoffs.json"),
            JSON.stringify({
              schemaVersion: 3,
              seasons: [
                {
                  year,
                  leagueId: "fixture-league",
                  teams: TEAMS.slice(0, 2).map((team, index) => ({
                    ...team,
                    rosterTeamId: `remote-${team.id}`,
                    startDate: `${year + 1}-03-08`,
                    endDate: `${year + 1}-${index === 0 ? "03-14" : "04-04"}`,
                  })),
                },
              ],
            }),
          );
          const outDir = defaultOut ? "csv/temp" : "downloads";
          const out = path.join(cwd, outDir);
          mkdirSync(out, { recursive: true });
          for (const team of TEAMS.slice(scenario === "existing" ? 0 : 2))
            writeFileSync(
              path.join(out, fileName(team, year, report)),
              "existing CSV",
            );
          const child = spawn(
            process.execPath,
            [
              "--import",
              import.meta.resolve("tsx"),
              fileURLToPath(import.meta.url),
              "--fixture",
              scenario,
              report,
              String(year),
              outDir,
            ],
            { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: 25_000 },
          );
          let output = "";
          child.stdout.on("data", (data) => {
            output += String(data);
          });
          child.stderr.on("data", (data) => {
            output += String(data);
          });
          const code = await new Promise<number | null>((resolve, reject) => {
            child.once("error", reject);
            child.once("close", resolve);
          });
          const fails = scenario === "exhausted" || scenario === "expired";
          assert.equal(code, fails ? 1 : 0, output);
          assert.doesNotMatch(
            output,
            /Browser launch forbidden|UnhandledPromiseRejection|do-not-send/,
          );
          if (scenario === "remaining") {
            assert.doesNotMatch(
              output,
              /FIXTURE export|FIXTURE league metadata|FIXTURE pipeline/,
            );
            assert.match(output, /No remaining playoff teams/);
            assert.equal(
              existsSync(path.join(out, fileName(TEAMS[0], year, report))),
              false,
            );
            return;
          }
          assert.equal(
            readFileSync(
              path.join(out, fileName(TEAMS[0], year, report)),
              "utf8",
            ),
            scenario === "existing" ? "existing CSV" : csv,
            output,
          );
          assert.equal(
            existsSync(path.join(out, fileName(TEAMS[1], year, report))),
            !fails,
          );
          for (const team of TEAMS.slice(0, 2))
            assert.equal(
              existsSync(
                path.join(out, `${fileName(team, year, report)}.part`),
              ),
              false,
            );
          if (scenario === "existing")
            assert.doesNotMatch(
              output,
              /FIXTURE export|FIXTURE league metadata/,
            );
          else if (scenario !== "expired")
            assert.match(output, /FIXTURE maximum concurrent exports 2/);
          if (
            scenario === "retry" ||
            scenario === "invalid-csv" ||
            scenario === "truncated"
          )
            assert.match(output, /remote-2 attempt 2/);
          if (fails) {
            assert.doesNotMatch(output, /FIXTURE pipeline/);
            assert.match(
              output,
              scenario === "expired"
                ? /saved.*session|login/i
                : /failed after 3 attempts/i,
            );
          } else if (defaultOut)
            assert.match(
              output,
              new RegExp(`FIXTURE pipeline ${year} ${report}`),
            );
          else assert.doesNotMatch(output, /FIXTURE pipeline/);
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      },
    );
  }
}
