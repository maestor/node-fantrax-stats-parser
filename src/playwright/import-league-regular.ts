import { chromium, type Browser } from "playwright";
import { mkdirSync } from "fs";
import path from "path";

import { TEAMS } from "../constants";
import {
  AUTH_STATE_PATH,
  buildRosterUrlForSeason,
  downloadRosterCsv,
  getRosterTeamIdFromStandingsByNames,
  gotoStandings,
  installRequestBlocking,
  parseImportLeagueRegularOptions,
  requireAuthStateFile,
  sleep,
  standingsNameCandidates,
  tryGetRosterTeamIdFromStandingsLink,
  type ImportLeagueRegularOptions,
} from "./helpers";

const main = async (): Promise<void> => {
  const options: ImportLeagueRegularOptions = parseImportLeagueRegularOptions(process.argv.slice(2));
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

    // Resolve season-specific roster teamIds from standings once (these change per year).
    await gotoStandings(page, options.leagueId);
    const rosterTeamIdBySlug = new Map<string, string>();
    const missing: Array<{ name: string; names: string[] }> = [];

    for (const team of TEAMS) {
      const names = standingsNameCandidates(team);
      let rosterTeamId: string | null = null;
      for (const displayName of names) {
        rosterTeamId = await tryGetRosterTeamIdFromStandingsLink(page, displayName);
        if (rosterTeamId) {
          break;
        }
      }

      if (rosterTeamId) {
        rosterTeamIdBySlug.set(team.name, rosterTeamId);
      } else {
        missing.push({ name: team.name, names });
      }
    }

    if (missing.length > 0) {
      console.info(`Standings link href missing for ${missing.length} team(s); falling back to click-through parsing.`);
      for (const team of missing) {
        await gotoStandings(page, options.leagueId);
        const rosterTeamId = await getRosterTeamIdFromStandingsByNames(page, team.names);
        rosterTeamIdBySlug.set(team.name, rosterTeamId);
      }
    }

    for (const team of TEAMS) {
      const rosterTeamId = rosterTeamIdBySlug.get(team.name);
      if (!rosterTeamId) {
        throw new Error(`Missing roster teamId for "${team.presentName}" (slug: ${team.name}).`);
      }

      const rosterUrl = buildRosterUrlForSeason({
        leagueId: options.leagueId,
        rosterTeamId,
        endDate: options.endDate,
      });

      console.info(`[${team.name}] goto ${rosterUrl}`);
      await page.goto(rosterUrl, { waitUntil: "domcontentloaded" });

      const savedTo = await downloadRosterCsv(page, team.name, team.id, options.outDir, options.year);
      console.info(`[${team.name}] saved ${savedTo}`);

      if (options.pauseBetweenMs > 0) {
        await sleep(options.pauseBetweenMs);
      }
    }

    console.info(`Done. Downloaded ${TEAMS.length} CSV files (via standings flow).`);
  } finally {
    await browser.close();
  }

};

void main();
