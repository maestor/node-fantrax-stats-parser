import { registerCareerRouteIntegrationTests } from "./routes.integration.career.js";
import { registerGoalieRouteIntegrationTests } from "./routes.integration.goalies.js";
import { registerLeaderboardRouteIntegrationTests } from "./routes.integration.leaderboard.js";
import { registerPlayerRouteIntegrationTests } from "./routes.integration.players.js";
import { registerSeasonRouteIntegrationTests } from "./routes.integration.seasons.js";

describe("routes integration", () => {
  registerSeasonRouteIntegrationTests();
  registerPlayerRouteIntegrationTests();
  registerGoalieRouteIntegrationTests();
  registerCareerRouteIntegrationTests();
  registerLeaderboardRouteIntegrationTests();
});
