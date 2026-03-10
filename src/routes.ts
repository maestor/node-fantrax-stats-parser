import { send } from "micro";
import { AugmentedRequestHandler, ServerResponse } from "microrouter";
import type { IncomingMessage } from "http";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
  getPlayerCareerData,
  getGoalieCareerData,
  getCareerPlayersData,
  getCareerGoaliesData,
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
} from "./services";
import { Report } from "./types";
import {
  reportTypeAvailable,
  seasonAvailable,
  parseSeasonParam,
  resolveTeamId,
  getTeamsWithData,
} from "./helpers";
import { HTTP_STATUS, ERROR_MESSAGES } from "./constants";
import {
  buildCacheKey,
  isIfNoneMatchHit,
  makeEtagForJson,
  setCachedOkHeaders,
  setNoStoreHeaders,
} from "./cache";
import { getLastModifiedFromDb } from "./db/queries";
import {
  getCareerGoaliesSnapshotKey,
  getCareerPlayersSnapshotKey,
  getCombinedSnapshotKey,
  getPlayoffsLeaderboardSnapshotKey,
  getRegularLeaderboardSnapshotKey,
  loadSnapshot,
} from "./snapshots";
import { START_SEASON, TEAMS } from "./constants";

type DataSource = "snapshot" | "db";

type HandlerResult<T = unknown> = {
  data: T;
  dataSource: DataSource;
};

const DATA_SOURCE_HEADER = "x-stats-data-source";

const responseCache = new Map<
  string,
  { etag: string; data: unknown; dataSource: DataSource }
>();

const getStatusCode = (err: unknown): number => {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = Number((err as Record<string, unknown>).statusCode);
    return code || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }
  return HTTP_STATUS.INTERNAL_SERVER_ERROR;
};

const getErrorBody = (err: unknown): unknown => {
  if (typeof err === "object" && err !== null && "body" in err) {
    return (err as Record<string, unknown>).body;
  }
  return err;
};

/** @internal Test-only export for clearing in-memory route caches. */
export const resetRouteCachesForTests = (): void => {
  responseCache.clear();
};

type QueryParamRequest = { url?: unknown; headers?: Record<string, unknown> };

const getQueryParam = (
  req: QueryParamRequest,
  key: string,
): string | undefined => {
  if (typeof req.url !== "string") return undefined;

  const host =
    typeof req.headers?.host === "string" ? req.headers.host : "localhost";
  const url = new URL(req.url, `http://${host}`);
  const value = url.searchParams.get(key);
  return value === null ? undefined : value;
};

const withErrorHandlingCached = async (
  req: IncomingMessage | undefined,
  res: ServerResponse,
  handler: () => Promise<HandlerResult>,
) => {
  const cacheKey = req ? buildCacheKey(req) : undefined;
  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached) {
      setCachedOkHeaders(res, cached.etag);
      res.setHeader(DATA_SOURCE_HEADER, cached.dataSource);
      if (isIfNoneMatchHit(req, cached.etag)) {
        res.statusCode = 304;
        res.end();
        return;
      }
      send(res, HTTP_STATUS.OK, cached.data);
      return;
    }
  }

  try {
    const result = await handler();
    const { data, dataSource } = result;
    if (cacheKey) {
      const etag = makeEtagForJson(data);
      responseCache.set(cacheKey, { etag, data, dataSource });
      setCachedOkHeaders(res, etag);
      res.setHeader(DATA_SOURCE_HEADER, dataSource);
      if (req && isIfNoneMatchHit(req, etag)) {
        res.statusCode = 304;
        res.end();
        return;
      }
    }
    if (!cacheKey) {
      res.setHeader(DATA_SOURCE_HEADER, dataSource);
    }
    send(res, HTTP_STATUS.OK, data);
  } catch (error) {
    setNoStoreHeaders(res);
    send(res, getStatusCode(error), getErrorBody(error));
  }
};

const sendNoStore = (
  res: ServerResponse,
  status: number,
  body: unknown,
): void => {
  setNoStoreHeaders(res);
  send(res, status, body);
};

const loadSnapshotOrFallback = async <T>(
  snapshotKey: string | undefined,
  fallback: () => Promise<T>,
): Promise<HandlerResult<T>> => {
  if (snapshotKey) {
    try {
      const snapshot = await loadSnapshot<T>(snapshotKey);
      if (snapshot !== null) {
        return { data: snapshot, dataSource: "snapshot" };
      }
    } catch {
      // Fall back to live data when snapshot storage is unavailable or malformed.
    }
  }

  return { data: await fallback(), dataSource: "db" };
};

const getDefaultStartFromForTeam = (teamId: string): number =>
  TEAMS.find((team) => team.id === teamId)?.firstSeason ?? START_SEASON;

export const getHealthcheck: AugmentedRequestHandler = async (_req, res) => {
  setNoStoreHeaders(res);
  send(res, HTTP_STATUS.OK, {
    status: "ok",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

export const getTeams: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: getTeamsWithData(),
    dataSource: "db",
  }));
};

export const getSeasons: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const startFrom = parseSeasonParam(getQueryParam(req, "startFrom"));

  const rawReport = req.params.reportType || "regular";
  if (!reportTypeAvailable(rawReport as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = rawReport as Report;

  await withErrorHandlingCached(req, res, async () => ({
    data: await getAvailableSeasons(teamId, report, startFrom),
    dataSource: "db",
  }));
};

export const getPlayersSeason: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const season = parseSeasonParam(req.params.season);
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = req.params.reportType as Report;

  if (!(await seasonAvailable(season, teamId, report))) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.SEASON_NOT_AVAILABLE,
    );
    return;
  }

  await withErrorHandlingCached(req, res, async () => ({
    data: await getPlayersStatsSeason(report, season, teamId),
    dataSource: "db",
  }));
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const startFrom = parseSeasonParam(getQueryParam(req, "startFrom"));
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = req.params.reportType as Report;
  const defaultStartFrom = getDefaultStartFromForTeam(teamId);

  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(
      startFrom === undefined || startFrom === defaultStartFrom
        ? getCombinedSnapshotKey("players", report, teamId)
        : undefined,
      () => getPlayersStatsCombined(report, teamId, startFrom),
    ),
  );
};

export const getGoaliesSeason: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const season = parseSeasonParam(req.params.season);
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = req.params.reportType as Report;

  if (!(await seasonAvailable(season, teamId, report))) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.SEASON_NOT_AVAILABLE,
    );
    return;
  }

  await withErrorHandlingCached(req, res, async () => ({
    data: await getGoaliesStatsSeason(report, season, teamId),
    dataSource: "db",
  }));
};

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const startFrom = parseSeasonParam(getQueryParam(req, "startFrom"));
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = req.params.reportType as Report;
  const defaultStartFrom = getDefaultStartFromForTeam(teamId);

  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(
      startFrom === undefined || startFrom === defaultStartFrom
        ? getCombinedSnapshotKey("goalies", report, teamId)
        : undefined,
      () => getGoaliesStatsCombined(report, teamId, startFrom),
    ),
  );
};

export const getCareerPlayer: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getPlayerCareerData(req.params.id),
    dataSource: "db",
  }));
};

export const getCareerGoalie: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getGoalieCareerData(req.params.id),
    dataSource: "db",
  }));
};

export const getCareerPlayers: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getCareerPlayersSnapshotKey(), () =>
      getCareerPlayersData(),
    ),
  );
};

export const getCareerGoalies: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getCareerGoaliesSnapshotKey(), () =>
      getCareerGoaliesData(),
    ),
  );
};

export const getLastModified: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => {
    const lastModified = await getLastModifiedFromDb();
    return {
      data: { lastModified },
      dataSource: "db",
    };
  });
};

export const getPlayoffsLeaderboard: AugmentedRequestHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getPlayoffsLeaderboardSnapshotKey(), () =>
      getPlayoffLeaderboardData(),
    ),
  );
};

export const getRegularLeaderboard: AugmentedRequestHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getRegularLeaderboardSnapshotKey(), () =>
      getRegularLeaderboardData(),
    ),
  );
};
