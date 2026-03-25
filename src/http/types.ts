import type { IncomingMessage, ServerResponse } from "http";

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => unknown | Promise<unknown>;
