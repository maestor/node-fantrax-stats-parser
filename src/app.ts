import { withApiKeyAuth } from "./auth.js";
import { send } from "./http/response.js";
import type { RequestHandler } from "./http/types.js";
import { createApp } from "./router.js";
import { get, type RouteDefinition, type RouteHandler } from "./shared/router.js";

import {
  getPlayersCombined,
  getPlayersSeason,
  getGoaliesCombined,
  getGoaliesSeason,
} from "./features/stats/routes.js";
import {
  getCareerPlayer,
  getCareerGoalie,
  getCareerPlayers,
  getCareerGoalies,
  getCareerHighlights,
} from "./features/career/routes.js";
import {
  getPlayoffsLeaderboard,
  getRegularLeaderboard,
  getTransactionsLeaderboard,
} from "./features/leaderboard/routes.js";
import {
  getLastModified,
  getSeasons,
  getTeams,
} from "./features/meta/routes.js";
import { getOriginalDraft } from "./features/drafts/routes.js";
import { getOpenApiSpec, getSwaggerUi } from "./openapi.js";
import { HTTP_STATUS } from "./shared/http.js";
import { sendNoStore } from "./shared/route-utils.js";

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
  get("/draft/original", protectedRoute(getOriginalDraft)),
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
