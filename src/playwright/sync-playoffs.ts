import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  AUTH_STATE_PATH,
  computePlayoffTeamRunsFromBracketText,
  computePlayoffTeamRunsFromPlayoffsPeriods,
  ensureFantraxArtifactDir,
  extractRoundWindowsFromText,
  FANTRAX_ARTIFACT_DIR,
  gotoPlayoffsStandings,
  hasFlag,
  installRequestBlocking,
  LEAGUE_IDS_PATH,
  parseNumberArg,
  requireAuthStateFile,
  requireLeagueIdsFile,
  scrapePlayoffsPeriodsFromStandingsTables,
} from "./helpers";
import type { Team } from "../types";
import { TEAMS } from "../constants";

import { computeManual2018PlayoffsTeamRuns } from "./compute-manual-data";

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

type PlayoffsTeamRun = Team & {
  startDate: string;
  endDate: string;
};

type PlayoffsSeason = {
  year: number;
  leagueId: string;
  teams: PlayoffsTeamRun[];
};

type PlayoffsFile = {
  schemaVersion: 1;
  leagueName: string;
  scrapedAt: string;
  seasons: PlayoffsSeason[];
};

const PLAYOFFS_PATH = path.join(FANTRAX_ARTIFACT_DIR, "fantrax-playoffs.json");

const readLeagueIdsV2 = (): LeagueIdsFileV2 => {
  requireLeagueIdsFile();
  const raw = readFileSync(LEAGUE_IDS_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid league IDs file: ${LEAGUE_IDS_PATH}`);
  }

  const file = parsed as Partial<LeagueIdsFileV2>;
  if (file.schemaVersion !== 2 || !Array.isArray(file.seasons)) {
    throw new Error(
      `Unsupported league IDs file schema in ${LEAGUE_IDS_PATH}. Expected schemaVersion 2. ` +
        `Re-run npm run playwright:sync:leagues to regenerate it.`
    );
  }

  return parsed as LeagueIdsFileV2;
};

const readExistingPlayoffsFile = (): PlayoffsFile | null => {
  try {
    const raw = readFileSync(PLAYOFFS_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const file = parsed as Partial<PlayoffsFile>;
    if (file.schemaVersion !== 1 || !Array.isArray(file.seasons)) return null;

    return parsed as PlayoffsFile;
  } catch {
    return null;
  }
};

async function main(): Promise<void> {
  requireAuthStateFile();
  ensureFantraxArtifactDir();

  const argv = process.argv.slice(2);
  const headless = !hasFlag(argv, "--headed");
  const slowMo = parseNumberArg(argv, "--slowmo") ?? 0;
  const timeoutMs = parseNumberArg(argv, "--timeout") ?? 60_000;
  const onlyYear = parseNumberArg(argv, "--year");
  const debug = hasFlag(argv, "--debug");

  const leagues = readLeagueIdsV2();
  const seasons = leagues.seasons
    .slice()
    .filter((s) => (Number.isFinite(onlyYear ?? NaN) ? s.year === onlyYear : true))
    .sort((a, b) => a.year - b.year);

  if (!seasons.length) {
    console.info(
      onlyYear
        ? `No seasons found for --year=${onlyYear} in ${LEAGUE_IDS_PATH}`
        : `No seasons found in ${LEAGUE_IDS_PATH}`
    );
    return;
  }

  const browser = await chromium.launch({ headless, slowMo });
  try {
    const context = await browser.newContext({ storageState: AUTH_STATE_PATH });
    await installRequestBlocking(context);

    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    const existing = readExistingPlayoffsFile();
    const seasonByYear = new Map<number, PlayoffsSeason>();
    for (const s of existing?.seasons ?? []) {
      seasonByYear.set(s.year, s);
    }

    for (const season of seasons) {
      console.info(`Syncing playoffs teams for ${season.year} (leagueId=${season.leagueId})`);

      try {
        if (season.year === 2018) {
          const teams = computeManual2018PlayoffsTeamRuns(TEAMS) as PlayoffsTeamRun[];
          seasonByYear.set(season.year, {
            year: season.year,
            leagueId: season.leagueId,
            teams: teams.sort((a, b) => a.id.localeCompare(b.id)),
          });
          console.info(`Used manual playoffs mapping for ${season.year}`);
          continue;
        }

        await gotoPlayoffsStandings(page, season.leagueId, timeoutMs);

        // Preferred: derive winners per round from the per-period playoffs standings tables.
        const { periods, teamsByPeriod } = await scrapePlayoffsPeriodsFromStandingsTables(page);
        const expectedRoundTeamCounts = season.year === 2019 ? [16, 8] : [16, 8, 4, 2];
        let teams = computePlayoffTeamRunsFromPlayoffsPeriods({
          periods,
          teamsByPeriod,
          expectedRoundTeamCounts,
          allTeams: TEAMS,
        }) as PlayoffsTeamRun[] | null;

        // Fallback: try the older bracket-text heuristic if needed.
        if (!teams) {
          const bracketText = await page.locator("body").innerText();
          const playoffsYear = Number(season.periods.playoffsStartDate.slice(0, 4));

          const rounds = extractRoundWindowsFromText(bracketText, playoffsYear);
          if (!rounds.length) {
            if (debug) {
              const hints = bracketText
                .split("\n")
                .map((l) => l.replace(/\s+/g, " ").trim())
                .filter(Boolean)
                .filter(
                  (l) =>
                    /\b(period|round|playoff|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(l) ||
                    /\d{1,2}\/\d{2}/.test(l)
                )
                .slice(0, 60);
              console.info(`Debug bracket hints (${season.year}):\n${hints.join("\n") || "(none)"}`);
            }
            console.info(
              `Manual needed: ${season.year} (leagueId=${season.leagueId}) could not parse playoffs periods from playoffs page.`
            );
            continue;
          }

          teams = computePlayoffTeamRunsFromBracketText({
            bracketText,
            rounds,
            fallbackStartDate: season.periods.playoffsStartDate,
            fallbackEndDate: season.periods.playoffsEndDate,
            allTeams: TEAMS,
          }) as PlayoffsTeamRun[] | null;
        }

        const uniqueTeams = teams?.length ?? 0;
        if (!teams || uniqueTeams !== 16) {
          console.info(
            `Manual needed: ${season.year} (leagueId=${season.leagueId}) found ${uniqueTeams} playoff teams (expected 16). Skipping.`
          );
          continue;
        }

        seasonByYear.set(season.year, {
          year: season.year,
          leagueId: season.leagueId,
          teams: teams.sort((a, b) => a.id.localeCompare(b.id)),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.info(`Manual needed: ${season.year} (leagueId=${season.leagueId}) failed to sync playoffs: ${msg}`);
      }
    }

    const file: PlayoffsFile = {
      schemaVersion: 1,
      leagueName: leagues.leagueName,
      scrapedAt: new Date().toISOString(),
      seasons: [...seasonByYear.values()].sort((a, b) => a.year - b.year),
    };

    writeFileSync(PLAYOFFS_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    console.info(`Saved playoffs mapping to ${PLAYOFFS_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
