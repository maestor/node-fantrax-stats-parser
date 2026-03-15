import type { RequestHandler } from "micro";
import { send } from "micro";
import { router, get, AugmentedRequestHandler } from "microrouter";
const cors = require("micro-cors")();

import { withApiKeyAuth } from "./auth";

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

const service: RequestHandler = async (_req, res) => {
  send(res, 200, "Hello there! The FFHL Stats Service is running.");
};

const notFound: RequestHandler = (_req, res) => send(res, 404, "Route not exists");

export const getHealthcheck: AugmentedRequestHandler = async (_req, res) => {
  sendNoStore(res, HTTP_STATUS.OK, {
    status: "ok",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

// Generic wrapper: keep the handler's original (microrouter) request type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protectedRoute = <H extends (req: any, res: any) => any>(handler: H): H => withApiKeyAuth(handler);

const app = cors(
  router(
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
    get("/*", notFound)
  )
);

module.exports = Object.assign(app, { getHealthcheck });
