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
  getRosterTeamIdFromStandingsByNames,
  gotoPlayoffsStandings,
  gotoStandings,
  hasFlag,
  installRequestBlocking,
  LEAGUE_IDS_PATH,
  normalizeSpacesLower,
  parseNumberArg,
  requireAuthStateFile,
  requireLeagueIdsFile,
  scrapePlayoffsPeriodsFromStandingsTables,
  standingsNameCandidates,
  tryGetRosterTeamIdFromStandingsLink,
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
  rosterTeamId: string;
};

type PlayoffsSeason = {
  year: number;
  leagueId: string;
  teams: PlayoffsTeamRun[];
};

type PlayoffsFile = {
  schemaVersion: 2;
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
        `Re-run npm run playwright:sync:leagues to regenerate it.`,
    );
  }

  return parsed as LeagueIdsFileV2;
};

const readExistingPlayoffsFile = (): PlayoffsFile | null => {
  try {
    const raw = readFileSync(PLAYOFFS_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    // We only keep schemaVersion 2 (rosterTeamId is required for import-league-playoffs).
    const file = parsed as { schemaVersion?: number; seasons?: unknown };
    if (file.schemaVersion !== 2 || !Array.isArray(file.seasons)) return null;

    return parsed as PlayoffsFile;
  } catch {
    return null;
  }
};

const ensureRosterTeamIds = async (args: {
  page: import("playwright").Page;
  leagueId: string;
  teams: Array<
    Omit<PlayoffsTeamRun, "rosterTeamId"> &
      Partial<Pick<PlayoffsTeamRun, "rosterTeamId">>
  >;
  rosterTeamIdByTeamName?: Record<string, string>;
}): Promise<PlayoffsTeamRun[]> => {
  const byName = args.rosterTeamIdByTeamName ?? {};

  const enriched: PlayoffsTeamRun[] = args.teams.map((t) => {
    const fromMap = byName[normalizeSpacesLower(t.presentName)];
    const rosterTeamId = t.rosterTeamId?.trim() || fromMap || "";
    return {
      ...(t as Team),
      startDate: t.startDate,
      endDate: t.endDate,
      rosterTeamId,
    };
  });

  const missing = enriched.filter((t) => !t.rosterTeamId);
  if (!missing.length) return enriched;

  await gotoStandings(args.page, args.leagueId);

  const stillMissing: PlayoffsTeamRun[] = [];
  for (const team of enriched) {
    if (team.rosterTeamId) continue;

    const names = standingsNameCandidates(team);
    let rosterTeamId: string | null = null;
    for (const displayName of names) {
      rosterTeamId = await tryGetRosterTeamIdFromStandingsLink(
        args.page,
        displayName,
      );
      if (rosterTeamId) break;
    }

    if (!rosterTeamId) {
      // Fallback: click-through parsing (slow, but reliable).
      await gotoStandings(args.page, args.leagueId);
      rosterTeamId = await getRosterTeamIdFromStandingsByNames(
        args.page,
        names,
      );
      await gotoStandings(args.page, args.leagueId);
    }

    if (!rosterTeamId) {
      stillMissing.push(team);
      continue;
    }

    team.rosterTeamId = rosterTeamId;
  }

  if (stillMissing.length) {
    const names = stillMissing.map((t) => t.presentName).join(", ");
    throw new Error(`Missing roster teamId for: ${names}`);
  }

  return enriched;
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
    .filter((s) =>
      Number.isFinite(onlyYear ?? NaN) ? s.year === onlyYear : true,
    )
    .sort((a, b) => a.year - b.year);

  if (!seasons.length) {
    console.info(
      onlyYear
        ? `No seasons found for --year=${onlyYear} in ${LEAGUE_IDS_PATH}`
        : `No seasons found in ${LEAGUE_IDS_PATH}`,
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
      console.info(
        `Syncing playoffs teams for ${season.year} (leagueId=${season.leagueId})`,
      );

      try {
        if (season.year === 2018) {
          const base = computeManual2018PlayoffsTeamRuns(TEAMS) as Array<
            Omit<PlayoffsTeamRun, "rosterTeamId">
          >;
          const teams = await ensureRosterTeamIds({
            page,
            leagueId: season.leagueId,
            teams: base,
          });
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
        const { periods, teamsByPeriod, rosterTeamIdByTeamName } =
          await scrapePlayoffsPeriodsFromStandingsTables(page);
        const expectedRoundTeamCounts =
          season.year === 2019 ? [16, 8] : [16, 8, 4, 2];
        let baseTeams = computePlayoffTeamRunsFromPlayoffsPeriods({
          periods,
          teamsByPeriod,
          expectedRoundTeamCounts,
          allTeams: TEAMS,
        }) as Array<Omit<PlayoffsTeamRun, "rosterTeamId">> | null;

        let teams: PlayoffsTeamRun[] | null = null;
        if (baseTeams) {
          teams = await ensureRosterTeamIds({
            page,
            leagueId: season.leagueId,
            teams: baseTeams,
            rosterTeamIdByTeamName,
          });
        }

        // Fallback: try the older bracket-text heuristic if needed.
        if (!teams) {
          const bracketText = await page.locator("body").innerText();
          const playoffsYear = Number(
            season.periods.playoffsStartDate.slice(0, 4),
          );

          const rounds = extractRoundWindowsFromText(bracketText, playoffsYear);
          if (!rounds.length) {
            if (debug) {
              const hints = bracketText
                .split("\n")
                .map((l) => l.replace(/\s+/g, " ").trim())
                .filter(Boolean)
                .filter(
                  (l) =>
                    /\b(period|round|playoff|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
                      l,
                    ) || /\d{1,2}\/\d{2}/.test(l),
                )
                .slice(0, 60);
              console.info(
                `Debug bracket hints (${season.year}):\n${hints.join("\n") || "(none)"}`,
              );
            }
            console.info(
              `Manual needed: ${season.year} (leagueId=${season.leagueId}) could not parse playoffs periods from playoffs page.`,
            );
            continue;
          }

          baseTeams = computePlayoffTeamRunsFromBracketText({
            bracketText,
            rounds,
            fallbackStartDate: season.periods.playoffsStartDate,
            fallbackEndDate: season.periods.playoffsEndDate,
            allTeams: TEAMS,
          }) as Array<Omit<PlayoffsTeamRun, "rosterTeamId">> | null;

          if (baseTeams) {
            teams = await ensureRosterTeamIds({
              page,
              leagueId: season.leagueId,
              teams: baseTeams,
              rosterTeamIdByTeamName,
            });
          }
        }

        const uniqueTeams = teams?.length ?? 0;
        if (!teams || uniqueTeams !== 16) {
          console.info(
            `Manual needed: ${season.year} (leagueId=${season.leagueId}) found ${uniqueTeams} playoff teams (expected 16). Skipping.`,
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
        console.info(
          `Manual needed: ${season.year} (leagueId=${season.leagueId}) failed to sync playoffs: ${msg}`,
        );
      }
    }

    const file: PlayoffsFile = {
      schemaVersion: 2,
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
