import type { IncomingMessage } from "http";
import type { MatchedRoute } from "rou3";
import { withCors } from "./http/cors";
import type { RequestHandler } from "./http/types";
import type {
  RouteDefinition,
  RouteHandler,
  RouteParams,
  RouteRequest,
} from "./shared/router";

type RouterModule = typeof import("rou3");
type RouteData = {
  handler: RouteHandler;
};

const normalizeRoutePath = (path: string): string =>
  path === "/*" ? "/**" : path;

const getPathname = (req: IncomingMessage): string => {
  const rawUrl = typeof req.url === "string" && req.url ? req.url : "/";
  const host =
    typeof req.headers.host === "string" ? req.headers.host : "localhost";

  try {
    return new URL(rawUrl, `http://${host}`).pathname;
  } catch {
    const pathname = rawUrl.split("?", 1)[0];
    return pathname || "/";
  }
};

const augmentRouteRequest = (
  req: IncomingMessage,
  params?: RouteParams,
): RouteRequest => Object.assign(req, { params: params ?? {} }) as RouteRequest;

export const createApp = async (
  routes: readonly RouteDefinition[],
): Promise<RequestHandler> => {
  const { addRoute, createRouter, findRoute } =
    (await import("rou3")) as RouterModule;
  const router = createRouter<RouteData>();

  for (const route of routes) {
    addRoute(router, route.method, normalizeRoutePath(route.path), {
      handler: route.handler,
    });
  }

  return withCors(async (req, res) => {
    const match = findRoute(
      router,
      typeof req.method === "string" ? req.method.toUpperCase() : undefined,
      getPathname(req),
      { params: true },
    ) as MatchedRoute<RouteData> | undefined;

    if (!match) {
      res.statusCode = 404;
      res.end("Route not exists");
      return;
    }

    return match.data.handler(augmentRouteRequest(req, match.params), res);
  });
};
