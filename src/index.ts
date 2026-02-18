import type { RequestHandler } from "micro";
import { send } from "micro";
import { router, get } from "microrouter";
const cors = require("micro-cors")();

import { withApiKeyAuth } from "./auth";

import {
  getSeasons,
  getTeams,
  getHealthcheck,
  getPlayersCombined,
  getPlayersSeason,
  getGoaliesCombined,
  getGoaliesSeason,
  getLastModified,
  getPlayoffsLeaderboard,
} from "./routes";

const service: RequestHandler = async (_req, res) => {
  send(res, 200, "Hello there! The FFHL Stats Service is running.");
};

const notFound: RequestHandler = (_req, res) => send(res, 404, "Route not exists");

// Generic wrapper: keep the handler's original (microrouter) request type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protectedRoute = <H extends (req: any, res: any) => any>(handler: H): H => withApiKeyAuth(handler);

module.exports = cors(
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
    get("/leaderboard/playoffs", protectedRoute(getPlayoffsLeaderboard)),
    get("/*", notFound)
  )
);
