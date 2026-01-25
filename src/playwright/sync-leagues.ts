import { chromium, type Page } from "playwright";
import { writeFileSync } from "fs";
import path from "path";

import { FANTRAX_URLS, LEAGUES } from "../constants";
import {
  AUTH_STATE_PATH,
  ensureFantraxArtifactDir,
  FANTRAX_ARTIFACT_DIR,
  LEAGUE_IDS_PATH,
  requireAuthStateFile,
} from "./helpers";

type LeagueIdsFile = {
  schemaVersion: number;
  leagueName: string;
  scrapedAt: string;
  leagueIdsByYear: Record<string, string>;
};

type LeagueArchiveEntry = { year: number; leagueId: string };

const parseNumberArg = (argv: string[], key: string): number | undefined => {
  const arg = argv.find((a) => a.startsWith(`${key}=`));
  if (!arg) return undefined;
  const raw = arg.slice(key.length + 1);
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

const hasFlag = (argv: string[], key: string): boolean => argv.includes(key);

const debugDump = async (page: Page, label: string): Promise<void> => {
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

  // The archive is a table where the season (e.g. "2025-26") is in the first cell,
  // and the league id is embedded in a link like "/fantasy/league/<leagueId>/home".
  return await page.$$eval("table tbody tr", (rows) => {
    const out: Array<{ year: number; leagueId: string }> = [];

    for (const row of rows) {
      const seasonCell = row.querySelector("td");
      const seasonText = (seasonCell?.textContent ?? "").trim();
      const yearMatch = /\b(20\d{2})\b/.exec(seasonText);
      if (!yearMatch) continue;

      const startYear = Number(yearMatch[1]);
      if (!Number.isFinite(startYear)) continue;

      const leagueLink = row.querySelector('a[href*="/fantasy/league/"]');
      const href = leagueLink?.getAttribute("href") ?? "";
      const idMatch = /\/fantasy\/league\/([^/;?]+)/.exec(href);
      const leagueId = idMatch?.[1];
      if (!leagueId || leagueId === "all") continue;

      out.push({ year: startYear, leagueId });
    }

    return out;
  });
};

async function main(): Promise<void> {
  requireAuthStateFile();
  ensureFantraxArtifactDir();

  const argv = process.argv.slice(2);
  const headless = !hasFlag(argv, "--headed");
  const slowMo = parseNumberArg(argv, "--slowmo") ?? 0;
  const timeoutMs = parseNumberArg(argv, "--timeout") ?? 60_000;

  const browser = await chromium.launch({ headless, slowMo });
  try {
    const context = await browser.newContext({ storageState: AUTH_STATE_PATH });
    const page = await context.newPage();

    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    console.info(`Syncing league IDs from ${FANTRAX_URLS.leagueArchive}`);
    const entries = await readLeagueArchiveEntries(page, timeoutMs);
    console.info(`Found ${entries.length} archive row(s) on ${page.url()}`);
    const wantedYears: Set<number> = new Set(LEAGUES.map((l) => l.year));
    const leagueIdsByYear: Record<string, string> = {};

    for (const entry of entries) {
      if (!wantedYears.has(entry.year)) continue;
      if (!leagueIdsByYear[String(entry.year)]) {
        leagueIdsByYear[String(entry.year)] = entry.leagueId;
      }
    }

    const missingYears = [...wantedYears]
      .filter((y) => !leagueIdsByYear[String(y)])
      .sort((a, b) => a - b);
    if (missingYears.length) {
      await debugDump(page, "missing-years");
      throw new Error(
        `Could not find league IDs for years: ${missingYears.join(", ")}. Fantrax may have changed the page, or your account lacks access.`
      );
    }

    const file: LeagueIdsFile = {
      schemaVersion: 1,
      leagueName: "Fantrax league",
      scrapedAt: new Date().toISOString(),
      leagueIdsByYear,
    };
    writeFileSync(LEAGUE_IDS_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    console.info(`Saved league IDs to ${LEAGUE_IDS_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
