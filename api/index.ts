import type { IncomingMessage, ServerResponse } from "http";

import app from "../src/app.js";
import { normalizeVercelUrl } from "../src/shared/vercel-url.js";

const getHeaderValue = (
  value: string | string[] | undefined,
): string | undefined => {
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

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const effectiveUrl = normalizeVercelUrl(getEffectiveUrl(req));
  req.url = effectiveUrl;

  return app(req, res);
}
