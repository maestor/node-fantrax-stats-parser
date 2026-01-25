import { send } from "micro";
import { AugmentedRequestHandler, ServerResponse } from "microrouter";
import type { IncomingMessage } from "http";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
} from "./services";
import { PlayerFields, GoalieFields, Report } from "./types";
import {
  reportTypeAvailable,
  seasonAvailable,
  parseSeasonParam,
  resolveTeamId,
  getTeamsWithCsvFolders,
} from "./helpers";
import { HTTP_STATUS, ERROR_MESSAGES } from "./constants";
import {
  buildCacheKey,
  isIfNoneMatchHit,
  makeEtagForJson,
  setCachedOkHeaders,
  setNoStoreHeaders,
} from "./cache";

const responseCache = new Map<string, { etag: string; data: unknown }>();

export const resetRouteCachesForTests = (): void => {
  responseCache.clear();
};

const getQueryParam = (req: unknown, key: string): string | undefined => {
  const request = req as { url?: unknown; headers?: Record<string, unknown> };
  if (typeof request?.url !== "string") return undefined;

  const host = typeof request.headers?.host === "string" ? request.headers.host : "localhost";
  const url = new URL(request.url, `http://${host}`);
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
    const statusCode =
      typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode) || HTTP_STATUS.INTERNAL_SERVER_ERROR
        : HTTP_STATUS.INTERNAL_SERVER_ERROR;
    send(res, statusCode, error);
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
  await withErrorHandlingCached(req, res, async () => getTeamsWithCsvFolders());
};

export const getSeasons: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const reportRaw = (req as unknown as { params?: { reportType?: unknown } }).params?.reportType;
  const report = (typeof reportRaw === "string" ? reportRaw : "regular") as Report;

  if (!reportTypeAvailable(report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  await withErrorHandlingCached(req, res, () => getAvailableSeasons(teamId, report));
};

export const getPlayersSeason: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;
  const season = parseSeasonParam(req.params.season);

  if (!reportTypeAvailable(report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  if (!seasonAvailable(season, teamId, report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
    return;
  }

  await withErrorHandlingCached(req, res, () => getPlayersStatsSeason(report, season, sortBy, teamId));
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;

  if (!reportTypeAvailable(report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  await withErrorHandlingCached(req, res, () => getPlayersStatsCombined(report, sortBy, teamId));
};

export const getGoaliesSeason: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;
  const season = parseSeasonParam(req.params.season);

  if (!reportTypeAvailable(report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  if (!seasonAvailable(season, teamId, report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
    return;
  }

  await withErrorHandlingCached(req, res, () => getGoaliesStatsSeason(report, season, sortBy, teamId));
};

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;

  if (!reportTypeAvailable(report)) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  await withErrorHandlingCached(req, res, () => getGoaliesStatsCombined(report, sortBy, teamId));
};
