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

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  if (typeof req.url === "string") {
    req.url = stripApiPrefix(req.url);
  }

  return handler(req, res);
}
