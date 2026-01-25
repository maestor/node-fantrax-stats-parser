import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import path from "path";
import type { BrowserContext, Locator, Page } from "playwright";

import { DEFAULT_CSV_OUT_DIR, FANTRAX_URLS } from "../constants";
import type { Team } from "../types";

export type RoundWindow = { startDate: string; endDate: string; label: string };

export type TeamRun<T extends Team = Team> = T & {
  startDate: string;
  endDate: string;
};

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

export const normalizeSpacesLower = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

export const normalizeSpaces = (s: string): string => s.replace(/\s+/g, " ").trim();

export const countOccurrences = (haystack: string, needle: string): number => {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  for (;;) {
    const next = haystack.indexOf(needle, idx);
    if (next < 0) break;
    count++;
    idx = next + needle.length;
  }
  return count;
};

export const parseFantraxDateRangeToIso = (s: string): { startDate: string; endDate: string } | null => {
  // Example: "(Mon Mar 17, 2025 - Sun Mar 23, 2025)"
  const m = /\(([^)]+)\)/.exec(s);
  const inside = normalizeSpaces(m?.[1] ?? s);
  const parts = inside
    .split(/\s*[-–]\s*/)
    .map((p) => normalizeSpaces(p))
    .filter(Boolean);
  if (parts.length < 2) return null;

  try {
    const startDate = parseFantraxDateToISO(parts[0]);
    const endDate = parseFantraxDateToISO(parts[1]);
    return { startDate, endDate };
  } catch {
    return null;
  }
};

export const scrapePlayoffsPeriodsFromStandingsTables = async (
  page: Page
): Promise<{ periods: Array<RoundWindow & { periodNumber: number }>; teamsByPeriod: string[][] }> => {
  // Fantrax renders multiple standings tables:
  // "Scoring Period: Playoffs 1" (16 teams)
  // "Scoring Period: Playoffs 2" (8 teams)
  // "Scoring Period: Playoffs 3" (4 teams)
  // "Scoring Period: Playoffs 4" (2 teams)
  const playoffHeaders = page.locator("h4").filter({ hasText: /Scoring\s+Period:\s*Playoffs\s+\d+/i });
  const n = await playoffHeaders.count();
  const found: Array<{ periodNumber: number; label: string; startDate: string; endDate: string; teams: string[] }> = [];

  for (let i = 0; i < n; i++) {
    const header = playoffHeaders.nth(i);
    const headerText = normalizeSpaces(await header.innerText());
    const m = /Playoffs\s+(\d+)/i.exec(headerText);
    const periodNumber = Number(m?.[1]);
    if (!Number.isFinite(periodNumber)) continue;

    const wrapper = header
      .locator("xpath=ancestor::div[contains(@class,'standings-table-wrapper')][1]")
      .first();

    const dateText = normalizeSpaces(await wrapper.locator("h5").first().innerText().catch(() => ""));
    const parsedRange = parseFantraxDateRangeToIso(dateText);
    if (!parsedRange) continue;

    const teamTexts = await wrapper.locator("aside a").allInnerTexts();
    const teams = teamTexts.map(normalizeSpaces).filter(Boolean);
    if (!teams.length) continue;

    found.push({
      periodNumber,
      label: `Playoffs ${periodNumber}`,
      startDate: parsedRange.startDate,
      endDate: parsedRange.endDate,
      teams,
    });
  }

  found.sort((a, b) => a.periodNumber - b.periodNumber);
  return {
    periods: found.map(({ periodNumber, label, startDate, endDate }) => ({ periodNumber, label, startDate, endDate })),
    teamsByPeriod: found.map((f) => f.teams),
  };
};

export const computePlayoffTeamRunsFromPlayoffsPeriods = (args: {
  periods: RoundWindow[];
  teamsByPeriod: string[][];
  expectedRoundTeamCounts: number[];
  allTeams: readonly Team[];
}): TeamRun[] | null => {
  if (args.periods.length !== args.teamsByPeriod.length) return null;
  if (args.expectedRoundTeamCounts.length < 1) return null;

  const periods = args.periods.slice(0, args.expectedRoundTeamCounts.length);
  const teamsByPeriod = args.teamsByPeriod.slice(0, args.expectedRoundTeamCounts.length);
  if (periods.length !== args.expectedRoundTeamCounts.length) return null;
  if (teamsByPeriod.length !== args.expectedRoundTeamCounts.length) return null;

  const sizes = teamsByPeriod.map((t) => t.length);
  for (let i = 0; i < args.expectedRoundTeamCounts.length; i++) {
    if (sizes[i] !== args.expectedRoundTeamCounts[i]) return null;
  }

  const normalizedSets = teamsByPeriod.map((list) => new Set(list.map(normalizeSpacesLower)));
  const round1Names = teamsByPeriod[0].map(normalizeSpaces);

  const participants: Team[] = [];
  for (const rawName of round1Names) {
    const norm = normalizeSpacesLower(rawName);
    const team = args.allTeams.find((t) => normalizeSpacesLower(t.presentName) === norm);
    if (team) participants.push(team);
  }

  if (participants.length !== 16) return null;

  const startDate = periods[0].startDate;
  const runs: TeamRun[] = [];

  for (const team of participants) {
    const norm = normalizeSpacesLower(team.presentName);
    let lastIdx = -1;
    for (let i = 0; i < normalizedSets.length; i++) {
      if (normalizedSets[i].has(norm)) lastIdx = i;
    }
    if (lastIdx < 0) continue;
    runs.push({ ...team, startDate, endDate: periods[lastIdx].endDate });
  }

  return runs.length === 16 ? runs : null;
};

export const gotoPlayoffsStandings = async (page: Page, leagueId: string, timeoutMs: number): Promise<void> => {
  const url = `${FANTRAX_URLS.league}/${encodeURIComponent(leagueId)}/standings;view=PLAYOFFS`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

  if (page.url().includes("/login")) {
    throw new Error(`Not authenticated (redirected to /login) while loading playoffs page for leagueId=${leagueId}`);
  }

  // Fantrax can take a moment to render the Playoffs period tables.
  const playoffsHeader = page.locator("h4").filter({ hasText: /Scoring\s+Period:\s*Playoffs\s+\d+/i }).first();
  try {
    await playoffsHeader.waitFor({ state: "visible", timeout: Math.min(timeoutMs, 15_000) });
  } catch {
    // ignore
  }
};

const parseMonthDayToIso = (token: string, year: number): string | null => {
  const s = token.replace(/\s+/g, " ").trim();
  const m = /^([A-Za-z]{3})\s+(\d{1,2})$/.exec(s);
  if (!m) return null;

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

  const month = monthMap[m[1]];
  if (!month) return null;

  const day = String(Number(m[2])).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateTokenToIso = (token: string, defaultYear: number): string | null => {
  const s = token.replace(/\s+/g, " ").trim();

  try {
    return parseFantraxDateToISO(s);
  } catch {
    // ignore
  }

  // If Fantrax provides no year, infer from playoffsStartDate year.
  return parseMonthDayToIso(s, defaultYear);
};

export const extractRoundWindowsFromText = (text: string, defaultYear: number): RoundWindow[] => {
  // Fantrax bracket header patterns vary; support both:
  // - "Period 20 (Mar 17/25 - Mar 23/25)"
  // - "Round 1 (Mar 17 - Mar 23)"
  // - "Final Round (Apr 7 - Apr 17)"

  const out: Array<RoundWindow & { sortKey: number }> = [];

  // 1) Prefer explicit scoring periods when available.
  const byPeriod = new Map<number, RoundWindow & { sortKey: number }>();
  const periodRe = /(Scoring\s+)?Period\s+(\d+)\s*\(([^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = periodRe.exec(text))) {
    const period = Number(m[2]);
    if (!Number.isFinite(period)) continue;

    const inside = m[3].replace(/\s+/g, " ").trim();
    const parts = inside
      .split(/\s*[-–]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;

    const startDate = parseDateTokenToIso(parts[0], defaultYear);
    const endDate = parseDateTokenToIso(parts[1], defaultYear);
    if (!startDate || !endDate) continue;

    if (!byPeriod.has(period)) {
      byPeriod.set(period, {
        startDate,
        endDate,
        label: `Period ${period}`,
        sortKey: period,
      });
    }
  }

  if (byPeriod.size) {
    return [...byPeriod.values()]
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ startDate, endDate, label }) => ({ startDate, endDate, label }));
  }

  // 2) Fallback: parse round headers when no explicit period numbers exist.
  const norm = text.replace(/\s+/g, " ");
  const roundRe = /(Round\s+\d+|Final\s+Round)\s*\(([^)]+)\)/gi;
  let idx = 0;
  while ((m = roundRe.exec(norm))) {
    idx++;
    const label = m[1].replace(/\s+/g, " ").trim();
    const inside = m[2].replace(/\s+/g, " ").trim();
    const parts = inside
      .split(/\s*[-–]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;

    const startDate = parseDateTokenToIso(parts[0], defaultYear);
    const endDate = parseDateTokenToIso(parts[1], defaultYear);
    if (!startDate || !endDate) continue;

    out.push({ startDate, endDate, label, sortKey: idx });
  }

  return out
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ startDate, endDate, label }) => ({ startDate, endDate, label }));
};

export const computePlayoffTeamRunsFromBracketText = (args: {
  bracketText: string;
  rounds: RoundWindow[];
  fallbackStartDate: string;
  fallbackEndDate: string;
  allTeams: readonly Team[];
}): TeamRun[] | null => {
  const normalizedBracket = normalizeSpacesLower(args.bracketText);
  const roundsCount = args.rounds.length;
  if (!roundsCount) return null;

  const playoffTeams: TeamRun[] = [];

  for (const team of args.allTeams) {
    const needle = normalizeSpacesLower(team.presentName);
    const appear = countOccurrences(normalizedBracket, needle);
    if (!appear) continue;

    const cappedAppear = Math.min(appear, roundsCount);
    const startDate = args.rounds[0]?.startDate ?? args.fallbackStartDate;
    const endDate = args.rounds[cappedAppear - 1]?.endDate ?? args.fallbackEndDate;

    playoffTeams.push({ ...team, startDate, endDate });
  }

  return playoffTeams;
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