import { chromium, type Browser } from "playwright";
import { existsSync, mkdirSync } from "fs";
import path from "path";

import { TEAMS } from "../constants";
import {
  AUTH_STATE_PATH,
  buildRosterCsvFileName,
  buildRosterCsvPath,
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

  const teamsToDownload = TEAMS.filter((team) => {
    const fileName = buildRosterCsvFileName({ teamSlug: team.name, teamId: team.id, year: options.year });
    const p = buildRosterCsvPath({ outDir: options.outDir, teamSlug: team.name, teamId: team.id, year: options.year });
    if (existsSync(p)) {
      console.info(`[${team.name}] already exists (${path.join(options.outDir, fileName)}); skipping.`);
      return false;
    }
    return true;
  });

  if (!teamsToDownload.length) {
    console.info(`Done. All regular-season CSV files already exist in ${options.outDir}.`);
    return;
  }

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
    const missing: Array<{ slug: string; presentName: string; names: string[] }> = [];

    for (const team of teamsToDownload) {
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
        missing.push({ slug: team.name, presentName: team.presentName, names });
      }
    }

    if (missing.length > 0) {
      console.info(
        `Standings link href missing for ${missing.length} team(s); falling back to click-through parsing (some may not exist for older seasons).`
      );
      for (const team of missing) {
        await gotoStandings(page, options.leagueId);
        try {
          const rosterTeamId = await getRosterTeamIdFromStandingsByNames(page, team.names);
          rosterTeamIdBySlug.set(team.slug, rosterTeamId);
        } catch (err) {
          console.info(
            `[${team.slug}] not found in standings for ${options.year}-${options.year + 1}; skipping. (${String(err)})`
          );
        }
      }
    }

    let downloaded = 0;
    let skippedMissing = 0;
    for (const team of teamsToDownload) {
      const fileName = buildRosterCsvFileName({ teamSlug: team.name, teamId: team.id, year: options.year });
      const outPath = buildRosterCsvPath({ outDir: options.outDir, teamSlug: team.name, teamId: team.id, year: options.year });
      if (existsSync(outPath)) {
        console.info(`[${team.name}] already exists (${path.join(options.outDir, fileName)}); skipping.`);
        continue;
      }

      const rosterTeamId = rosterTeamIdBySlug.get(team.name);
      if (!rosterTeamId) {
        console.info(
          `[${team.name}] missing roster teamId for ${options.year}-${options.year + 1} (likely not in league yet); skipping.`
        );
        skippedMissing++;
        continue;
      }

      const rosterUrl = buildRosterUrlForSeason({
        leagueId: options.leagueId,
        rosterTeamId,
        startDate: options.startDate,
        endDate: options.endDate,
      });

      console.info(`[${team.name}] goto ${rosterUrl}`);
      await page.goto(rosterUrl, { waitUntil: "domcontentloaded" });

      const savedTo = await downloadRosterCsv(page, team.name, team.id, options.outDir, options.year);
      console.info(`[${team.name}] saved ${savedTo}`);
      downloaded++;

      if (options.pauseBetweenMs > 0) {
        await sleep(options.pauseBetweenMs);
      }
    }

    const extra = skippedMissing ? ` Skipped ${skippedMissing} team(s) missing from standings.` : "";
    console.info(`Done. Downloaded ${downloaded} regular-season CSV file(s) (via standings flow).${extra}`);
  } finally {
    await browser.close();
  }

};

void main();
