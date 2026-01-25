import { chromium, type Browser } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";

import { DEFAULT_CSV_OUT_DIR } from "../constants";

import {
  AUTH_STATE_PATH,
  buildRosterCsvFileName,
  buildRosterCsvPath,
  buildRosterUrlForSeason,
  downloadRosterCsv,
  FANTRAX_ARTIFACT_DIR,
  hasFlag,
  installRequestBlocking,
  parseNumberArg,
  parseStringArg,
  requireAuthStateFile,
  sleep,
  type TeamRun,
} from "./helpers";

type PlayoffsTeamRunV2 = TeamRun & {
  rosterTeamId: string;
};

type PlayoffsSeasonV2 = {
  year: number;
  leagueId: string;
  teams: PlayoffsTeamRunV2[];
};

type PlayoffsFileV2 = {
  schemaVersion: 2;
  leagueName: string;
  scrapedAt: string;
  seasons: PlayoffsSeasonV2[];
};

type ImportLeaguePlayoffsOptions = {
  headless: boolean;
  slowMoMs: number;
  pauseBetweenMs: number;
  outDir: string;
  year: number;
  leagueId: string;
  teams: PlayoffsTeamRunV2[];
};

const PLAYOFFS_PATH = path.join(FANTRAX_ARTIFACT_DIR, "fantrax-playoffs.json");

const readPlayoffsFileV2 = (): PlayoffsFileV2 => {
  if (!existsSync(PLAYOFFS_PATH)) {
    throw new Error(`Missing ${PLAYOFFS_PATH}. Run npm run playwright:sync:playoffs first.`);
  }

  const parsed: unknown = JSON.parse(readFileSync(PLAYOFFS_PATH, "utf8"));
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid playoffs mapping file: ${PLAYOFFS_PATH}`);
  }

  const file = parsed as Partial<PlayoffsFileV2>;
  if (file.schemaVersion !== 2 || !Array.isArray(file.seasons)) {
    throw new Error(
      `Unsupported playoffs mapping schema in ${PLAYOFFS_PATH}. Expected schemaVersion 2. ` +
        `Re-run npm run playwright:sync:playoffs to regenerate it.`
    );
  }

  return parsed as PlayoffsFileV2;
};

const parseImportLeaguePlayoffsOptions = (argv: string[]): ImportLeaguePlayoffsOptions => {
  const headless = !hasFlag(argv, "--headed");
  const slowMoMs = parseNumberArg(argv, "--slowmo") ?? 0;
  const pauseBetweenMs = parseNumberArg(argv, "--pause") ?? 250;
  const outDir =
    parseStringArg(argv, "--out") ??
    process.env.CSV_OUT_DIR?.trim() ??
    DEFAULT_CSV_OUT_DIR;

  const file = readPlayoffsFileV2();

  const availableYears = file.seasons
    .map((s) => s.year)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);

  const yearArg = parseStringArg(argv, "--year") ?? argv.find((a) => !a.startsWith("-"));
  const yearFallback = availableYears.length ? availableYears[0] : NaN;
  const year = yearArg ? Number(yearArg) : yearFallback;
  if (!Number.isFinite(year)) {
    throw new Error(`Invalid year: ${String(yearArg)}`);
  }

  const season = file.seasons.find((s) => s.year === year);
  if (!season) {
    throw new Error(
      `Missing playoffs mapping for year ${year} in ${PLAYOFFS_PATH}. ` +
        `Run npm run playwright:sync:playoffs -- --year=${year} to generate it.`
    );
  }

  const teams = season.teams.slice().sort((a, b) => a.id.localeCompare(b.id));
  const missingIds = teams.filter((t) => !t.rosterTeamId).map((t) => t.presentName);
  if (missingIds.length) {
    throw new Error(
      `Playoffs mapping is missing rosterTeamId for ${missingIds.length} team(s): ${missingIds.join(", ")}. ` +
        `Re-run npm run playwright:sync:playoffs -- --year=${year} to regenerate it.`
    );
  }

  return {
    headless,
    slowMoMs,
    pauseBetweenMs,
    outDir,
    year,
    leagueId: season.leagueId,
    teams,
  };
};

const main = async (): Promise<void> => {
  const options = parseImportLeaguePlayoffsOptions(process.argv.slice(2));
  requireAuthStateFile();
  mkdirSync(path.resolve(options.outDir), { recursive: true });

  const browser: Browser = await chromium.launch({
    headless: options.headless,
    slowMo: options.slowMoMs,
  });

  try {
    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      acceptDownloads: true,
    });

    await installRequestBlocking(context);

    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    let downloaded = 0;
    for (const team of options.teams) {
      const fileName = buildRosterCsvFileName({
        teamSlug: team.name,
        teamId: team.id,
        year: options.year,
        kind: "playoffs",
      });
      const outPath = buildRosterCsvPath({
        outDir: options.outDir,
        teamSlug: team.name,
        teamId: team.id,
        year: options.year,
        kind: "playoffs",
      });
      if (existsSync(outPath)) {
        console.info(`[${team.name}] already exists (${path.join(options.outDir, fileName)}); skipping.`);
        continue;
      }

      const rosterUrl = buildRosterUrlForSeason({
        leagueId: options.leagueId,
        rosterTeamId: team.rosterTeamId,
        startDate: team.startDate,
        endDate: team.endDate,
      });

      console.info(`[${team.name}] goto ${rosterUrl}`);
      await page.goto(rosterUrl, { waitUntil: "domcontentloaded" });

      const savedTo = await downloadRosterCsv(page, team.name, team.id, options.outDir, options.year, "playoffs");
      console.info(`[${team.name}] saved ${savedTo}`);
      downloaded++;

      if (options.pauseBetweenMs > 0) {
        await sleep(options.pauseBetweenMs);
      }
    }

    console.info(`Done. Downloaded ${downloaded} playoffs CSV file(s).`);
  } finally {
    await browser.close();
  }
};

void main();
