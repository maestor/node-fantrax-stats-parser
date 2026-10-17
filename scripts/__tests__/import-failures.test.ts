import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CURRENT_SEASON } from "../../src/config/index.js";

if (process.argv[2] === "--fixture") {
  const report = process.argv[3];
  const { chromium } = await import("playwright");
  chromium.launch = (async () => ({
    async newContext() {
      return {
        async route() {},
        async newPage() {
          return {
            setDefaultTimeout() {},
            setDefaultNavigationTimeout() {},
            on() {},
            off() {},
            async goto() {
              throw new Error("Fixture Fantrax unavailable");
            },
            waitForRequest() {
              return new Promise(() => {});
            },
          };
        },
      };
    },
    async close() {
      process.stdout.write("FIXTURE browser closed\n");
    },
  })) as unknown as typeof chromium.launch;
  process.argv = [
    process.argv[0],
    `sync-${report}`,
    `--year=${CURRENT_SEASON}`,
    "--strict",
  ];
  await import(`../../src/playwright/sync-${report}.js`);
} else {
  for (const report of ["regular", "playoffs", "finals"])
    test(`Strict ${report} sync rejects failed scrape and preserves mapping`, async () => {
      const cwd = mkdtempSync(path.join(tmpdir(), "strict-sync-"));
      const dir = path.join(cwd, "src/playwright/.fantrax");
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "fantrax-auth.json"), "{}");
        const mapping = {
          schemaVersion: 2,
          seasons: [
            {
              year: CURRENT_SEASON,
              leagueId: "fixture",
              periods: { playoffsStartDate: `${CURRENT_SEASON + 1}-03-08` },
            },
          ],
        };
        writeFileSync(
          path.join(dir, "fantrax-leagues.json"),
          JSON.stringify(mapping),
        );
        writeFileSync(
          path.join(dir, "fantrax-playoffs.json"),
          JSON.stringify({
            schemaVersion: 3,
            seasons: [
              {
                year: CURRENT_SEASON,
                leagueId: "fixture",
                teams: [{ id: "1", isChampion: true }],
              },
            ],
          }),
        );
        if (report !== "playoffs")
          writeFileSync(
            path.join(dir, `fantrax-${report}.json`),
            JSON.stringify({
              schemaVersion: 1,
              leagueName: "Fixture",
              seasons: [],
              scrapedAt: "previous",
            }),
          );
        const file = path.join(dir, `fantrax-${report}.json`);
        const previous = readFileSync(file, "utf8");
        const child = spawn(
          process.execPath,
          [
            "--import",
            import.meta.resolve("tsx"),
            fileURLToPath(import.meta.url),
            "--fixture",
            report,
          ],
          { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 },
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
        assert.equal(code, 1, output);
        assert.match(output, /FIXTURE browser closed/);
        assert.equal(readFileSync(file, "utf8"), previous, output);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  test("CSV pipeline returns failure and keeps source files when DB import fails", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "csv-pipeline-"));
    try {
      for (const dir of ["scripts", "bin", "csv/temp"])
        mkdirSync(path.join(cwd, dir), { recursive: true });
      copyFileSync(
        fileURLToPath(new URL("../import-temp-csv.sh", import.meta.url)),
        path.join(cwd, "scripts/import-temp-csv.sh"),
      );
      writeFileSync(
        path.join(cwd, "scripts/handle-csv.sh"),
        '#!/bin/bash\ncp "$1" "$2"\n',
        { mode: 0o755 },
      );
      writeFileSync(path.join(cwd, "bin/npm"), "#!/bin/bash\nexit 1\n", {
        mode: 0o755,
      });
      const input = path.join(
        cwd,
        `csv/temp/fixture-1-regular-${CURRENT_SEASON}-${CURRENT_SEASON + 1}.csv`,
      );
      writeFileSync(input, "fixture CSV");
      const result = spawnSync("bash", ["scripts/import-temp-csv.sh"], {
        cwd,
        env: {
          ...process.env,
          PATH: `${cwd}/bin:${process.env.PATH}`,
          USE_R2_STORAGE: "false",
        },
        encoding: "utf8",
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.ok(existsSync(input));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  test("CSV pipeline preserves an explicit database target over .env", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "csv-target-"));
    try {
      mkdirSync(path.join(cwd, "scripts"));
      writeFileSync(
        path.join(cwd, ".env"),
        "USE_REMOTE_DB=true\nUSE_R2_STORAGE=true\n",
      );
      writeFileSync(
        path.join(cwd, "scripts/import-temp-csv.sh"),
        '#!/bin/bash\nprintf "target=%s storage=%s" "$USE_REMOTE_DB" "$USE_R2_STORAGE"\n',
      );
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          fileURLToPath(new URL("../import-temp-csv.ts", import.meta.url)),
        ],
        {
          cwd,
          env: {
            ...process.env,
            USE_REMOTE_DB: "false",
            USE_R2_STORAGE: "false",
          },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /target=false storage=false/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  test("Stats CLI returns failure when a CSV cannot be parsed", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "stats-failure-"));
    try {
      mkdirSync(path.join(cwd, "scripts"));
      mkdirSync(path.join(cwd, "csv/1"), { recursive: true });
      copyFileSync(
        fileURLToPath(new URL("../handle-csv.sh", import.meta.url)),
        path.join(cwd, "scripts/handle-csv.sh"),
      );
      writeFileSync(
        path.join(
          cwd,
          `csv/1/regular-${CURRENT_SEASON}-${CURRENT_SEASON + 1}.csv`,
        ),
        '"unterminated',
      );
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          fileURLToPath(new URL("../import-stats-to-db.ts", import.meta.url)),
          `--season=${CURRENT_SEASON}`,
          "--report-type=regular",
          "--team-id=1",
        ],
        {
          cwd,
          env: {
            ...process.env,
            USE_REMOTE_DB: "false",
            USE_R2_SNAPSHOTS: "false",
          },
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /Stats import failed for 1 CSV/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
