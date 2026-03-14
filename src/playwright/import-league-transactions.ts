import { spawnSync } from "child_process";
import { chromium, type Browser } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import path from "path";

import {
  DEFAULT_TRANSACTIONS_OUT_DIR,
  TRANSACTION_TYPES,
  buildTransactionCsvPath,
  buildTransactionHistoryUrl,
  formatSeasonSpan,
  resolveTransactionImportYears,
} from "../transactions";
import {
  AUTH_STATE_PATH,
  downloadCsvFromPage,
  hasFlag,
  installRequestBlocking,
  parseNumberArg,
  parseStringArg,
  readLeagueYearInfos,
  requireAuthStateFile,
  sleep,
  type LeagueYearInfo,
} from "./helpers";

type ImportLeagueTransactionsOptions = {
  headless: boolean;
  slowMoMs: number;
  pauseBetweenMs: number;
  retryCount: number;
  retryDelayMs: number;
  outDir: string;
  seasons: LeagueYearInfo[];
  autoImportToDb: boolean;
};

const parseImportLeagueTransactionsOptions = (
  argv: string[],
): ImportLeagueTransactionsOptions => {
  const headless = !hasFlag(argv, "--headed");
  const slowMoMs = parseNumberArg(argv, "--slowmo") ?? 0;
  const pauseBetweenMs = parseNumberArg(argv, "--pause") ?? 250;
  const retryCount = Math.max(0, Math.trunc(parseNumberArg(argv, "--retries") ?? 2));
  const retryDelayMs = Math.max(
    0,
    Math.trunc(parseNumberArg(argv, "--retry-delay") ?? 2_000),
  );
  const outDir =
    parseStringArg(argv, "--out") ?? DEFAULT_TRANSACTIONS_OUT_DIR;
  const importAll = hasFlag(argv, "--all");
  const requestedYear =
    parseStringArg(argv, "--year") ?? argv.find((arg) => !arg.startsWith("-"));
  const autoImportToDb = !requestedYear && !importAll;

  const leagueSeasons = readLeagueYearInfos();
  const selectedYears = resolveTransactionImportYears({
    availableYears: leagueSeasons.map((season) => season.year),
    importAll,
    requestedYear,
  });
  const seasonByYear = new Map(
    leagueSeasons.map((season) => [season.year, season] as const),
  );
  const seasons = selectedYears.map((year) => {
    const season = seasonByYear.get(year);
    if (!season) {
      throw new Error(`Missing league ID mapping for year ${year}.`);
    }
    return season;
  });

  if (!requestedYear && !importAll) {
    console.info(
      `No --year provided; defaulting to most recent mapped season: ${selectedYears[0]}.`,
    );
  }

  return {
    headless,
    slowMoMs,
    pauseBetweenMs,
    retryCount,
    retryDelayMs,
    outDir,
    seasons,
    autoImportToDb,
  };
};

const getPackageJsonScripts = (repoRoot: string): Record<string, string> | undefined => {
  const packageJsonPath = path.resolve(repoRoot, "package.json");
  const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
  const packageJsonParsed: unknown = JSON.parse(packageJsonRaw);

  return typeof packageJsonParsed === "object" && packageJsonParsed
    ? (packageJsonParsed as { scripts?: Record<string, string> }).scripts
    : undefined;
};

const runPackageScript = (repoRoot: string, scriptName: string, scriptArgs: string[]): void => {
  const packageJsonScripts = getPackageJsonScripts(repoRoot);

  if (!packageJsonScripts?.[scriptName]) {
    throw new Error(`Missing npm script ${scriptName} in package.json.`);
  }

  console.info(`Running npm run ${scriptName} ...`);
  const result = spawnSync("npm", ["run", scriptName, ...scriptArgs], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(
      `npm run ${scriptName} failed with exit code ${result.status}`,
    );
  }
};

const downloadTransactionCsvWithRetry = async (args: {
  browser: Browser;
  season: LeagueYearInfo;
  type: (typeof TRANSACTION_TYPES)[number];
  outDir: string;
  retryCount: number;
  retryDelayMs: number;
}): Promise<string> => {
  const totalAttempts = args.retryCount + 1;
  const seasonLabel = formatSeasonSpan(args.season.year);
  const historyUrl = buildTransactionHistoryUrl({
    leagueId: args.season.leagueId,
    type: args.type,
  });
  const filePath = buildTransactionCsvPath({
    outDir: args.outDir,
    type: args.type,
    seasonStartYear: args.season.year,
  });

  let lastError: unknown;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const context = await args.browser.newContext({
      storageState: AUTH_STATE_PATH,
      acceptDownloads: true,
    });

    try {
      await installRequestBlocking(context);

      const page = await context.newPage();
      page.setDefaultTimeout(30_000);

      const attemptNote =
        totalAttempts > 1 ? ` (attempt ${attempt}/${totalAttempts})` : "";
      console.info(`[${seasonLabel}] ${args.type}: goto ${historyUrl}${attemptNote}`);
      await page.goto(historyUrl, { waitUntil: "domcontentloaded" });

      if (page.url().includes("/login")) {
        throw new Error(
          `Redirected to login while loading ${args.type} transactions for ${seasonLabel}. ` +
            `Run npm run playwright:login first.`,
        );
      }

      return await downloadCsvFromPage(page, filePath);
    } catch (error) {
      lastError = error;

      if (attempt >= totalAttempts) {
        break;
      }

      const details =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[${seasonLabel}] ${args.type}: attempt ${attempt}/${totalAttempts} failed: ${details}`,
      );
      if (args.retryDelayMs > 0) {
        console.info(
          `[${seasonLabel}] ${args.type}: retrying in ${args.retryDelayMs}ms...`,
        );
        await sleep(args.retryDelayMs);
      }
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  const details =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `[${seasonLabel}] ${args.type}: failed after ${totalAttempts} attempt(s). Last error: ${details}`,
  );
};

const runTransactionsUploadIfEnabled = (
  outDir: string,
  seasons: readonly LeagueYearInfo[],
): void => {
  const useR2Storage = process.env.USE_R2_STORAGE?.trim().toLowerCase() === "true";
  if (!useR2Storage) {
    return;
  }

  const repoRoot = process.cwd();
  const expectedOutDir = DEFAULT_TRANSACTIONS_OUT_DIR;
  const resolvedOutDir = path.resolve(outDir);

  if (resolvedOutDir !== expectedOutDir) {
    console.info(
      `Skipping R2 upload because --out is ${resolvedOutDir} (expected ${expectedOutDir}). ` +
        `Run npm run r2:upload:transactions manually if you want to upload a custom directory.`,
    );
    return;
  }

  const scriptArgs =
    seasons.length === 1 ? ["--", `--season=${seasons[0].year}`] : [];
  runPackageScript(repoRoot, "r2:upload:transactions", scriptArgs);
};

const runTransactionsDbImportIfEnabled = (
  outDir: string,
  autoImportToDb: boolean,
): void => {
  if (!autoImportToDb) {
    return;
  }

  const repoRoot = process.cwd();
  const expectedOutDir = DEFAULT_TRANSACTIONS_OUT_DIR;
  const resolvedOutDir = path.resolve(outDir);

  if (resolvedOutDir !== expectedOutDir) {
    console.info(
      `Skipping post-import DB import because --out is ${resolvedOutDir} (expected ${expectedOutDir}). ` +
        `Run npm run db:import:transactions manually if you want to import a custom directory.`,
    );
    return;
  }

  runPackageScript(repoRoot, "db:import:transactions", []);
};

const main = async (): Promise<void> => {
  const options = parseImportLeagueTransactionsOptions(process.argv.slice(2));
  requireAuthStateFile();
  mkdirSync(path.resolve(options.outDir), { recursive: true });

  const browser: Browser = await chromium.launch({
    headless: options.headless,
    slowMo: options.slowMoMs,
  });

  try {
    let downloaded = 0;
    for (const season of options.seasons) {
      const seasonLabel = formatSeasonSpan(season.year);

      for (const type of TRANSACTION_TYPES) {
        const savedTo = await downloadTransactionCsvWithRetry({
          browser,
          season,
          type,
          outDir: options.outDir,
          retryCount: options.retryCount,
          retryDelayMs: options.retryDelayMs,
        });
        console.info(`[${seasonLabel}] ${type}: saved ${savedTo}`);
        downloaded++;

        if (options.pauseBetweenMs > 0) {
          await sleep(options.pauseBetweenMs);
        }
      }
    }

    console.info(
      `Done. Downloaded ${downloaded} transaction CSV file(s) across ${options.seasons.length} season(s).`,
    );
  } finally {
    await browser.close();
  }

  runTransactionsUploadIfEnabled(options.outDir, options.seasons);
  runTransactionsDbImportIfEnabled(options.outDir, options.autoImportToDb);
};

void main();
