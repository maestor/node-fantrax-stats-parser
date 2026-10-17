import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CURRENT_SEASON, TEAMS } from "../config/index.js";
import {
  buildRosterCsvPath,
  hasFlag,
  parseImportLeagueRegularOptions,
  requireAuthStateFile,
  runImportTempCsvScriptIfUsingDefaultOutDir,
  standingsNameCandidates,
} from "./helpers.js";
import {
  downloadRosterReports,
  FantraxRosterHttpClient,
  parseRosterConcurrency,
  type RosterDownload,
} from "./roster-http.js";

const main = async (): Promise<void> => {
  const options = parseImportLeagueRegularOptions(process.argv.slice(2));
  const concurrency = parseRosterConcurrency(process.argv.slice(2));
  requireAuthStateFile();
  mkdirSync(path.resolve(options.outDir), { recursive: true });
  const pending = TEAMS.filter(
    (team) =>
      team.firstSeason === undefined || options.year >= team.firstSeason,
  )
    .map((team) => ({
      team,
      filePath: buildRosterCsvPath({
        teamSlug: team.name,
        teamId: team.id,
        year: options.year,
        outDir: options.outDir,
      }),
    }))
    .filter(({ team, filePath }) => {
      if (!existsSync(filePath)) return true;
      console.info(`[${team.name}] already exists (${filePath}); skipping.`);
      return false;
    });
  let downloaded = 0;
  if (pending.length) {
    const client = new FantraxRosterHttpClient();
    const leagueTeams = await client.getLeagueTeams(options.leagueId);
    const jobs: RosterDownload[] = [];
    for (const { team, filePath } of pending) {
      const names = standingsNameCandidates(team);
      const matches = leagueTeams.filter((t) => names.includes(t.name));
      if (!matches.length) {
        if (hasFlag(process.argv.slice(2), "--strict")) {
          throw new Error(`[${team.name}] missing from league metadata; regular import is incomplete.`);
        }
        console.info(
          `[${team.name}] not found in ${options.year} league metadata; skipping.`,
        );
        continue;
      }
      if (matches.length !== 1)
        throw new Error(
          `Ambiguous Fantrax team mapping for ${team.presentName}`,
        );
      jobs.push({
        leagueId: options.leagueId,
        rosterTeamId: matches[0].id,
        startDate: options.startDate,
        endDate: options.endDate,
        includeYearToDateSeason: options.year === CURRENT_SEASON,
        filePath,
        teamName: team.name,
      });
    }
    downloaded = await downloadRosterReports(
      client,
      jobs,
      concurrency,
      options.pauseBetweenMs,
    );
  }
  console.info(
    `Done. Downloaded ${downloaded} regular-season CSV file(s) over HTTP.`,
  );
  runImportTempCsvScriptIfUsingDefaultOutDir(
    options.outDir,
    options.year,
    "regular",
  );
};

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
