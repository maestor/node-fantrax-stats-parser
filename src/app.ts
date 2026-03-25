import type { RequestHandler } from "micro";
import { send } from "micro";

import { withApiKeyAuth } from "./auth";
import { createApp } from "./router";
import { get, type RouteDefinition, type RouteHandler } from "./shared/router";

import {
  getPlayersCombined,
  getPlayersSeason,
  getGoaliesCombined,
  getGoaliesSeason,
} from "./features/stats/routes";
import {
  getCareerPlayer,
  getCareerGoalie,
  getCareerPlayers,
  getCareerGoalies,
  getCareerHighlights,
} from "./features/career/routes";
import {
  getPlayoffsLeaderboard,
  getRegularLeaderboard,
  getTransactionsLeaderboard,
} from "./features/leaderboard/routes";
import {
  getLastModified,
  getSeasons,
  getTeams,
} from "./features/meta/routes";
import { getOpenApiSpec, getSwaggerUi } from "./openapi";
import { HTTP_STATUS } from "./shared/http";
import { sendNoStore } from "./shared/route-utils";

const service: RouteHandler = async (_req, res) => {
  send(res, 200, "Hello there! The FFHL Stats Service is running.");
};

const notFound: RouteHandler = (_req, res) => send(res, 404, "Route not exists");

export const getHealthcheck: RouteHandler = async (_req, res) => {
  sendNoStore(res, HTTP_STATUS.OK, {
    status: "ok",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

const protectedRoute = <H extends (...args: never[]) => unknown>(handler: H): H =>
  withApiKeyAuth(handler as never) as H;

const routes = [
  get("/", service),
  get("/healthcheck", getHealthcheck),
  get("/health", getHealthcheck),
  get("/last-modified", protectedRoute(getLastModified)),
  get("/teams", protectedRoute(getTeams)),
  get("/seasons", protectedRoute(getSeasons)),
  get("/seasons/:reportType", protectedRoute(getSeasons)),
  get("/players/season/:reportType/:season", protectedRoute(getPlayersSeason)),
  get("/players/season/:reportType", protectedRoute(getPlayersSeason)),
  get("/players/combined/:reportType", protectedRoute(getPlayersCombined)),
  get("/goalies/season/:reportType/:season", protectedRoute(getGoaliesSeason)),
  get("/goalies/season/:reportType", protectedRoute(getGoaliesSeason)),
  get("/goalies/combined/:reportType", protectedRoute(getGoaliesCombined)),
  get("/career/players", protectedRoute(getCareerPlayers)),
  get("/career/goalies", protectedRoute(getCareerGoalies)),
  get("/career/highlights/:type", protectedRoute(getCareerHighlights)),
  get("/career/player/:id", protectedRoute(getCareerPlayer)),
  get("/career/goalie/:id", protectedRoute(getCareerGoalie)),
  get("/leaderboard/playoffs", protectedRoute(getPlayoffsLeaderboard)),
  get("/leaderboard/regular", protectedRoute(getRegularLeaderboard)),
  get("/leaderboard/transactions", protectedRoute(getTransactionsLeaderboard)),
  get("/openapi.json", getOpenApiSpec),
  get("/api-docs", getSwaggerUi),
  get("/*", notFound),
] satisfies ReadonlyArray<RouteDefinition>;

let appPromise: Promise<RequestHandler> | undefined;

const getApp = (): Promise<RequestHandler> => {
  appPromise ??= createApp(routes);
  return appPromise;
};

const app: RequestHandler = async (req, res) => (await getApp())(req, res);

export default app;
