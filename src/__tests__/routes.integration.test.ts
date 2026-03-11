import { registerCareerRouteIntegrationTests } from "./routes.integration.career";
import { registerGoalieRouteIntegrationTests } from "./routes.integration.goalies";
import { registerLeaderboardRouteIntegrationTests } from "./routes.integration.leaderboard";
import { registerPlayerRouteIntegrationTests } from "./routes.integration.players";
import { registerSeasonRouteIntegrationTests } from "./routes.integration.seasons";

describe("routes integration", () => {
  registerSeasonRouteIntegrationTests();
  registerPlayerRouteIntegrationTests();
  registerGoalieRouteIntegrationTests();
  registerCareerRouteIntegrationTests();
  registerLeaderboardRouteIntegrationTests();
});
