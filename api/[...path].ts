import type { IncomingMessage, ServerResponse } from "http";

// `src/index.ts` exports the request handler via CommonJS (module.exports).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const handler = require("../src/index") as (
  req: IncomingMessage,
  res: ServerResponse
) => unknown | Promise<unknown>;

const stripApiPrefix = (url: string): string => {
  if (url === "/api") return "/";
  if (url.startsWith("/api/")) return url.slice("/api".length);
  if (url.startsWith("/api?")) return url.slice("/api".length);
  return url;
};

const normalizeUrl = (url: string): string => {
  const [pathname, query = ""] = url.split("?", 2);

  let normalizedPath = pathname;
  if (normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  return query ? `${normalizedPath}?${query}` : normalizedPath;
};

const getHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
};

const getEffectiveUrl = (req: IncomingMessage): string => {
  const candidateHeaders = [
    "x-forwarded-uri",
    "x-original-url",
    "x-rewrite-url",
    "x-vercel-rewrite",
    "x-vercel-original-url",
  ] as const;

  for (const headerName of candidateHeaders) {
    const headerValue = getHeaderValue(req.headers[headerName]);
    if (headerValue) return headerValue;
  }

  return typeof req.url === "string" ? req.url : "/";
};

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  const effectiveUrl = normalizeUrl(stripApiPrefix(getEffectiveUrl(req)));
  req.url = effectiveUrl;

  return handler(req, res);
}
