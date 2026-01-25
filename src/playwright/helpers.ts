import { existsSync } from "fs";
import { createInterface } from "readline";
import path from "path";
import type { BrowserContext, Locator, Page } from "playwright";

import { DEFAULT_CSV_OUT_DIR, FANTRAX_URLS, LEAGUES } from "../constants";
import type { League, Team } from "../types";

export const AUTH_STATE_PATH = "fantrax-auth.json";

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

export const saveAuthStateInteractive = async (context: BrowserContext, page: Page): Promise<void> => {
  await page.goto(FANTRAX_URLS.login, { waitUntil: "domcontentloaded" });

  console.info("Login manually in the opened browser.");
  await waitForEnter("When you are done, press Enter to save auth state... ");

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
  endDate: string;
};

const parseNumberArg = (argv: string[], key: string): number | undefined => {
  const arg = argv.find((a) => a.startsWith(`${key}=`));
  if (!arg) return undefined;
  const raw = arg.slice(key.length + 1);
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

const parseStringArg = (argv: string[], key: string): string | undefined => {
  const arg = argv.find((a) => a.startsWith(`${key}=`));
  if (!arg) return undefined;
  const raw = arg.slice(key.length + 1).trim();
  return raw || undefined;
};

const resolveLeagueForYear = (leagues: readonly League[], year: number): League | undefined => {
  return leagues.find((l) => l.year === year);
};

export const parseImportLeagueRegularOptions = (argv: string[]): ImportLeagueRegularOptions => {
  const headless = !argv.includes("--headed");
  const slowMoMs = parseNumberArg(argv, "--slowmo") ?? 0;
  const pauseBetweenMs = parseNumberArg(argv, "--pause") ?? 250;
  const outDir = parseStringArg(argv, "--out") ?? process.env.CSV_OUT_DIR?.trim() ?? DEFAULT_CSV_OUT_DIR;

  const yearArg = parseStringArg(argv, "--year") ?? argv.find((a) => !a.startsWith("-"));
  const yearFallback = Math.max(...LEAGUES.map((l) => l.year));
  const year = yearArg ? Number(yearArg) : yearFallback;
  if (!Number.isFinite(year)) {
    throw new Error(`Invalid year: ${String(yearArg)}`);
  }

  const league = resolveLeagueForYear(LEAGUES, year);
  if (!league) {
    const validYears = LEAGUES.map((l) => l.year)
      .sort((a, b) => b - a)
      .join(", ");
    throw new Error(`Unknown year ${year}. Valid years: ${validYears}`);
  }

  return {
    headless,
    slowMoMs,
    pauseBetweenMs,
    outDir,
    year,
    leagueId: league.leagueId,
    endDate: league.endDate,
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
  endDate: string;
}): string => {
  const leagueId = encodeURIComponent(args.leagueId);
  const rosterTeamId = encodeURIComponent(args.rosterTeamId);
  const endDate = encodeURIComponent(args.endDate);

  return `${FANTRAX_URLS.league}/${leagueId}/team/roster;teamId=${rosterTeamId};timeframeTypeCode=BY_DATE;endDate=${endDate};statsType=3`;
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