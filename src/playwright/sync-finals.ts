import { chromium, type Page } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import {
  AUTH_STATE_PATH,
  ensureFantraxArtifactDir,
  FANTRAX_ARTIFACT_DIR,
  hasFlag,
  installRequestBlocking,
  parseNumberArg,
  requireAuthStateFile,
} from "./helpers.js";
import { FANTRAX_URLS } from "../config/index.js";
import {
  FINAL_STAT_KEYS,
  FINALS_SCHEMA_VERSION,
  parseFinalsFile,
  type FinalCategoryResult,
  type FinalCategoryResultValue,
  type FinalCategoryWinner,
  type FinalSeason,
  type FinalStatKey,
  type FinalsFile,
  type FinalTeam,
  type FinalTotals,
} from "./finals-file.js";
import {
  compareFinalGoalieRateWinner,
  deriveFallbackFinalGoalieGames,
  formatFinalGoalieGaa,
  formatFinalGoalieSavePercent,
} from "./finals-goalie-rules.js";

type PlayoffsTeam = {
  id: string;
  presentName: string;
  rosterTeamId?: string;
  isChampion?: boolean;
};

type PlayoffsSeason = {
  year: number;
  leagueId: string;
  teams: PlayoffsTeam[];
};

type PlayoffsFile = {
  schemaVersion: number;
  leagueName: string;
  scrapedAt: string;
  seasons: PlayoffsSeason[];
};

type LiveScoringStatEntry = {
  scipId: string;
  sv: string;
  av: number;
  fpts: number;
};

type LiveScoringStatRow = {
  object1?: number;
  object2?: LiveScoringStatEntry[];
};

type LiveScoringTeamStats = {
  statsMap?: Record<string, LiveScoringStatRow>;
  totPtsPerMchup?: Record<string, Record<string, number>>;
  wltPerMchup?: Record<string, [number, number, number]>;
  totalFpts?: number;
  playerGameInfo?: number[];
};

type LiveScoringData = {
  displayedSelections?: {
    matchupId?: string;
  };
  matchupMap?: Record<string, string>;
  fantasyTeamInfo?: Record<string, { name?: string }>;
  statsPerTeam?: {
    statsMap?: Record<string, { ACTIVE?: LiveScoringTeamStats }>;
  };
};

type LiveScoringEnvelope = {
  responses?: Array<{
    data?: LiveScoringData;
  }>;
};

const PLAYOFFS_PATH = path.join(FANTRAX_ARTIFACT_DIR, "fantrax-playoffs.json");
const FINALS_PATH = path.join(FANTRAX_ARTIFACT_DIR, "fantrax-finals.json");

const STAT_KEY_BY_CATEGORY_ID: Record<string, FinalStatKey> = {
  "2130": "goals",
  "2090": "assists",
  "2190": "points",
  "2181": "plusMinus",
  "2170": "penalties",
  "2270": "shots",
  "2327": "ppp",
  "2344": "shp",
  "2147": "hits",
  "2092": "blocks",
  "231b": "wins",
  "2320": "gaa",
  "2230": "saves",
  "2330": "savePercent",
  "2290": "shutouts",
};

const readPlayoffsFile = (): PlayoffsFile => {
  const raw = readFileSync(PLAYOFFS_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid playoffs mapping file: ${PLAYOFFS_PATH}`);
  }

  const file = parsed as Partial<PlayoffsFile>;
  if (file.schemaVersion !== 3 || !Array.isArray(file.seasons)) {
    throw new Error(
      `Unsupported playoffs mapping schema in ${PLAYOFFS_PATH}. Expected schemaVersion 3. ` +
        `Re-run npm run playwright:sync:playoffs to regenerate it.`,
    );
  }

  return parsed as PlayoffsFile;
};

const readExistingFinalsFile = (): FinalsFile | null => {
  try {
    const raw = readFileSync(FINALS_PATH, "utf8");
    return parseFinalsFile(JSON.parse(raw), FINALS_PATH);
  } catch {
    return null;
  }
};

const extractCategoryId = (scipId: string): string | null => {
  const parts = scipId.split("#");
  return parts.length >= 2 ? parts[1] : null;
};

const getStatKeyFromScipId = (scipId: string): FinalStatKey | null => {
  const categoryId = extractCategoryId(scipId);
  return categoryId ? STAT_KEY_BY_CATEGORY_ID[categoryId] ?? null : null;
};

const createEmptyFinalTotals = (): FinalTotals => ({
  goals: 0,
  assists: 0,
  points: 0,
  plusMinus: 0,
  penalties: 0,
  shots: 0,
  ppp: 0,
  shp: 0,
  hits: 0,
  blocks: 0,
  wins: 0,
  saves: 0,
  shutouts: 0,
  gaa: undefined,
  savePercent: undefined,
});

const roundTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const buildTotalsFromAggregateRows = (
  activeStats: LiveScoringTeamStats,
  goalieGames: number,
): FinalTotals => {
  const totals = createEmptyFinalTotals();
  const statsMap = activeStats.statsMap ?? {};
  const aggregateRows = ["_2010", "_2020"];
  let rawGaa: number | null = null;
  let rawSavePercent: number | null = null;

  for (const aggregateKey of aggregateRows) {
    const entries = statsMap[aggregateKey]?.object2 ?? [];
    for (const entry of entries) {
      const statKey = getStatKeyFromScipId(entry.scipId);
      if (!statKey) continue;

      if (statKey === "gaa") {
        rawGaa = entry.av;
        continue;
      }

      if (statKey === "savePercent") {
        rawSavePercent = entry.av;
        continue;
      }

      totals[statKey] = entry.av;
    }
  }

  totals.gaa = formatFinalGoalieGaa(rawGaa, goalieGames);
  totals.savePercent = formatFinalGoalieSavePercent(
    rawSavePercent,
    goalieGames,
  );

  return totals;
};

const deriveGoalieGamesFromTotals = (
  activeStats: LiveScoringTeamStats,
): number => {
  const goalieAggregate = activeStats.statsMap?.["_2020"]?.object2 ?? [];
  const byStatKey = new Map<FinalStatKey, number>();

  for (const entry of goalieAggregate) {
    const statKey = getStatKeyFromScipId(entry.scipId);
    if (!statKey) continue;
    byStatKey.set(statKey, entry.av);
  }

  const wins = byStatKey.get("wins") ?? 0;
  const saves = byStatKey.get("saves") ?? 0;
  const shutouts = byStatKey.get("shutouts") ?? 0;
  const gaa = byStatKey.get("gaa");
  const savePercent = byStatKey.get("savePercent");

  if (
    gaa == null ||
    savePercent == null ||
    !Number.isFinite(gaa) ||
    !Number.isFinite(savePercent) ||
    !Number.isFinite(saves) ||
    savePercent <= 0 ||
    savePercent > 1
  ) {
    return deriveFallbackFinalGoalieGames({ wins, saves, shutouts });
  }

  if (gaa === 0 && savePercent === 1) {
    return Math.max(shutouts, wins, 0);
  }

  if (gaa <= 0) {
    return Math.max(wins, shutouts, 0);
  }

  const shotsAgainst = saves / savePercent;
  const goalsAgainst = shotsAgainst - saves;

  if (!Number.isFinite(goalsAgainst) || goalsAgainst < 0) {
    return Math.max(wins, shutouts, 0);
  }

  if (Math.abs(goalsAgainst) < 0.000001) {
    return Math.max(shutouts, wins, 0);
  }

  return Math.max(0, Math.round(goalsAgainst / gaa));
};

const buildCategoryPointsByKey = (
  activeStats: LiveScoringTeamStats,
  matchupKey: string,
): Partial<Record<FinalStatKey, number>> => {
  const raw = activeStats.totPtsPerMchup?.[matchupKey] ?? {};
  const out: Partial<Record<FinalStatKey, number>> = {};

  for (const [rawKey, value] of Object.entries(raw)) {
    const statKey = getStatKeyFromScipId(rawKey);
    if (!statKey) continue;
    out[statKey] = value;
  }

  return out;
};

const compareRawCategoryValues = (
  key: FinalStatKey,
  awayValue: FinalCategoryResultValue,
  homeValue: FinalCategoryResultValue,
  awayGoalieGames: number,
  homeGoalieGames: number,
): FinalCategoryWinner => {
  if (key === "gaa" || key === "savePercent") {
    return compareFinalGoalieRateWinner(
      key,
      awayValue,
      homeValue,
      awayGoalieGames,
      homeGoalieGames,
    );
  }

  const awayNumber = Number(awayValue);
  const homeNumber = Number(homeValue);

  if (!Number.isFinite(awayNumber) || !Number.isFinite(homeNumber)) {
    return "tie";
  }

  if (Math.abs(awayNumber - homeNumber) < 0.000001) {
    return "tie";
  }

  return awayNumber > homeNumber ? "away" : "home";
};

const buildCategoryResults = (
  awayTeam: FinalTeam,
  homeTeam: FinalTeam,
  awayCategoryPoints: Partial<Record<FinalStatKey, number>>,
  homeCategoryPoints: Partial<Record<FinalStatKey, number>>,
): Record<FinalStatKey, FinalCategoryResult> => {
  const results = {} as Record<FinalStatKey, FinalCategoryResult>;

  for (const key of FINAL_STAT_KEYS) {
    const isGoalieRateKey = key === "gaa" || key === "savePercent";
    const awayValue = (awayTeam.totals[key] ?? null) as FinalCategoryResultValue;
    const homeValue = (homeTeam.totals[key] ?? null) as FinalCategoryResultValue;

    if (!isGoalieRateKey && (awayValue == null || homeValue == null)) {
      continue;
    }

    const awayPoints = awayCategoryPoints[key];
    const homePoints = homeCategoryPoints[key];
    const winner =
      awayPoints != null && homePoints != null
        ? awayPoints === homePoints
          ? "tie"
          : awayPoints > homePoints
            ? "away"
            : "home"
        : compareRawCategoryValues(
            key,
            awayValue,
            homeValue,
            awayTeam.playedGames.goalies,
            homeTeam.playedGames.goalies,
          );

    results[key] = {
      away: awayValue,
      home: homeValue,
      winner,
    };
  }

  return results;
};

const requireTeamStats = (
  data: LiveScoringData,
  rosterTeamId: string,
): LiveScoringTeamStats => {
  const activeStats = data.statsPerTeam?.statsMap?.[rosterTeamId]?.ACTIVE;
  if (!activeStats) {
    throw new Error(`Missing ACTIVE team stats for roster team ${rosterTeamId}`);
  }

  return activeStats;
};

const buildFinalTeam = (args: {
  playoffTeam: PlayoffsTeam;
  activeStats: LiveScoringTeamStats;
  matchupKey: string;
  isWinner: boolean;
}): {
  team: FinalTeam;
  categoryPointsByKey: Partial<Record<FinalStatKey, number>>;
} => {
  const playerGameInfo = args.activeStats.playerGameInfo ?? [];
  const totalPlayedGames = playerGameInfo[0];
  if (!Number.isFinite(totalPlayedGames)) {
    throw new Error(
      `Missing played-games summary for ${args.playoffTeam.presentName}`,
    );
  }

  const goalieGames = deriveGoalieGamesFromTotals(args.activeStats);
  const playedGames = {
    total: totalPlayedGames,
    goalies: goalieGames,
    skaters: Math.max(0, totalPlayedGames - goalieGames),
  };

  const wlt = args.activeStats.wltPerMchup?.[args.matchupKey];
  if (!wlt) {
    throw new Error(
      `Missing matchup W-L-T summary for ${args.playoffTeam.presentName}`,
    );
  }

  const rawRotisseriePoints = args.activeStats.totalFpts;
  if (
    rawRotisseriePoints == null ||
    !Number.isFinite(rawRotisseriePoints)
  ) {
    throw new Error(
      `Missing rotisserie points total for ${args.playoffTeam.presentName}`,
    );
  }
  const rotisseriePoints = rawRotisseriePoints;

  const totals = buildTotalsFromAggregateRows(args.activeStats, goalieGames);
  const categoryPointsByKey = buildCategoryPointsByKey(
    args.activeStats,
    args.matchupKey,
  );

  return {
    team: {
      teamId: args.playoffTeam.id,
      teamName: args.playoffTeam.presentName,
      isWinner: args.isWinner,
      score: {
        categoriesWon: wlt[0],
        categoriesLost: wlt[1],
        categoriesTied: wlt[2],
        rotisseriePoints: roundTwoDecimals(rotisseriePoints),
      },
      playedGames,
      totals,
    },
    categoryPointsByKey,
  };
};

const captureLiveScoringRequestPostData = async (
  page: Page,
  leagueId: string,
  timeoutMs: number,
): Promise<string> => {
  const url = `${FANTRAX_URLS.league}/${encodeURIComponent(leagueId)}/livescoring?mobileMatchupView=true`;
  let liveScoringPostData: string | null = null;

  const handleRequest = (request: import("playwright").Request): void => {
    if (!request.url().includes(`/fxpa/req?leagueId=${leagueId}`)) return;

    const postData = request.postData();
    if (!postData) return;

    try {
      const parsed = JSON.parse(postData) as {
        msgs?: Array<{ method?: string }>;
      };
      const methods = parsed.msgs?.map((msg) => msg.method) ?? [];
      if (
        methods.includes("getLiveScoringStats") &&
        methods.includes("getScoresSummaryData")
      ) {
        liveScoringPostData = postData;
      }
    } catch {
      // ignore malformed request payloads
    }
  };

  page.on("request", handleRequest);
  try {
    await page.goto(url, { waitUntil: "load", timeout: timeoutMs });

    if (page.url().includes("/login")) {
      throw new Error(
        `Not authenticated while loading live scoring page for leagueId=${leagueId}. ` +
          `Run npm run playwright:login first.`,
      );
    }

    const deadline = Date.now() + timeoutMs;
    while (!liveScoringPostData && Date.now() < deadline) {
      await page.waitForTimeout(250);
    }

    if (!liveScoringPostData) {
      throw new Error(
        `Timed out waiting for Fantrax live scoring request for leagueId=${leagueId}.`,
      );
    }

    return liveScoringPostData;
  } finally {
    page.off("request", handleRequest);
  }
};

const fetchLiveScoringData = async (
  page: Page,
  leagueId: string,
  postData: string,
): Promise<LiveScoringData> => {
  const envelope = await page.evaluate(
    async ({ targetLeagueId, requestBody }) => {
      const response = await fetch(`/fxpa/req?leagueId=${targetLeagueId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
        credentials: "include",
      });

      return (await response.json()) as LiveScoringEnvelope;
    },
    { targetLeagueId: leagueId, requestBody: postData },
  );

  const data = envelope.responses?.[0]?.data;
  if (!data) {
    throw new Error(`Missing getLiveScoringStats response for leagueId=${leagueId}`);
  }

  return data;
};

const buildFinalSeason = (args: {
  season: PlayoffsSeason;
  data: LiveScoringData;
}): FinalSeason => {
  const champion = args.season.teams.find((team) => team.isChampion);
  if (!champion) {
    throw new Error(`No champion found in playoffs mapping for ${args.season.year}`);
  }

  const matchupId = args.data.displayedSelections?.matchupId ?? "";
  if (
    !matchupId ||
    matchupId === "_NONE__NONE_" ||
    !matchupId.includes("_")
  ) {
    throw new Error(
      `No final matchup found on live scoring page for ${args.season.year}`,
    );
  }

  const [awayRosterTeamId, homeRosterTeamId] = matchupId.split("_");
  if (!awayRosterTeamId || !homeRosterTeamId) {
    throw new Error(
      `Could not parse away/home teams from matchup id "${matchupId}"`,
    );
  }

  const awayPlayoffTeam = args.season.teams.find(
    (team) => team.rosterTeamId === awayRosterTeamId,
  );
  const homePlayoffTeam = args.season.teams.find(
    (team) => team.rosterTeamId === homeRosterTeamId,
  );

  if (!awayPlayoffTeam || !homePlayoffTeam) {
    throw new Error(
      `Could not map away/home roster team ids to playoff teams for ${args.season.year}`,
    );
  }

  const matchupKey = args.data.matchupMap?.[matchupId];
  if (!matchupKey) {
    throw new Error(`Missing matchup key for "${matchupId}"`);
  }

  const awayActiveStats = requireTeamStats(args.data, awayRosterTeamId);
  const homeActiveStats = requireTeamStats(args.data, homeRosterTeamId);
  const awayIsWinner = awayPlayoffTeam.id === champion.id;
  const homeIsWinner = homePlayoffTeam.id === champion.id;

  if (awayIsWinner === homeIsWinner) {
    throw new Error(
      `Champion mapping does not match live scoring finalists for ${args.season.year}`,
    );
  }

  const away = buildFinalTeam({
    playoffTeam: awayPlayoffTeam,
    activeStats: awayActiveStats,
    matchupKey,
    isWinner: awayIsWinner,
  });
  const home = buildFinalTeam({
    playoffTeam: homePlayoffTeam,
    activeStats: homeActiveStats,
    matchupKey,
    isWinner: homeIsWinner,
  });

  const categoryResults = buildCategoryResults(
    away.team,
    home.team,
    away.categoryPointsByKey,
    home.categoryPointsByKey,
  );

  return {
    year: args.season.year,
    wonOnHomeTiebreak:
      home.team.isWinner &&
      away.team.score.rotisseriePoints === home.team.score.rotisseriePoints,
    awayTeam: away.team,
    homeTeam: home.team,
    categoryResults,
  };
};

async function main(): Promise<void> {
  requireAuthStateFile();
  ensureFantraxArtifactDir();

  const argv = process.argv.slice(2);
  const headless = !hasFlag(argv, "--headed");
  const slowMo = parseNumberArg(argv, "--slowmo") ?? 0;
  const timeoutMs = parseNumberArg(argv, "--timeout") ?? 60_000;
  const onlyYear = parseNumberArg(argv, "--year");

  const playoffs = readPlayoffsFile();
  const seasons = playoffs.seasons
    .slice()
    .filter((season) =>
      Number.isFinite(onlyYear ?? Number.NaN) ? season.year === onlyYear : true,
    )
    .sort((a, b) => a.year - b.year);

  if (!seasons.length) {
    console.info(
      onlyYear
        ? `No seasons found for --year=${onlyYear} in ${PLAYOFFS_PATH}`
        : `No seasons found in ${PLAYOFFS_PATH}`,
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

    const existing = readExistingFinalsFile();
    const seasonByYear = new Map<number, FinalSeason>();
    for (const season of existing?.seasons ?? []) {
      seasonByYear.set(season.year, season);
    }

    for (const season of seasons) {
      const champion = season.teams.find((team) => team.isChampion);
      if (!champion) {
        console.info(
          `Skipping ${season.year}: no champion in ${PLAYOFFS_PATH}.`,
        );
        continue;
      }

      console.info(`Syncing finals for ${season.year}`);
      try {
        const liveScoringPostData = await captureLiveScoringRequestPostData(
          page,
          season.leagueId,
          timeoutMs,
        );
        const data = await fetchLiveScoringData(
          page,
          season.leagueId,
          liveScoringPostData,
        );
        const finalSeason = buildFinalSeason({ season, data });
        seasonByYear.set(season.year, finalSeason);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.info(
          `Manual needed: ${season.year} (leagueId=${season.leagueId}) failed to sync finals: ${message}`,
        );
      }
    }

    const file: FinalsFile = {
      schemaVersion: FINALS_SCHEMA_VERSION,
      leagueName: playoffs.leagueName,
      scrapedAt: new Date().toISOString(),
      seasons: [...seasonByYear.values()].sort((a, b) => a.year - b.year),
    };

    writeFileSync(FINALS_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    console.info(`Saved finals mapping to ${FINALS_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
