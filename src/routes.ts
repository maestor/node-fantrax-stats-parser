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

const responseCache = new Map<string, { etag: string; data: unknown }>();

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
  handler: () => Promise<unknown>,
) => {
  const cacheKey = req ? buildCacheKey(req) : undefined;
  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached) {
      setCachedOkHeaders(res, cached.etag);
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
    const data = await handler();
    if (cacheKey) {
      const etag = makeEtagForJson(data);
      responseCache.set(cacheKey, { etag, data });
      setCachedOkHeaders(res, etag);
      if (req && isIfNoneMatchHit(req, etag)) {
        res.statusCode = 304;
        res.end();
        return;
      }
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
): Promise<T> => {
  if (snapshotKey) {
    try {
      const snapshot = await loadSnapshot<T>(snapshotKey);
      if (snapshot !== null) {
        return snapshot;
      }
    } catch {
      // Fall back to live data when snapshot storage is unavailable or malformed.
    }
  }

  return fallback();
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
  await withErrorHandlingCached(req, res, () => getTeamsWithData());
};

export const getSeasons: AugmentedRequestHandler = async (req, res) => {
  const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
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

  await withErrorHandlingCached(req, res, () =>
    getAvailableSeasons(teamId, report, startFrom),
  );
};

export const getPlayersSeason: AugmentedRequestHandler = async (req, res) => {
  const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
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

  await withErrorHandlingCached(req, res, () =>
    getPlayersStatsSeason(report, season, teamId),
  );
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
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
  const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
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

  await withErrorHandlingCached(req, res, () =>
    getGoaliesStatsSeason(report, season, teamId),
  );
};

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
  const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
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
  await withErrorHandlingCached(req, res, () =>
    getPlayerCareerData(req.params.id),
  );
};

export const getCareerGoalie: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, () =>
    getGoalieCareerData(req.params.id),
  );
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
    return { lastModified };
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
