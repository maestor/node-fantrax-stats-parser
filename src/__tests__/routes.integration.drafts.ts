import { createRequest, createResponse } from "node-mocks-http";
import { getOriginalDraft } from "../features/drafts/routes.js";
import { HTTP_STATUS } from "../shared/http.js";
import { createIntegrationDb } from "./integration-db.js";
import { expectArraySchema } from "./openapi-schema.js";
import { asRouteReq, getJsonBody } from "./routes.integration.helpers.js";

type RouteReq = Parameters<typeof getOriginalDraft>[0];

type OpeningDraftSeed = {
  pickNumber: number;
  round: number;
  draftedTeamId: string;
  ownerTeamId: string;
  playerName: string;
};

const insertOpeningDraftPicks = async (
  db: Awaited<ReturnType<typeof createIntegrationDb>>["db"],
  rows: readonly OpeningDraftSeed[],
): Promise<void> => {
  for (const row of rows) {
    await db.execute({
      sql: `INSERT INTO opening_draft_picks (
              pick_number, round, drafted_team_id, owner_team_id, player_name
            ) VALUES (?, ?, ?, ?, ?)`,
      args: [
        row.pickNumber,
        row.round,
        row.draftedTeamId,
        row.ownerTeamId,
        row.playerName,
      ],
    });
  }
};

export const registerDraftRouteIntegrationTests = (): void => {
  describe("draft routes", () => {
    test("returns opening draft picks grouped by drafted team in alphabetical order", async () => {
      const db = await createIntegrationDb();

      try {
        await insertOpeningDraftPicks(db.db, [
          {
            pickNumber: 11,
            round: 1,
            draftedTeamId: "19",
            ownerTeamId: "1",
            playerName: "Player C",
          },
          {
            pickNumber: 2,
            round: 1,
            draftedTeamId: "12",
            ownerTeamId: "10",
            playerName: "Player B",
          },
          {
            pickNumber: 1,
            round: 1,
            draftedTeamId: "12",
            ownerTeamId: "12",
            playerName: "Player A",
          },
          {
            pickNumber: 7,
            round: 1,
            draftedTeamId: "10",
            ownerTeamId: "10",
            playerName: "Player D",
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/draft/original",
        });
        const res = createResponse();

        await getOriginalDraft(asRouteReq<RouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toEqual([
          {
            team: { id: "12", name: "Anaheim Ducks" },
            picks: [
              {
                round: 1,
                pickNumber: 1,
                draftedPlayer: "Player A",
                originalOwner: { id: "12", name: "Anaheim Ducks" },
              },
              {
                round: 1,
                pickNumber: 2,
                draftedPlayer: "Player B",
                originalOwner: { id: "10", name: "Nashville Predators" },
              },
            ],
          },
          {
            team: { id: "10", name: "Nashville Predators" },
            picks: [
              {
                round: 1,
                pickNumber: 7,
                draftedPlayer: "Player D",
                originalOwner: { id: "10", name: "Nashville Predators" },
              },
            ],
          },
          {
            team: { id: "19", name: "Toronto Maple Leafs" },
            picks: [
              {
                round: 1,
                pickNumber: 11,
                draftedPlayer: "Player C",
                originalOwner: { id: "1", name: "Colorado Avalanche" },
              },
            ],
          },
        ]);
        expectArraySchema("OriginalDraftTeamGroup", body);
      } finally {
        await db.cleanup();
      }
    });
  });
};
