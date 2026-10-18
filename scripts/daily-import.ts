import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { CURRENT_SEASON } from "../src/config/index.js";
import { getDbClient } from "../src/db/client.js";

dotenv.config({ quiet: true });

type Periods = {
  regularStartDate: string;
  regularEndDate: string;
  playoffsStartDate: string;
  playoffsEndDate: string;
};
type Season = { year: number; leagueId: string; periods: Periods };
type Stage = { name: string; status: "success" | "failed" };
const artifactDir = path.resolve("src/playwright/.fantrax");
const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};
const marker = (phase: string): string =>
  `daily-import:${CURRENT_SEASON}:${phase}-finalized`;

const readSeason = (): Season => {
  const mapping = JSON.parse(
    readFileSync(path.join(artifactDir, "fantrax-leagues.json"), "utf8"),
  ) as { schemaVersion: number; seasons: Season[] };
  const matches = mapping.seasons?.filter((s) => s.year === CURRENT_SEASON);
  if (
    mapping.schemaVersion !== 2 ||
    matches?.length !== 1 ||
    !matches[0].leagueId?.trim()
  ) {
    throw new Error(
      `Missing or ambiguous league mapping for CURRENT_SEASON=${CURRENT_SEASON}. Include its league ID and dates in the season rollover contribution.`,
    );
  }
  const season = matches[0];
  const dates = [
    season.periods?.regularStartDate,
    season.periods?.regularEndDate,
    season.periods?.playoffsStartDate,
    season.periods?.playoffsEndDate,
  ];
  if (
    dates.some(
      (d) =>
        !d ||
        !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
        Number.isNaN(Date.parse(`${d}T00:00:00Z`)) ||
        new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d,
    ) ||
    !(dates[0] <= dates[1] && dates[1] < dates[2] && dates[2] <= dates[3])
  ) {
    throw new Error(
      `Invalid season dates for CURRENT_SEASON=${CURRENT_SEASON}.`,
    );
  }
  return season;
};

const restoreAuth = (): void => {
  const secret = process.env.FANTRAX_AUTH_STATE;
  const authPath = path.join(artifactDir, "fantrax-auth.json");
  if (secret) {
    let json: string;
    try {
      const encoded = secret.trim();
      if (encoded.length > 48 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
        throw new Error();
      json = gunzipSync(Buffer.from(encoded, "base64"), {
        maxOutputLength: 8 * 1024 * 1024,
      }).toString("utf8");
      const state = JSON.parse(json) as {
        cookies?: unknown;
        origins?: unknown;
      };
      if (!Array.isArray(state.cookies) || !Array.isArray(state.origins))
        throw new Error();
    } catch {
      throw new Error(
        "Invalid FANTRAX_AUTH_STATE. Renew it using npm run playwright:login and copy fantrax-auth-secret.txt into the Actions secret.",
      );
    }
    mkdirSync(artifactDir, { recursive: true });
    if (existsSync(authPath)) chmodSync(authPath, 0o600);
    writeFileSync(authPath, json, { mode: 0o600 });
  }
  if (!existsSync(authPath))
    throw new Error(
      "Missing Fantrax session. Run npm run playwright:login or configure FANTRAX_AUTH_STATE.",
    );
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (
    args.some(
      (arg) =>
        !["--dry-run", "--require-remote", "--refresh-finalized"].includes(arg),
    )
  )
    throw new Error(
      "Supported options: --dry-run, --require-remote, --refresh-finalized.",
    );
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--refresh-finalized");
  const season = readSeason();
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)?.value)
    .join("-");
  const {
    regularStartDate,
    regularEndDate,
    playoffsStartDate,
    playoffsEndDate,
  } = season.periods;
  log(
    `Daily import: ${CURRENT_SEASON}-${CURRENT_SEASON + 1}, Helsinki date ${today}.`,
  );
  if (dryRun) {
    log(
      `Regular: ${today >= regularStartDate ? "active or awaiting finalization" : "not started"}; playoffs: ${today >= playoffsStartDate ? "active or awaiting finalization" : "not started"}; transactions: every day.`,
    );
    log(
      "Dry run: no session files, database access, downloads, or imports. Finalization checkpoints are not read.",
    );
    return;
  }
  if (args.includes("--require-remote")) {
    const missing = [
      "TURSO_DATABASE_URL",
      "TURSO_AUTH_TOKEN",
      "R2_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_SNAPSHOT_BUCKET_NAME",
      "FANTRAX_AUTH_STATE",
    ].filter((name) => !process.env[name]?.trim());
    if (missing.length)
      throw new Error(
        `Missing hosted configuration: ${missing.join(", ")}. Check the production environment secrets/variables and the workflow's environment selection.`,
      );
    if (process.env.USE_REMOTE_DB !== "true")
      throw new Error("Hosted imports require USE_REMOTE_DB=true.");
    if (!/^(libsql|https):\/\//.test(process.env.TURSO_DATABASE_URL ?? ""))
      throw new Error(
        "TURSO_DATABASE_URL must be a remote libsql:// or https:// URL for hosted imports.",
      );
    if (process.env.USE_R2_SNAPSHOTS !== "true")
      throw new Error("Hosted imports require USE_R2_SNAPSHOTS=true.");
  }
  if (process.env.RAW_UPLOAD?.toLowerCase() === "true")
    throw new Error(
      "Daily imports require RAW_UPLOAD=false so downloads reach the database.",
    );
  process.env.TZ = "Europe/Helsinki";
  if (process.env.USE_REMOTE_DB !== "true") {
    process.env.TURSO_DATABASE_URL = "file:local.db";
    delete process.env.TURSO_AUTH_TOKEN;
  }
  restoreAuth();
  const db = getDbClient();
  const stages: Stage[] = [];
  const run = (script: string, ...flags: string[]): void => {
    log(`Running ${script} ${flags.join(" ")}`);
    const result = spawnSync(
      "npm",
      ["run", "--ignore-scripts", script, "--", ...flags],
      { stdio: "inherit", env: process.env },
    );
    if (result.error || result.status !== 0)
      throw new Error(
        `${script} failed (${result.signal ?? result.status ?? "could not start"}).`,
      );
  };
  const stage = async (
    name: string,
    action: () => void | Promise<void>,
  ): Promise<boolean> => {
    try {
      await action();
      stages.push({ name, status: "success" });
      return true;
    } catch (error) {
      stages.push({ name, status: "failed" });
      process.stderr.write(
        `${name}: ${error instanceof Error ? error.message : "failed"}\n`,
      );
      return false;
    }
  };
  const complete = async (phase: string): Promise<void> => {
    await db.execute({
      sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
      args: [marker(phase), new Date().toISOString()],
    });
  };
  try {
    const stored = await db.execute({
      sql: "SELECT key FROM import_metadata WHERE key IN (?, ?)",
      args: [marker("regular"), marker("playoffs")],
    });
    const done = new Set(force ? [] : stored.rows.map((r) => String(r.key)));
    const regularDue =
      today >= regularStartDate &&
      (today <= regularEndDate || !done.has(marker("regular")));
    const playoffsDue =
      today >= playoffsStartDate &&
      (today <= playoffsEndDate || !done.has(marker("playoffs")));
    const bracketDue = playoffsDue || (regularDue && today > regularEndDate);
    let bracket: { teams: { isChampion?: boolean }[] } | undefined;
    const bracketOk =
      !bracketDue ||
      (await stage("Playoff mapping", () => {
        run("playwright:sync:playoffs", `--year=${CURRENT_SEASON}`, "--strict");
        const mapping = JSON.parse(
          readFileSync(path.join(artifactDir, "fantrax-playoffs.json"), "utf8"),
        ) as { seasons: { year: number; teams: { isChampion?: boolean }[] }[] };
        bracket = mapping.seasons.find((s) => s.year === CURRENT_SEASON);
        if (bracket?.teams.length !== 16)
          throw new Error(
            "Current-season playoff mapping must contain 16 teams.",
          );
      }));
    if (regularDue)
      await stage("Regular stats and standings", async () => {
        run(
          "playwright:import:regular",
          `--year=${CURRENT_SEASON}`,
          "--out=./csv/temp/",
          "--strict",
        );
        if (today > regularEndDate && !bracketOk)
          throw new Error(
            "Regular finalization needs a successful current-season playoff mapping to identify the regular champion.",
          );
        run("playwright:sync:regular", `--year=${CURRENT_SEASON}`, "--strict");
        run("db:import:regular-results", `--season=${CURRENT_SEASON}`);
        if (today > regularEndDate) await complete("regular");
      });
    if (playoffsDue)
      await stage("Playoff stats, results and finals", async () => {
        if (!bracketOk || !bracket)
          throw new Error(
            "Playoff imports need a successful current-season mapping.",
          );
        // Explicit year intentionally imports every team, including eliminated teams missed during a failed run.
        run(
          "playwright:import:playoffs",
          `--year=${CURRENT_SEASON}`,
          "--out=./csv/temp/",
        );
        run("db:import:playoff-results", `--season=${CURRENT_SEASON}`);
        const champions = bracket.teams.filter((t) => t.isChampion).length;
        if (champions > 1)
          throw new Error("Playoff mapping has more than one champion.");
        if (champions === 1) {
          run("playwright:sync:finals", `--year=${CURRENT_SEASON}`, "--strict");
          run("db:import:finals-results", `--season=${CURRENT_SEASON}`);
        } else if (today > playoffsEndDate)
          throw new Error(
            "Champion not available yet; playoff finalization will retry on the next run.",
          );
        if (today > playoffsEndDate) await complete("playoffs");
      });
    await stage("Transactions", () => {
      run(
        "playwright:import:transactions",
        `--year=${CURRENT_SEASON}`,
        "--out=./csv/transactions/",
      );
      // Explicit download year disables its auto-import; this retains current-season incremental DB import.
      run("db:import:transactions", "--current-only");
    });
    if (stages.every((s) => s.status === "success"))
      await db.execute({
        sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES (?, ?)",
        args: [
          `daily-import:${CURRENT_SEASON}:last-success`,
          new Date().toISOString(),
        ],
      });
    const summary = [
      `Daily import — season ${CURRENT_SEASON}-${CURRENT_SEASON + 1}, Helsinki ${today}`,
      ...stages.map((s) => `- ${s.name}: ${s.status}`),
    ].join("\n");
    log(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    if (stages.some((s) => s.status === "failed")) process.exitCode = 1;
  } finally {
    db.close();
  }
};

await main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Daily import failed."}\n`,
  );
  process.exitCode = 1;
});
