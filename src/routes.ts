import { send } from "micro";
import { AugmentedRequestHandler, ServerResponse } from "microrouter";
import type { IncomingMessage } from "http";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
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

const responseCache = new Map<string, { etag: string; data: unknown }>();

const getStatusCode = (err: unknown): number => {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = Number((err as Record<string, unknown>).statusCode);
    return code || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }
  return HTTP_STATUS.INTERNAL_SERVER_ERROR;
};

export const resetRouteCachesForTests = (): void => {
  responseCache.clear();
};

type QueryParamRequest = { url?: unknown; headers?: Record<string, unknown> };

const getQueryParam = (req: QueryParamRequest, key: string): string | undefined => {
  if (typeof req.url !== "string") return undefined;

  const host = typeof req.headers?.host === "string" ? req.headers.host : "localhost";
  const url = new URL(req.url, `http://${host}`);
  const value = url.searchParams.get(key);
  return value === null ? undefined : value;
};

const withErrorHandlingCached = async (
  req: IncomingMessage | undefined,
  res: ServerResponse,
  handler: () => Promise<unknown>
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
    send(res, getStatusCode(error), error);
  }
};

const sendNoStore = (res: ServerResponse, status: number, body: unknown): void => {
  setNoStoreHeaders(res);
  send(res, status, body);
};

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
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }
  const report = rawReport as Report;

  await withErrorHandlingCached(req, res, () => getAvailableSeasons(teamId, report, startFrom));
};

export const getPlayersSeason: AugmentedRequestHandler = async (req, res) => {
  const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
  const season = parseSeasonParam(req.params.season);
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }
  const report = req.params.reportType as Report;

  if (!(await seasonAvailable(season, teamId, report))) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
    return;
  }

  await withErrorHandlingCached(req, res, () => getPlayersStatsSeason(report, season, teamId));
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
  const startFrom = parseSeasonParam(getQueryParam(req, "startFrom"));
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }
  const report = req.params.reportType as Report;

  await withErrorHandlingCached(req, res, () => getPlayersStatsCombined(report, teamId, startFrom));
};

export const getGoaliesSeason: AugmentedRequestHandler = async (req, res) => {
  const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
  const season = parseSeasonParam(req.params.season);
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }
  const report = req.params.reportType as Report;

  if (!(await seasonAvailable(season, teamId, report))) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
    return;
  }

  await withErrorHandlingCached(req, res, () => getGoaliesStatsSeason(report, season, teamId));
};

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
  const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
  const startFrom = parseSeasonParam(getQueryParam(req, "startFrom"));
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }
  const report = req.params.reportType as Report;

  await withErrorHandlingCached(req, res, () => getGoaliesStatsCombined(report, teamId, startFrom));
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
  await withErrorHandlingCached(req, res, () => getPlayoffLeaderboardData());
};

export const getRegularLeaderboard: AugmentedRequestHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () => getRegularLeaderboardData());
};
