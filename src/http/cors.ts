import type { IncomingMessage, ServerResponse } from "http";

import type { RequestHandler } from "./types";

const ALLOW_METHODS = "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS";
const ALLOW_HEADERS = "Authorization, Content-Type, X-Requested-With, x-api-key";

const setCorsHeaders = (
  _req: IncomingMessage,
  res: ServerResponse,
): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
};

export const withCors = (handler: RequestHandler): RequestHandler =>
  async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    return handler(req, res);
  };
