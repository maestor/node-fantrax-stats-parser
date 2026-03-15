import { send } from "micro";
import { ServerResponse } from "microrouter";
import type { IncomingMessage } from "http";
import {
  buildCacheKey,
  isIfNoneMatchHit,
  makeEtagForJson,
  setCachedOkHeaders,
  setNoStoreHeaders,
} from "../cache";
import { HTTP_STATUS } from "../constants";
import { loadSnapshot } from "../snapshots";

export type DataSource = "snapshot" | "db";

export type HandlerResult<T = unknown> = {
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

export const getQueryParam = (
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

export const withErrorHandlingCached = async (
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

export const sendNoStore = (
  res: ServerResponse,
  status: number,
  body: unknown,
): void => {
  setNoStoreHeaders(res);
  send(res, status, body);
};

export const loadSnapshotOrFallback = async <T>(
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
