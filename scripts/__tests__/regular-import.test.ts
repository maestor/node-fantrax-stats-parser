import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
import { chromium } from "playwright";
import { CURRENT_SEASON, TEAMS } from "../../src/config/index.js";

const csv = "ID,Player,GP\n*test*,Fixture Player,1\n";
const fileName = (team: (typeof TEAMS)[number]) =>
  `${team.name}-${team.id}-regular-${CURRENT_SEASON}-${CURRENT_SEASON + 1}.csv`;

// Run the real CLI in a separate process so an unhandled download rejection
// fails the scenario just as it would for an operator. No live Fantrax requests.
if (process.argv[2] === "--fixture") {
  const scenario = process.argv[3];
  const attempts = new Map<string, number>();
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (options) => {
    const browser = await launch(options);
    process.stdout.write("FIXTURE browser launched\n");
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (contextOptions) => {
      const context = await newContext(contextOptions);
      context.on("page", (page) => {
        const setDefaultTimeout = page.setDefaultTimeout.bind(page);
        // Shorten action timeouts while retaining actual Playwright failures.
        page.setDefaultTimeout = () => setDefaultTimeout(500);
        if (scenario === "download-timeout") {
          const waitForEvent = page.waitForEvent.bind(page);
          // This CLI waits only for downloads; exercise the real event timeout.
          page.waitForEvent = ((event: "download") =>
            waitForEvent(event, {
              timeout: 1_000,
            })) as typeof page.waitForEvent;
        }
        void page.exposeFunction("closeFixtureBrowser", () => browser.close());
        void page.route("**/*", async (route) => {
          const url = route.request().url();
          if (url.includes("/standings")) {
            await route.fulfill({
              contentType: "text/html",
              body: `<div class="league-standings-table">${TEAMS.slice(0, 2)
                .map(
                  (team) =>
                    `<a href="/team/roster;teamId=${team.id}">${team.presentName}</a>`,
                )
                .join("")}</div>`,
            });
            return;
          }
          const teamId = /teamId=([^;?&]+)/.exec(url)?.[1];
          assert.ok(teamId, `Unexpected fixture request: ${url}`);
          const attempt = (attempts.get(teamId) ?? 0) + 1;
          attempts.set(teamId, attempt);
          process.stdout.write(`FIXTURE roster ${teamId} attempt ${attempt}\n`);
          const fails =
            teamId === TEAMS[1].id &&
            (scenario === "exhausted" || attempt === 1);
          const closeBrowser = fails && scenario === "closed-browser";
          const noDownload = fails && scenario === "download-timeout";
          const disabled = fails && !closeBrowser && !noDownload;
          await route.fulfill({
            contentType: "text/html",
            body: `<button mattooltip="Download all as CSV" ${disabled ? "disabled" : ""}
              onclick="${closeBrowser ? "closeFixtureBrowser()" : noDownload ? "" : "downloadCsv()"}">Export</button>
              <script>function downloadCsv() {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([${JSON.stringify(csv)}], {type: 'text/csv'}));
                a.download = 'roster.csv'; a.click();
              }</script>`,
          });
        });
      });
      return context;
    };
    return browser;
  };
  process.argv = [
    process.argv[0],
    "import-league-regular",
    `--year=${CURRENT_SEASON}`,
    "--pause=0",
    "--out=downloads",
  ];
  await import("../../src/playwright/import-league-regular.js");
} else {
  for (const scenario of [
    "click-timeout",
    "download-timeout",
    "closed-browser",
    "exhausted",
  ]) {
    test(
      `regular importer recovers safely: ${scenario}`,
      { timeout: 60_000 },
      async () => {
        const cwd = mkdtempSync(path.join(tmpdir(), "regular-import-"));
        try {
          const artifacts = path.join(cwd, "src/playwright/.fantrax");
          mkdirSync(artifacts, { recursive: true });
          writeFileSync(
            path.join(artifacts, "fantrax-auth.json"),
            JSON.stringify({ cookies: [], origins: [] }),
          );
          writeFileSync(
            path.join(artifacts, "fantrax-leagues.json"),
            JSON.stringify({
              schemaVersion: 2,
              seasons: [
                {
                  year: CURRENT_SEASON,
                  leagueId: "fixture",
                  periods: {
                    regularStartDate: `${CURRENT_SEASON}-09-29`,
                    regularEndDate: `${CURRENT_SEASON + 1}-03-07`,
                  },
                },
              ],
            }),
          );
          const out = path.join(cwd, "downloads");
          mkdirSync(out);
          for (const team of TEAMS.slice(2))
            writeFileSync(path.join(out, fileName(team)), "existing CSV");

          const child = spawn(
            process.execPath,
            [
              "--import",
              import.meta.resolve("tsx"),
              fileURLToPath(import.meta.url),
              "--fixture",
              scenario,
            ],
            { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: 50_000 },
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

          assert.ok(existsSync(path.join(out, fileName(TEAMS[0]))), output);
          assert.equal(
            readFileSync(path.join(out, fileName(TEAMS[0])), "utf8"),
            csv,
            output,
          );
          assert.equal(
            existsSync(path.join(out, `${fileName(TEAMS[0])}.part`)),
            false,
          );
          assert.equal(
            readFileSync(path.join(out, fileName(TEAMS[2])), "utf8"),
            "existing CSV",
          );
          assert.equal(
            (
              output.match(
                new RegExp(`FIXTURE roster ${TEAMS[0].id} attempt`, "g"),
              ) ?? []
            ).length,
            1,
            output,
          );
          assert.doesNotMatch(
            output,
            /triggerUncaughtException|UnhandledPromiseRejection/,
            output,
          );
          if (scenario === "exhausted") {
            assert.equal(code, 1, output);
            assert.match(output, /failed after 3 attempts/i);
            assert.match(output, /locator.click: Timeout/);
            assert.equal(existsSync(path.join(out, fileName(TEAMS[1]))), false);
            assert.equal(
              (output.match(/FIXTURE browser launched/g) ?? []).length,
              3,
              output,
            );
            assert.doesNotMatch(output, /Done\. Downloaded|Running npm run/);
          } else {
            assert.equal(code, 0, output);
            assert.equal(
              readFileSync(path.join(out, fileName(TEAMS[1])), "utf8"),
              csv,
            );
            assert.equal(
              existsSync(path.join(out, `${fileName(TEAMS[1])}.part`)),
              false,
            );
            assert.equal(
              (output.match(/FIXTURE browser launched/g) ?? []).length,
              2,
              output,
            );
            assert.match(output, /attempt 2\/3/i);
            assert.match(output, /Done\. Downloaded 2 regular-season CSV/);
          }
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      },
    );
  }
}
