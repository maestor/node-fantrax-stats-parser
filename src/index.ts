import { RequestHandler, send } from "micro";
import { router, get } from "microrouter";

import {
  getPlayersCombined,
  getPlayersSeason,
  getGoaliesCombined,
  getGoaliesSeason,
} from "./routes";

const service: RequestHandler = async (req, res) => {
  send(res, 200, "You are service index, enjoy!");
};

const notFound: RequestHandler = (req, res) =>
  send(res, 404, "Route not exists");

module.exports = router(
  get("/", service),
  get("/players/season/:reportType/:season/:sortBy", getPlayersSeason),
  get("/players/season/:reportType/:season", getPlayersSeason),
  get("/players/season/:reportType", getPlayersSeason),
  get("/players/combined/:reportType/:sortBy", getPlayersCombined),
  get("/players/combined/:reportType", getPlayersCombined),
  get("/goalies/season/:reportType/:season/:sortBy", getGoaliesSeason),
  get("/goalies/season/:reportType/:season", getGoaliesSeason),
  get("/goalies/season/:reportType", getGoaliesSeason),
  get("/goalies/combined/:reportType/:sortBy", getGoaliesCombined),
  get("/goalies/combined/:reportType", getGoaliesCombined),
  get("/*", notFound)
);
