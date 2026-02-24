import crypto from "crypto";
import type { IncomingMessage, ServerResponse } from "http";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const getHeaderString = (req: IncomingMessage, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
};

export const getDeployCacheSalt = (): string => {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    "local"
  );
};

export const normalizeUrlForCacheKey = (rawUrl: string, hostHeader?: string): string => {
  const host = typeof hostHeader === "string" && hostHeader.trim() ? hostHeader : "localhost";
  const url = new URL(rawUrl, `http://${host}`);

  // Normalize the path: handle both /api/* and /* URLs (Vercel supports both).
  let pathname = url.pathname;
  if (pathname.startsWith("/api/")) pathname = pathname.slice(4);
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);

  // Sort query params to avoid duplicate cache entries.
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const search = params.length
    ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`
    : "";

  return `${pathname}${search}`;
};

export const buildCacheKey = (req: IncomingMessage): string | undefined => {
  if (req.method !== "GET") return undefined;
  if (typeof req.url !== "string") return undefined;

  const normalized = normalizeUrlForCacheKey(req.url, getHeaderString(req, "host"));
  return `${getDeployCacheSalt()}:${normalized}`;
};

export const setNoStoreHeaders = (res: ServerResponse): void => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
};

const appendVary = (res: ServerResponse, values: string[]): void => {
  const existing = res.getHeader("Vary");
  const existingValues = typeof existing === "string" ? existing.split(",").map((s) => s.trim()) : [];
  const merged = [...new Set([...existingValues, ...values])].filter(Boolean);
  res.setHeader("Vary", merged.join(", "));
};

export const setCachedOkHeaders = (res: ServerResponse, etag: string): void => {
  // Edge cache. Keep max-age=0 so browsers revalidate, while CDN can keep it.
  res.setHeader(
    "Cache-Control",
    `public, max-age=0, s-maxage=${ONE_YEAR_SECONDS}, stale-while-revalidate=60`
  );
  res.setHeader("ETag", etag);

  // Safe default with header-based auth. If this proves too restrictive later,
  // you can remove Vary once you're comfortable sharing cached responses.
  appendVary(res, ["authorization", "x-api-key"]);
};

export const makeEtagForJson = (data: unknown): string => {
  const json = JSON.stringify(data);
  const hash = crypto.createHash("sha1").update(json).digest("hex");
  return `"${hash}"`;
};

export const isIfNoneMatchHit = (req: IncomingMessage | undefined, etag: string): boolean => {
  if (!req) return false;
  const raw = getHeaderString(req, "if-none-match");
  if (!raw) return false;
  // Multiple ETags can be sent in a single header.
  const parts = raw.split(",").map((p) => p.trim());
  return parts.includes(etag) || parts.includes(`W/${etag}`);
};
