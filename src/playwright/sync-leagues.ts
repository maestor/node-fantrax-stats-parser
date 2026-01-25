import { chromium, type Page } from "playwright";
import { rmSync, writeFileSync } from "fs";
import path from "path";

import { FANTRAX_URLS } from "../constants";
import {
  AUTH_STATE_PATH,
  debugDump,
  ensureFantraxArtifactDir,
  FANTRAX_ARTIFACT_DIR,
  hasFlag,
  LEAGUE_IDS_PATH,
  installRequestBlocking,
  parseFantraxDateToISO,
  parseNumberArg,
  parseStringArg,
  requireAuthStateFile,
} from "./helpers";

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

type LeagueIdsFile = {
  schemaVersion: 2;
  leagueName: string;
  scrapedAt: string;
  seasons: LeagueSeasonInfo[];
};

type LeagueArchiveEntry = { year: number; leagueId: string };

type RulesPageRaw = {
  beginAccumulatingText: string | null;
  endAccumulatingText: string | null;
  customPeriods: Array<{ period: number; startText: string; endText: string }>;
  playoffs: { startPeriod: number | null; rounds: number | null };
};

const readLeagueArchiveEntries = async (page: Page, timeoutMs: number): Promise<LeagueArchiveEntry[]> => {
  await page.goto(FANTRAX_URLS.leagueArchive, { waitUntil: "domcontentloaded", timeout: timeoutMs });

  // Fantrax pages often keep the network busy; "networkidle" can time out indefinitely.
  // Instead, wait for at least one league link or bail with debug artifacts.
  if (page.url().includes("/login")) {
    await debugDump(page, "redirected-to-login");
    throw new Error(
      `Not authenticated (redirected to /login). Run npm run playwright:login first, then re-run sync.`
    );
  }

  const anyLeagueLink = page.locator('a[href*="/fantasy/league/"]').first();
  try {
    await anyLeagueLink.waitFor({ state: "attached", timeout: timeoutMs });
  } catch {
    await debugDump(page, "no-league-links");
    throw new Error(
      `Timed out waiting for league links on ${page.url()}. Debug artifacts saved under ${FANTRAX_ARTIFACT_DIR}.`
    );
  }

  // The archive is grouped by headings like "Seasons Starting in 2025" and the table
  // rows include the season (e.g. "2025-26") and the league home link like
  // "/fantasy/league/<leagueId>/home". We specifically want the "Finnish Fantasy Hockey League".
  return await page.$$eval("table.sticky-table tbody tr", (rows) => {
    const out: Array<{ year: number; leagueId: string }> = [];

    for (const row of rows) {
      const tds = Array.from(row.querySelectorAll("td"));
      if (!tds.length) continue;

      const seasonText = (tds[0]?.textContent ?? "").trim();
      const yearMatch = /(20\d{2})\s*-\s*\d{2}/.exec(seasonText);
      if (!yearMatch) continue;
      const startYear = Number(yearMatch[1]);
      if (!Number.isFinite(startYear)) continue;

      const leagueLink = row.querySelector('a[href*="/fantasy/league/"][href$="/home"]');
      const href = leagueLink?.getAttribute("href") ?? "";
      const idMatch = /\/fantasy\/league\/([^/;?]+)/.exec(href);
      const leagueId = idMatch?.[1];
      if (!leagueId || leagueId === "all") continue;

      out.push({ year: startYear, leagueId });
    }

    return out;
  });
};

const readRulesPeriodInfo = async (page: Page, leagueId: string, timeoutMs: number): Promise<LeaguePeriods> => {
  const url = `https://www.fantrax.com/fantasy/league/${leagueId}/rules`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

  if (page.url().includes("/login")) {
    await debugDump(page, `rules-redirected-to-login-${leagueId}`);
    throw new Error(
      `Not authenticated while loading rules page (redirected to /login). Run npm run playwright:login first, then re-run sync.`
    );
  }

  try {
    await page.locator("text=Your league stats begin accumulating on:").waitFor({
      state: "visible",
      timeout: timeoutMs,
    });
  } catch {
    await debugDump(page, `rules-missing-schedule-${leagueId}`);
    throw new Error(`Timed out waiting for schedule section on ${page.url()}`);
  }

  const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();
  const looksLikeDate = (s: string): boolean =>
    /[A-Za-z]{3}\s+\d{1,2},\s*\d{4}/.test(s) || /[A-Za-z]{3}\s+\d{1,2}\/\d{2}/.test(s);

  const isoToUtcDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
  const utcDateToIso = (d: Date): string => d.toISOString().slice(0, 10);
  const addDaysIso = (iso: string, days: number): string => {
    const ms = isoToUtcDate(iso).getTime() + days * 24 * 60 * 60 * 1000;
    return utcDateToIso(new Date(ms));
  };
  const inclusiveDaysBetween = (startIso: string, endIso: string): number => {
    const diffMs = isoToUtcDate(endIso).getTime() - isoToUtcDate(startIso).getTime();
    return Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1;
  };

  const schedule = page
    .locator(".statsContainer2")
    .filter({ hasText: "Your league stats begin accumulating on:" })
    .first();

  const extractLiValue = async (spanNeedle: string): Promise<string | null> => {
    const li = schedule.locator("li").filter({ hasText: spanNeedle }).first();
    if ((await li.count()) === 0) return null;

    const label = normalize((await li.locator("span").first().textContent()) ?? "");
    const full = normalize((await li.textContent()) ?? "");
    const value = label && full.startsWith(label) ? normalize(full.slice(label.length)) : full;
    return value || null;
  };

  const beginAccumulatingText = await extractLiValue("begin accumulating");
  const endAccumulatingText = await extractLiValue("end accumulating");

  const periodsTable = schedule
    .locator("table")
    .filter({ hasText: "Scoring Period" })
    .filter({ hasText: "Start Date" })
    .filter({ hasText: "End Date" })
    .first();

  const customPeriods: Array<{ period: number; startText: string; endText: string }> = [];
  if ((await periodsTable.count()) > 0) {
    const rows = periodsTable.locator("tbody tr");
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      const tdLoc = rows.nth(i).locator("td");
      const tdCount = await tdLoc.count();
      const cells: string[] = [];
      for (let j = 0; j < tdCount; j++) {
        cells.push(normalize((await tdLoc.nth(j).innerText()) ?? ""));
      }

      const period = Number(cells[0] ?? "");
      if (!Number.isFinite(period)) continue;

      const dateCells = cells.filter(looksLikeDate);
      const startText = cells[1] && looksLikeDate(cells[1]) ? cells[1] : dateCells[0];
      const endText =
        cells[3] && looksLikeDate(cells[3])
          ? cells[3]
          : dateCells.length
            ? dateCells[dateCells.length - 1]
            : undefined;

      if (!startText || !endText) continue;
      customPeriods.push({ period, startText, endText });
    }
  }

  const playoffsLi = schedule.locator("li").filter({ hasText: "Playoffs will begin in this Scoring Period" }).first();
  const playoffsText = normalize((await playoffsLi.textContent()) ?? "");
  const startPeriodMatch = /Playoffs will begin in this Scoring Period:\s*(\d+)/.exec(playoffsText);
  const roundsMatch = /and last for\s*(\d+)\s*periods?\s*\(rounds\)/.exec(playoffsText);
  const startPeriod = startPeriodMatch ? Number(startPeriodMatch[1]) : null;
  const rounds = roundsMatch ? Number(roundsMatch[1]) : null;

  const raw: RulesPageRaw = {
    beginAccumulatingText,
    endAccumulatingText,
    customPeriods,
    playoffs: {
      startPeriod: typeof startPeriod === "number" && Number.isFinite(startPeriod) ? startPeriod : null,
      rounds: typeof rounds === "number" && Number.isFinite(rounds) ? rounds : null,
    },
  };

  // Many leagues do not show a "Custom Periods Used" table (e.g. default weekly scoring periods).
  // In that case, we can still derive the needed boundaries from:
  // - begin/end accumulating dates
  // - playoffs start period's displayed date range, plus number of rounds.
  if (!raw.customPeriods.length) {
    const playoffStartPeriod = raw.playoffs.startPeriod;
    const playoffRounds = raw.playoffs.rounds;
    if (!raw.beginAccumulatingText || !raw.endAccumulatingText) {
      await debugDump(page, `rules-no-custom-periods-${leagueId}`);
      throw new Error(
        `No custom periods table and missing begin/end accumulating dates for league ${leagueId}.`
      );
    }
    if (!playoffStartPeriod || !playoffRounds) {
      await debugDump(page, `rules-missing-playoffs-${leagueId}`);
      throw new Error(
        `No custom periods table and missing playoffs info for league ${leagueId}. Expected "Playoffs will begin" and rounds count.`
      );
    }

    const regularStartDate = parseFantraxDateToISO(raw.beginAccumulatingText);
    const seasonEndDate = parseFantraxDateToISO(raw.endAccumulatingText);

    const rangeMatch = /\(([^)]+)\)/.exec(playoffsText);
    const rangeText = rangeMatch?.[1] ?? "";
    const parts = rangeText.split("-").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 1) {
      await debugDump(page, `rules-playoffs-missing-daterange-${leagueId}`);
      throw new Error(
        `No custom periods table and could not parse playoffs date range for league ${leagueId} from: ${playoffsText}`
      );
    }

    const playoffsStartDate = parseFantraxDateToISO(parts[0]);
    const playoffsPeriodEndDate = parts[1] ? parseFantraxDateToISO(parts[1]) : null;
    const playoffsEndDate = playoffsPeriodEndDate
      ? addDaysIso(playoffsStartDate, inclusiveDaysBetween(playoffsStartDate, playoffsPeriodEndDate) * playoffRounds - 1)
      : seasonEndDate;

    return {
      regularStartDate,
      regularEndDate: addDaysIso(playoffsStartDate, -1),
      playoffsStartDate,
      playoffsEndDate,
    };
  }

  const periods = raw.customPeriods
    .slice()
    .sort((a, b) => a.period - b.period)
    .map((p) => ({
      period: p.period,
      startDate: parseFantraxDateToISO(p.startText),
      endDate: parseFantraxDateToISO(p.endText),
    }));

  const playoffStartPeriod = raw.playoffs.startPeriod;
  const playoffRounds = raw.playoffs.rounds;
  if (!playoffStartPeriod || !playoffRounds) {
    await debugDump(page, `rules-missing-playoffs-${leagueId}`);
    throw new Error(
      `Missing playoffs info on rules page for league ${leagueId}. Expected "Playoffs will begin" and rounds count.`
    );
  }

  const playoffStartIndex = periods.findIndex((p) => p.period === playoffStartPeriod);
  const playoffEndPeriod = playoffStartPeriod + playoffRounds - 1;
  const playoffEndIndex = periods.findIndex((p) => p.period === playoffEndPeriod);
  if (playoffStartIndex < 0 || playoffEndIndex < 0) {
    await debugDump(page, `rules-playoffs-period-out-of-range-${leagueId}`);
    throw new Error(
      `Playoffs periods not found in custom periods for league ${leagueId}. Start period ${playoffStartPeriod}, end period ${playoffEndPeriod}.`
    );
  }

  const regularStartDate = periods[0].startDate;
  const regularEndIndex = playoffStartIndex - 1;
  if (regularEndIndex < 0) {
    await debugDump(page, `rules-regular-period-out-of-range-${leagueId}`);
    throw new Error(`Computed regular season end before start for league ${leagueId}.`);
  }

  return {
    regularStartDate,
    regularEndDate: periods[regularEndIndex].endDate,
    playoffsStartDate: periods[playoffStartIndex].startDate,
    playoffsEndDate: periods[playoffEndIndex].endDate,
  };
};

async function main(): Promise<void> {
  requireAuthStateFile();
  ensureFantraxArtifactDir();

  const argv = process.argv.slice(2);
  const headless = !hasFlag(argv, "--headed");
  const slowMo = parseNumberArg(argv, "--slowmo") ?? 0;
  const timeoutMs = parseNumberArg(argv, "--timeout") ?? 60_000;
  const leagueName = parseStringArg(argv, "--league") ?? "Finnish Fantasy Hockey League";

  const browser = await chromium.launch({ headless, slowMo });
  try {
    const context = await browser.newContext({ storageState: AUTH_STATE_PATH });
    await installRequestBlocking(context);
    const page = await context.newPage();

    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    console.info(`Syncing league IDs from ${FANTRAX_URLS.leagueArchive}`);
    const entries = await readLeagueArchiveEntries(page, timeoutMs);
    console.info(`Found ${entries.length} archive row(s) on ${page.url()}`);

    // The archive can include multiple leagues per year. Filter down by league name if possible.
    // We do this by re-visiting the archive DOM and selecting rows with the exact league name.
    const entriesForLeagueName = await page.$$eval(
      "table.sticky-table tbody tr",
      (rows, targetName) => {
        const out: Array<{ year: number; leagueId: string }> = [];

        for (const row of rows) {
          const tds = Array.from(row.querySelectorAll("td"));
          if (!tds.length) continue;

          const seasonText = (tds[0]?.textContent ?? "").trim();
          const yearMatch = /(20\d{2})\s*-\s*\d{2}/.exec(seasonText);
          if (!yearMatch) continue;
          const year = Number(yearMatch[1]);
          if (!Number.isFinite(year)) continue;

          const leagueLink = row.querySelector('a[href*="/fantasy/league/"][href$="/home"]');
          const leagueText = (leagueLink?.textContent ?? "").replace(/\s+/g, " ").trim();
          if (!leagueText || leagueText !== targetName) continue;

          const href = leagueLink?.getAttribute("href") ?? "";
          const idMatch = /\/fantasy\/league\/([^/;?]+)/.exec(href);
          const leagueId = idMatch?.[1];
          if (!leagueId || leagueId === "all") continue;

          out.push({ year, leagueId });
        }

        return out;
      },
      leagueName
    );

    const selectedEntries = entriesForLeagueName.length ? entriesForLeagueName : entries;
    if (!entriesForLeagueName.length) {
      console.info(
        `Warning: Could not filter archive rows by league name "${leagueName}"; falling back to first league per year.`
      );
    }

    const years = Array.from(new Set(selectedEntries.map((e) => e.year))).sort((a, b) => a - b);
    const seasons: LeagueSeasonInfo[] = [];
    const failures: Array<{ year: number; leagueId: string; error: string }> = [];

    for (const year of years) {
      const leagueId = selectedEntries.find((e) => e.year === year)?.leagueId;
      if (!leagueId) continue;

      console.info(`Scraping rules for ${year} (leagueId=${leagueId})`);
      try {
        const periods = await readRulesPeriodInfo(page, leagueId, timeoutMs);
        seasons.push({ year, leagueId, periods });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ year, leagueId, error: msg });
        console.info(`Warning: Failed to scrape rules for ${year} (leagueId=${leagueId}): ${msg}`);
      }
    }

    if (failures.length) {
      const failuresPath = path.join(FANTRAX_ARTIFACT_DIR, "sync-leagues-failures.json");
      writeFileSync(failuresPath, `${JSON.stringify({ leagueName, scrapedAt: new Date().toISOString(), failures }, null, 2)}\n`, "utf8");
      console.info(`Saved failures list to ${failuresPath}`);
    } else {
      const failuresPath = path.join(FANTRAX_ARTIFACT_DIR, "sync-leagues-failures.json");
      try {
        rmSync(failuresPath);
      } catch {
        // ignore
      }
    }

    if (!seasons.length) {
      await debugDump(page, "no-seasons-found");
      throw new Error(
        `No seasons found to write. Fantrax may have changed the page, or your account lacks access.`
      );
    }

    const file: LeagueIdsFile = {
      schemaVersion: 2,
      leagueName,
      scrapedAt: new Date().toISOString(),
      seasons: seasons.sort((a, b) => a.year - b.year),
    };
    writeFileSync(LEAGUE_IDS_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    console.info(`Saved league IDs + periods to ${LEAGUE_IDS_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
