import { registerCareerRouteIntegrationTests } from "./routes.integration.career.js";
import { registerDraftRouteIntegrationTests } from "./routes.integration.drafts.js";
import { registerGoalieRouteIntegrationTests } from "./routes.integration.goalies.js";
import { registerLeaderboardRouteIntegrationTests } from "./routes.integration.leaderboard.js";
import { registerPlayerRouteIntegrationTests } from "./routes.integration.players.js";
import { registerSeasonRouteIntegrationTests } from "./routes.integration.seasons.js";

describe("routes integration", () => {
  registerSeasonRouteIntegrationTests();
  registerDraftRouteIntegrationTests();
  registerPlayerRouteIntegrationTests();
  registerGoalieRouteIntegrationTests();
  registerCareerRouteIntegrationTests();
  registerLeaderboardRouteIntegrationTests();
});
