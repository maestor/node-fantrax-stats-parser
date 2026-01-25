import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import path from "path";
import type { BrowserContext, Locator, Page } from "playwright";

import { DEFAULT_CSV_OUT_DIR, FANTRAX_URLS } from "../constants";
import type { Team } from "../types";

export const FANTRAX_ARTIFACT_DIR = path.resolve("src", "playwright", ".fantrax");
export const AUTH_STATE_PATH = path.join(FANTRAX_ARTIFACT_DIR, "fantrax-auth.json");
export const LEAGUE_IDS_PATH = path.join(FANTRAX_ARTIFACT_DIR, "fantrax-leagues.json");

export const ensureFantraxArtifactDir = (): void => {
  mkdirSync(FANTRAX_ARTIFACT_DIR, { recursive: true });
};

const waitForEnter = (message = "Press Enter to continue..."): Promise<void> => {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
};

export const requireAuthStateFile = (): void => {
  if (!existsSync(AUTH_STATE_PATH)) {
    throw new Error(`Missing ${AUTH_STATE_PATH}. Run the login script first to save auth state.`);
  }
};

export const requireLeagueIdsFile = (): void => {
  if (!existsSync(LEAGUE_IDS_PATH)) {
    throw new Error(
      `Missing ${LEAGUE_IDS_PATH}. Run the league sync script first (npm run playwright:sync:leagues) to save league IDs and season dates.`
    );
  }
};

export const saveAuthStateInteractive = async (context: BrowserContext, page: Page): Promise<void> => {
  await page.goto(FANTRAX_URLS.login, { waitUntil: "domcontentloaded" });

  console.info("Login manually in the opened browser.");
  await waitForEnter("When you are done, press Enter to save auth state... ");

  ensureFantraxArtifactDir();
  await context.storageState({ path: AUTH_STATE_PATH });
  console.info(`Saved auth state to ${AUTH_STATE_PATH}`);
};

export type ImportLeagueRegularOptions = {
  headless: boolean;
  slowMoMs: number;
  pauseBetweenMs: number;
  outDir: string;
  year: number;
  leagueId: string;
  startDate: string;
  endDate: string;
};

type LeagueIdsFileV1 = {
  schemaVersion: 1;
  leagueName: string;
  scrapedAt: string;
  leagueIdsByYear: Record<string, string>;
};

type LeaguePeriods = {
  regularStartDate: string;
  regularEndDate: string;
  playoffsStartDate: string;
  playoffsEndDate: string;
};

type LeagueSeasonInfo = {
  year: number;
  leagueId: string;
  periods: LeaguePeriods;
};

type LeagueIdsFileV2 = {
  schemaVersion: 2;
  leagueName: string;
  scrapedAt: string;
  seasons: LeagueSeasonInfo[];
};

type LeagueIdsFile = LeagueIdsFileV1 | LeagueIdsFileV2;

export const parseNumberArg = (argv: string[], key: string): number | undefined => {
  const arg = argv.find((a) => a.startsWith(`${key}=`));
  if (!arg) return undefined;
  const raw = arg.slice(key.length + 1);
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

export const parseStringArg = (argv: string[], key: string): string | undefined => {
  const arg = argv.find((a) => a.startsWith(`${key}=`));
  if (!arg) return undefined;
  const raw = arg.slice(key.length + 1).trim();
  return raw || undefined;
};

export const hasFlag = (argv: string[], key: string): boolean => argv.includes(key);

export const parseFantraxDateToISO = (raw: string): string => {
  const s = raw.replace(/\s+/g, " ").trim();

  const monthMap: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };

  // Examples:
  // - "Fri Oct 04, 2024"
  // - "Mon Oct 21, 2024"
  // - "Oct 4, 2024"
  let m = /^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/.exec(s);
  if (m) {
    const month = monthMap[m[1]];
    if (!month) throw new Error(`Unsupported month in date: ${raw}`);
    const day = String(Number(m[2])).padStart(2, "0");
    const year = m[3];
    return `${year}-${month}-${day}`;
  }

  // Example: "Mar 17/25" (from playoffs period summary)
  m = /^([A-Za-z]{3})\s+(\d{1,2})\/(\d{2})$/.exec(s);
  if (m) {
    const month = monthMap[m[1]];
    if (!month) throw new Error(`Unsupported month in date: ${raw}`);
    const day = String(Number(m[2])).padStart(2, "0");
    const yy = Number(m[3]);
    const year = String(2000 + yy);
    return `${year}-${month}-${day}`;
  }

  throw new Error(`Unrecognized Fantrax date format: ${raw}`);
};

export const debugDump = async (page: Page, label: string): Promise<void> => {
  const safe = label.replace(/[^a-z0-9_-]/gi, "-");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(FANTRAX_ARTIFACT_DIR, `sync-leagues-${ts}-${safe}`);

  try {
    writeFileSync(`${base}.html`, await page.content(), "utf8");
  } catch {
    // ignore
  }

  try {
    await page.screenshot({ path: `${base}.png`, fullPage: true });
  } catch {
    // ignore
  }
};

const readLeagueIdsFile = (): LeagueIdsFile => {
  requireLeagueIdsFile();

  const raw = readFileSync(LEAGUE_IDS_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid league IDs file: ${LEAGUE_IDS_PATH}`);
  }
  const file = parsed as Partial<LeagueIdsFile>;
  if (file.schemaVersion !== 1 && file.schemaVersion !== 2) {
    throw new Error(
      `Invalid league IDs file schemaVersion in ${LEAGUE_IDS_PATH}. ` +
        `Re-run npm run playwright:sync:leagues to regenerate it.`
    );
  }

  return parsed as LeagueIdsFile;
};

const resolveAvailableYears = (file: LeagueIdsFile): number[] => {
  if (file.schemaVersion === 1) {
    return Object.keys(file.leagueIdsByYear)
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => b - a);
  }

  return file.seasons
    .map((s) => s.year)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);
};

const resolveSeasonInfoForYear = (file: LeagueIdsFile, year: number): LeagueSeasonInfo => {
  if (file.schemaVersion === 2) {
    const season = file.seasons.find((s) => s.year === year);
    if (season) return season;
  }

  if (file.schemaVersion === 1) {
    const leagueId = file.leagueIdsByYear[String(year)];
    if (leagueId) {
      throw new Error(
        `Your ${LEAGUE_IDS_PATH} is schemaVersion 1 (league IDs only). ` +
          `Re-run npm run playwright:sync:leagues to also save season period dates.`
      );
    }
  }

  const validYears = resolveAvailableYears(file).join(", ");
  throw new Error(
    `Missing league info for year ${year} in ${LEAGUE_IDS_PATH}. Valid years: ${validYears || "(none)"}. ` +
      `Run npm run playwright:sync:leagues to refresh the mapping.`
  );
};

export const parseImportLeagueRegularOptions = (argv: string[]): ImportLeagueRegularOptions => {
  const headless = !argv.includes("--headed");
  const slowMoMs = parseNumberArg(argv, "--slowmo") ?? 0;
  const pauseBetweenMs = parseNumberArg(argv, "--pause") ?? 250;
  const outDir = parseStringArg(argv, "--out") ?? process.env.CSV_OUT_DIR?.trim() ?? DEFAULT_CSV_OUT_DIR;

  const file = readLeagueIdsFile();
  const availableYears = resolveAvailableYears(file);

  const yearArg = parseStringArg(argv, "--year") ?? argv.find((a) => !a.startsWith("-"));
  const yearFallback = availableYears.length ? availableYears[0] : NaN;
  const year = yearArg ? Number(yearArg) : yearFallback;
  if (!Number.isFinite(year)) {
    throw new Error(`Invalid year: ${String(yearArg)}`);
  }

  const season = resolveSeasonInfoForYear(file, year);

  return {
    headless,
    slowMoMs,
    pauseBetweenMs,
    outDir,
    year,
    leagueId: season.leagueId,
    // Used for the roster-by-date URL query parameter; this should be the regular season start date.
    startDate: season.periods.regularStartDate,
    // Used for the roster-by-date URL query parameter; this should be the regular season end date.
    endDate: season.periods.regularEndDate,
  };
};

export const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const shouldBlockUrl = (url: string): boolean => {
  const u = url.toLowerCase();

  return (
    u.includes("googletagmanager.com") ||
    u.includes("google-analytics.com") ||
    u.includes("doubleclick.net") ||
    u.includes("googlesyndication.com") ||
    u.includes("adsystem.com") ||
    u.includes("adservice.") ||
    u.includes("facebook.net") ||
    u.includes("connect.facebook.net")
  );
};

export const installRequestBlocking = async (context: BrowserContext): Promise<void> => {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const type = request.resourceType();
    const url = request.url();

    if (type === "image" || type === "media" || type === "font") {
      await route.abort();
      return;
    }

    if (shouldBlockUrl(url)) {
      await route.abort();
      return;
    }

    await route.continue();
  });
};

export const gotoStandings = async (page: Page, leagueId: string): Promise<void> => {
  const standingsUrl = `${FANTRAX_URLS.league}/${encodeURIComponent(leagueId)}/standings`;
  await page.goto(standingsUrl, { waitUntil: "domcontentloaded" });
  await page.locator("div.league-standings-table").waitFor({ state: "visible", timeout: 30_000 });
};

export const extractTeamIdFromUrlish = (urlish: string): string | null => {
  const s = decodeURIComponent(urlish);
  const match = /(?:^|[;?&])teamId=([^;?&]+)/.exec(s);
  return match?.[1] ?? null;
};

export const standingsNameCandidates = ({ presentName, nameAliases }: Team): string[] => {
  const unique = new Set<string>();
  const names = [presentName, ...(nameAliases ?? [])];

  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }

  return [...unique];
};

const clickTeamFromStandings = async (page: Page, teamDisplayName: string): Promise<void> => {
  const table = page.locator("div.league-standings-table");

  const candidates: Locator[] = [
    table.getByRole("link", { name: teamDisplayName }).first(),
    table.getByRole("button", { name: teamDisplayName }).first(),
    table.locator(`text=${JSON.stringify(teamDisplayName)}`).first(),
  ];

  let lastError: unknown;
  for (const locator of candidates) {
    try {
      await locator.waitFor({ state: "visible", timeout: 10_000 });
      await locator.click({ timeout: 10_000 });
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Could not click team "${teamDisplayName}" in standings table. Last error: ${String(lastError)}`);
};

export const tryGetRosterTeamIdFromStandingsLink = async (
  page: Page,
  teamDisplayName: string
): Promise<string | null> => {
  const table = page.locator("div.league-standings-table");
  const link = table.getByRole("link", { name: teamDisplayName }).first();

  try {
    const href = await link.getAttribute("href");
    if (!href) {
      return null;
    }
    return extractTeamIdFromUrlish(href);
  } catch {
    return null;
  }
};

export const getRosterTeamIdFromStandingsByNames = async (
  page: Page,
  teamDisplayNames: readonly string[]
): Promise<string> => {
  // Prefer parsing from href without navigating.
  for (const displayName of teamDisplayNames) {
    const fromHref = await tryGetRosterTeamIdFromStandingsLink(page, displayName);
    if (fromHref) {
      return fromHref;
    }
  }

  // Fallback: click through and parse from resulting URL.
  let lastClickError: unknown;
  for (const displayName of teamDisplayNames) {
    try {
      await clickTeamFromStandings(page, displayName);
      await page.waitForURL(/\/team\/roster/i, { timeout: 30_000 });
      const teamId = extractTeamIdFromUrlish(page.url());
      if (!teamId) {
        throw new Error(`Could not extract roster teamId from URL: ${page.url()}`);
      }
      return teamId;
    } catch (err) {
      lastClickError = err;
    }
  }

  throw new Error(
    `Could not resolve roster teamId from standings. Tried names: ${teamDisplayNames.join(" | ")}. Last error: ${String(
      lastClickError
    )}`
  );
};

export const buildRosterUrlForSeason = (args: {
  leagueId: string;
  rosterTeamId: string;
  startDate: string;
  endDate: string;
}): string => {
  const leagueId = encodeURIComponent(args.leagueId);
  const rosterTeamId = encodeURIComponent(args.rosterTeamId);
  const startDate = encodeURIComponent(args.startDate);
  const endDate = encodeURIComponent(args.endDate);

  return `${FANTRAX_URLS.league}/${leagueId}/team/roster;teamId=${rosterTeamId};timeframeTypeCode=BY_DATE;startDate=${startDate};endDate=${endDate};statsType=3`;
};

export const downloadRosterCsv = async (
  page: Page,
  teamSlug: string,
  teamId: string,
  outDir: string,
  year: number
): Promise<string> => {
  // With statsType=3 in the URL this should already be set, but keep this as a best-effort
  // compatibility step in case Fantrax ignores the param for some leagues.
  const fullFantasyButton = page.getByRole("button", { name: /full fantasy team/i }).first();
  try {
    if (await fullFantasyButton.isVisible()) {
      await fullFantasyButton.click({ timeout: 5_000 });
    }
  } catch {
    // ignore
  }

  const downloadButton = page.locator('button[mattooltip="Download all as CSV"]');
  await downloadButton.waitFor({ state: "visible", timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await downloadButton.click();
  const download = await downloadPromise;

  const fileName = `${teamSlug}-${teamId}-regular-${year}-${year + 1}.csv`;
  const filePath = path.resolve(outDir, fileName);
  await download.saveAs(filePath);

  return filePath;
};