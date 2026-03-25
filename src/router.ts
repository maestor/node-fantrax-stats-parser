import type { IncomingMessage } from "http";
import type { RequestHandler } from "micro";
import type { MatchedRoute } from "rou3";
import type {
  RouteDefinition,
  RouteHandler,
  RouteParams,
  RouteRequest,
} from "./shared/router";

type CorsFactory = () => (handler: RequestHandler) => RequestHandler;
type RouterModule = typeof import("rou3");
type RouteData = {
  handler: RouteHandler;
};

const microCors = require("micro-cors") as CorsFactory;
const importRou3 = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<RouterModule>;

const cors = microCors();

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
    await importRou3("rou3");
  const router = createRouter<RouteData>();

  for (const route of routes) {
    addRoute(router, route.method, normalizeRoutePath(route.path), {
      handler: route.handler,
    });
  }

  return cors(async (req, res) => {
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
