#!/usr/bin/env tsx

// Scrapes regular season standings from Fantrax and saves to fantrax-regular.json.
// Requires: fantrax-auth.json (run playwright:login) and fantrax-leagues.json (run playwright:sync:leagues).
//
// Flags:
//   --headed         Run browser visibly (default: headless)
//   --year=XXXX      Sync only the given season year
//   --import-db      Import results into DB after scraping
//   --slowmo=N       Slow Playwright actions by N ms
//   --timeout=N      Navigation timeout in ms (default: 60000)

import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import {
  AUTH_STATE_PATH,
  ensureFantraxArtifactDir,
  FANTRAX_ARTIFACT_DIR,
  gotoRegularStandings,
  hasFlag,
  installRequestBlocking,
  LEAGUE_IDS_PATH,
  normalizeSpaces,
  parseNumberArg,
  requireAuthStateFile,
  requireLeagueIdsFile,
  standingsNameCandidates,
} from "./helpers";
import type { Team } from "../types";
import { TEAMS } from "../constants";
import { getDbClient } from "../db/client";

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

type RegularStandingsTeam = Team & {
  wins: number;
  losses: number;
  ties: number;
  points: number;
  divWins: number;
  divLosses: number;
  divTies: number;
};

type RegularSeason = {
  year: number;
  leagueId: string;
  teams: RegularStandingsTeam[];
};

type RegularFile = {
  schemaVersion: 1;
  leagueName: string;
  scrapedAt: string;
  seasons: RegularSeason[];
};

const REGULAR_PATH = path.join(FANTRAX_ARTIFACT_DIR, "fantrax-regular.json");

const readLeagueIdsV2 = (): LeagueIdsFileV2 => {
  requireLeagueIdsFile();
  const raw = readFileSync(LEAGUE_IDS_PATH, "utf8");
  const parsed = JSON.parse(raw) as LeagueIdsFileV2;
  if (parsed.schemaVersion !== 2) {
    throw new Error(
      `Expected schemaVersion 2 in fantrax-leagues.json, got ${parsed.schemaVersion}. Re-run playwright:sync:leagues.`,
    );
  }
  return parsed;
};

const readExistingFile = (): Map<number, RegularSeason> => {
  const seasonByYear = new Map<number, RegularSeason>();
  if (!existsSync(REGULAR_PATH)) return seasonByYear;
  try {
    const file = JSON.parse(readFileSync(REGULAR_PATH, "utf8")) as RegularFile;
    for (const season of file.seasons) {
      seasonByYear.set(season.year, season);
    }
  } catch {
    console.info("⚠️  Could not parse existing fantrax-regular.json — starting fresh.");
  }
  return seasonByYear;
};

const importToDb = async (file: RegularFile): Promise<void> => {
  const db = getDbClient();
  let upserted = 0;
  for (const season of file.seasons) {
    for (const team of season.teams) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO regular_results
                (team_id, season, wins, losses, ties, points, div_wins, div_losses, div_ties)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          team.id,
          season.year,
          team.wins,
          team.losses,
          team.ties,
          team.points,
          team.divWins,
          team.divLosses,
          team.divTies,
        ],
      });
      upserted++;
    }
  }
  console.info(`✅  Imported ${upserted} regular season records into DB.`);
};

async function main(): Promise<void> {
  requireAuthStateFile();
  ensureFantraxArtifactDir();

  const argv = process.argv.slice(2);
  const headless = !hasFlag(argv, "--headed");
  const slowMo = parseNumberArg(argv, "--slowmo") ?? 0;
  const timeoutMs = parseNumberArg(argv, "--timeout") ?? 60_000;
  const onlyYear = parseNumberArg(argv, "--year") ?? null;
  const shouldImportDb = hasFlag(argv, "--import-db");

  const leagues = readLeagueIdsV2();
  const seasons = leagues.seasons.filter((s) =>
    onlyYear !== null ? s.year === onlyYear : true,
  );

  if (seasons.length === 0) {
    console.info(`⚠️  No seasons found${onlyYear !== null ? ` for year ${onlyYear}` : ""}.`);
    return;
  }

  const browser = await chromium.launch({ headless, slowMo });
  try {
    const context = await browser.newContext({ storageState: AUTH_STATE_PATH });
    await installRequestBlocking(context);

    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    const seasonByYear = readExistingFile();

    for (const league of seasons) {
      console.info(`\n📅  Scraping ${league.year} (${league.leagueId})...`);
      try {
        await gotoRegularStandings(page, league.leagueId, timeoutMs);

        // Scope to the first standings table only (--h2hrotisserie1).
        // The COMBINED view also renders scoring-period breakdown tables
        // (--h2hrotisserie2) which share the same inner selectors and would
        // produce duplicate/wrong team rows if not excluded.
        const standingsTable = page.locator(
          "div.standings-table-wrapper--h2hrotisserie1",
        );

        // Team names (in rank order) from the aside panel
        const teamCells = standingsTable.locator("aside._ut__aside td");
        const teamCount = await teamCells.count();

        // Stat rows (same order as teams) from the content panel
        const dataRows = standingsTable.locator("div._ut__content table tr");

        // Build lookup: normalised display name → Team
        const teamByName = new Map<string, Team>();
        for (const team of TEAMS) {
          for (const candidate of standingsNameCandidates(team)) {
            teamByName.set(candidate.toLowerCase(), team);
          }
        }

        const teams: RegularStandingsTeam[] = [];
        let rowIndex = 0;

        for (let i = 0; i < teamCount; i++) {
          const nameRaw = normalizeSpaces(
            await teamCells.nth(i).locator("div > a").innerText(),
          );
          const team = teamByName.get(nameRaw.toLowerCase());
          if (!team) {
            console.info(`  ⚠️  Unknown team name: "${nameRaw}" — skipping.`);
            rowIndex++;
            continue;
          }
          // Skip expansion teams that didn't exist yet
          if (team.firstSeason !== undefined && team.firstSeason > league.year) {
            rowIndex++;
            continue;
          }

          const row = dataRows.nth(rowIndex++);
          const cells = row.locator("td");

          const wins = parseInt(await cells.nth(0).innerText(), 10);
          const losses = parseInt(await cells.nth(1).innerText(), 10);
          const ties = parseInt(await cells.nth(2).innerText(), 10);
          const points = parseInt(await cells.nth(3).innerText(), 10);
          const divRecord = normalizeSpaces(await cells.nth(5).innerText());
          const divParts = divRecord.split("-").map(Number);
          const [divWins, divLosses, divTies] = divParts;

          teams.push({
            id: team.id,
            name: team.name,
            presentName: team.presentName,
            wins,
            losses,
            ties,
            points,
            divWins,
            divLosses,
            divTies,
          });
        }

        seasonByYear.set(league.year, {
          year: league.year,
          leagueId: league.leagueId,
          teams: teams.sort((a, b) => a.id.localeCompare(b.id)),
        });

        console.info(`  ✅  ${teams.length} teams scraped.`);
      } catch (err) {
        console.error(`  ❌  Failed for ${league.year}: ${err}`);
      }
    }

    const file: RegularFile = {
      schemaVersion: 1,
      leagueName: leagues.leagueName,
      scrapedAt: new Date().toISOString(),
      seasons: [...seasonByYear.values()].sort((a, b) => a.year - b.year),
    };

    writeFileSync(REGULAR_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    console.info(`\n💾  Saved to ${REGULAR_PATH}`);

    if (shouldImportDb) {
      await importToDb(file);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
