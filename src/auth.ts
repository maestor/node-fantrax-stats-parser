import { send } from "micro";
import type { IncomingMessage, ServerResponse } from "http";

export type ApiKeyAuthOptions = {
  headerName?: string;
  allowBearerAuth?: boolean;
  requireAuth?: boolean;
  validKeys?: string[];
};

type Headers = IncomingMessage["headers"];
type RequestLike = {
  method?: string;
  headers: Headers;
};

export type RequestLikeHandler<Req extends RequestLike = RequestLike> = (
  req: Req,
  res: ServerResponse
) => unknown | Promise<unknown>;

const DEFAULT_HEADER = "x-api-key";

const parseBooleanEnv = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
};

const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

export const getApiKeysFromEnv = (): string[] => {
  const keys: string[] = [];

  const single = process.env.API_KEY?.trim();
  if (single) keys.push(single);

  const many = process.env.API_KEYS;
  if (many) {
    for (const part of many.split(",")) {
      const trimmed = part.trim();
      if (trimmed) keys.push(trimmed);
    }
  }

  return keys;
};

export const shouldRequireAuth = (keys: string[], explicit?: boolean): boolean => {
  if (explicit !== undefined) return explicit;
  const requireFromEnv = parseBooleanEnv(process.env.REQUIRE_API_KEY);
  if (requireFromEnv !== undefined) return requireFromEnv;
  return keys.length > 0;
};

export const extractApiKey = (
  req: RequestLike,
  headerName: string,
  allowBearerAuth: boolean
): string | undefined => {
  const headerValue = req.headers[headerName.toLowerCase()];
  if (typeof headerValue === "string" && headerValue.trim()) return headerValue.trim();
  if (Array.isArray(headerValue) && headerValue.length) {
    const first = String(headerValue[0] ?? "").trim();
    if (first) return first;
  }

  if (!allowBearerAuth) return undefined;
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string") return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
};

export const isValidApiKey = (provided: string, validKeys: string[]): boolean => {
  for (const key of validKeys) {
    if (constantTimeEquals(provided, key)) return true;
  }
  return false;
};

export const withApiKeyAuth = <Req extends RequestLike, H extends RequestLikeHandler<Req>>(
  handler: H,
  options: ApiKeyAuthOptions = {}
): H => {
  const validKeys = options.validKeys ?? getApiKeysFromEnv();
  const headerName = (options.headerName ?? process.env.API_KEY_HEADER ?? DEFAULT_HEADER)
    .trim()
    .toLowerCase();
  const allowBearerAuth = options.allowBearerAuth ?? true;
  const requireAuth = shouldRequireAuth(validKeys, options.requireAuth);

  return (async (req: Req, res: ServerResponse) => {
    if (!requireAuth) {
      return handler(req, res);
    }

    // Let CORS preflight through (micro-cors will handle it).
    if (req.method === "OPTIONS") {
      return handler(req, res);
    }

    const provided = extractApiKey(req, headerName, allowBearerAuth);
    if (!provided) {
      send(res, 401, { error: "Missing API key" });
      return;
    }

    if (!isValidApiKey(provided, validKeys)) {
      send(res, 403, { error: "Invalid API key" });
      return;
    }

    return handler(req, res);
  }) as H;
};
