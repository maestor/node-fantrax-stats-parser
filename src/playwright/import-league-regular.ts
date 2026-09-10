import { chromium, type Browser, type Page } from "playwright";
import { existsSync, mkdirSync } from "fs";
import path from "path";

import { CURRENT_SEASON, TEAMS } from "../config/index.js";
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
  runImportTempCsvScriptIfUsingDefaultOutDir,
  sleep,
  standingsNameCandidates,
  tryGetRosterTeamIdFromStandingsLink,
  type ImportLeagueRegularOptions,
} from "./helpers.js";

const MAX_DOWNLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

const main = async (): Promise<void> => {
  const options: ImportLeagueRegularOptions = parseImportLeagueRegularOptions(
    process.argv.slice(2),
  );
  requireAuthStateFile();
  mkdirSync(path.resolve(options.outDir), { recursive: true });

  const outOfEra = TEAMS.filter(
    (t) => t.firstSeason !== undefined && options.year < t.firstSeason,
  );
  if (outOfEra.length) {
    console.info(
      `Skipping ${outOfEra.length} team(s) not in ${options.year}-${options.year + 1}: ${outOfEra
        .map((t) => t.name)
        .join(", ")}.`,
    );
  }

  const teamsToDownload = TEAMS.filter(
    (team) =>
      team.firstSeason === undefined || options.year >= team.firstSeason,
  ).filter((team) => {
    const fileName = buildRosterCsvFileName({
      teamSlug: team.name,
      teamId: team.id,
      year: options.year,
    });
    const p = buildRosterCsvPath({
      outDir: options.outDir,
      teamSlug: team.name,
      teamId: team.id,
      year: options.year,
    });
    if (existsSync(p)) {
      console.info(
        `[${team.name}] already exists (${path.join(options.outDir, fileName)}); skipping.`,
      );
      return false;
    }
    return true;
  });

  if (!teamsToDownload.length) {
    console.info(
      `Done. All regular-season CSV files already exist in ${options.outDir}.`,
    );
    runImportTempCsvScriptIfUsingDefaultOutDir(
      options.outDir,
      options.year,
      "regular",
    );
    return;
  }

  let browser: Browser | undefined;
  const openPage = async (): Promise<Page> => {
    browser = await chromium.launch({
      headless: options.headless,
      slowMo: options.slowMoMs,
    });
    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      acceptDownloads: true,
    });

    await installRequestBlocking(context);

    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return page;
  };

  try {
    let page = await openPage();

    // Resolve season-specific roster teamIds from standings once (these change per year).
    await gotoStandings(page, options.leagueId);
    const rosterTeamIdBySlug = new Map<string, string>();
    const missing: Array<{
      slug: string;
      presentName: string;
      names: string[];
    }> = [];

    for (const team of teamsToDownload) {
      const names = standingsNameCandidates(team);
      let rosterTeamId: string | null = null;
      for (const displayName of names) {
        rosterTeamId = await tryGetRosterTeamIdFromStandingsLink(
          page,
          displayName,
        );
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
        `Standings link href missing for ${missing.length} team(s); falling back to click-through parsing (some may not exist for older seasons).`,
      );
      for (const team of missing) {
        await gotoStandings(page, options.leagueId);
        try {
          const rosterTeamId = await getRosterTeamIdFromStandingsByNames(
            page,
            team.names,
          );
          rosterTeamIdBySlug.set(team.slug, rosterTeamId);
        } catch (err) {
          console.info(
            `[${team.slug}] not found in standings for ${options.year}-${options.year + 1}; skipping. (${String(err)})`,
          );
        }
      }
    }

    let downloaded = 0;
    let skippedMissing = 0;
    for (const team of teamsToDownload) {
      const fileName = buildRosterCsvFileName({
        teamSlug: team.name,
        teamId: team.id,
        year: options.year,
      });
      const outPath = buildRosterCsvPath({
        outDir: options.outDir,
        teamSlug: team.name,
        teamId: team.id,
        year: options.year,
      });
      if (existsSync(outPath)) {
        console.info(
          `[${team.name}] already exists (${path.join(options.outDir, fileName)}); skipping.`,
        );
        continue;
      }

      const rosterTeamId = rosterTeamIdBySlug.get(team.name);
      if (!rosterTeamId) {
        console.info(
          `[${team.name}] missing roster teamId for ${options.year}-${options.year + 1} (likely not in league yet); skipping.`,
        );
        skippedMissing++;
        continue;
      }

      const rosterUrl = buildRosterUrlForSeason({
        leagueId: options.leagueId,
        rosterTeamId,
        startDate: options.startDate,
        endDate: options.endDate,
        includeYearToDateSeason: options.year === CURRENT_SEASON,
      });

      for (let attempt = 1; ; attempt++) {
        try {
          console.info(`[${team.name}] goto ${rosterUrl}`);
          await page.goto(rosterUrl, { waitUntil: "domcontentloaded" });

          const savedTo = await downloadRosterCsv(
            page,
            team.name,
            team.id,
            options.outDir,
            options.year,
          );
          console.info(`[${team.name}] saved ${savedTo}`);
          downloaded++;
          break;
        } catch (err) {
          if (attempt >= MAX_DOWNLOAD_ATTEMPTS) {
            throw new Error(
              `[${team.name}] CSV download failed after ${MAX_DOWNLOAD_ATTEMPTS} attempts. ` +
                `Completed CSVs remain in ${options.outDir}; rerun the command to resume.`,
              { cause: err },
            );
          }
          const delayMs = RETRY_DELAY_MS * attempt;
          console.info(
            `[${team.name}] attempt ${attempt}/${MAX_DOWNLOAD_ATTEMPTS} failed: ${String(err)}\n` +
              `Reopening browser in ${delayMs / 1_000}s for attempt ${attempt + 1}/${MAX_DOWNLOAD_ATTEMPTS}.`,
          );
          await browser?.close();
          await sleep(delayMs);
          page = await openPage();
        }
      }

      if (options.pauseBetweenMs > 0) {
        await sleep(options.pauseBetweenMs);
      }
    }

    const extra = skippedMissing
      ? ` Skipped ${skippedMissing} team(s) missing from standings.`
      : "";
    console.info(
      `Done. Downloaded ${downloaded} regular-season CSV file(s) (via standings flow).${extra}`,
    );
  } finally {
    await browser?.close();
  }

  runImportTempCsvScriptIfUsingDefaultOutDir(
    options.outDir,
    options.year,
    "regular",
  );
};

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
