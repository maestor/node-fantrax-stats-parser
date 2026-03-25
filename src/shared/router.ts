import type { IncomingMessage, ServerResponse } from "http";

export type RouteParams = Record<string, string | undefined>;

export type RouteRequest<TParams extends RouteParams = RouteParams> =
  IncomingMessage & {
    params: TParams;
  };

export type RouteHandler<TParams extends RouteParams = RouteParams> = {
  bivarianceHack: (
    req: RouteRequest<TParams>,
    res: ServerResponse,
  ) => unknown | Promise<unknown>;
}["bivarianceHack"];

export type RouteDefinition = {
  method: string;
  path: string;
  handler: RouteHandler;
};

export const get = <TParams extends RouteParams>(
  path: string,
  handler: RouteHandler<TParams>,
): RouteDefinition => ({
  method: "GET",
  path,
  handler: handler as RouteHandler,
});
