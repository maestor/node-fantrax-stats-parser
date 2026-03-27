import { createRequest, createResponse } from "node-mocks-http";
import {
  getEntryDraft,
  getOriginalDraft,
} from "../features/drafts/routes.js";
import { HTTP_STATUS } from "../shared/http.js";
import { createIntegrationDb } from "./integration-db.js";
import { expectArraySchema } from "./openapi-schema.js";
import { asRouteReq, getJsonBody } from "./routes.integration.helpers.js";

type OriginalDraftReq = Parameters<typeof getOriginalDraft>[0];
type EntryDraftReq = Parameters<typeof getEntryDraft>[0];

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

type EntryDraftSeed = OpeningDraftSeed & {
  season: number;
};

const insertEntryDraftPicks = async (
  db: Awaited<ReturnType<typeof createIntegrationDb>>["db"],
  rows: readonly EntryDraftSeed[],
): Promise<void> => {
  for (const row of rows) {
    await db.execute({
      sql: `INSERT INTO entry_draft_picks (
              season, pick_number, round, drafted_team_id, owner_team_id, player_name
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        row.season,
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

        await getOriginalDraft(asRouteReq<OriginalDraftReq>(req), res);

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
        expectArraySchema("OpeningDraftTeamGroup", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns entry draft picks grouped by drafted team with newest seasons first", async () => {
      const db = await createIntegrationDb();

      try {
        await insertEntryDraftPicks(db.db, [
          {
            season: 2024,
            pickNumber: 33,
            round: 2,
            draftedTeamId: "19",
            ownerTeamId: "1",
            playerName: "Player C",
          },
          {
            season: 2025,
            pickNumber: 2,
            round: 1,
            draftedTeamId: "12",
            ownerTeamId: "10",
            playerName: "Player B",
          },
          {
            season: 2025,
            pickNumber: 1,
            round: 1,
            draftedTeamId: "19",
            ownerTeamId: "19",
            playerName: "Player A",
          },
          {
            season: 2024,
            pickNumber: 4,
            round: 1,
            draftedTeamId: "19",
            ownerTeamId: "19",
            playerName: "Player D",
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/draft/entry",
        });
        const res = createResponse();

        await getEntryDraft(asRouteReq<EntryDraftReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toEqual([
          {
            team: { id: "12", name: "Anaheim Ducks" },
            seasons: [
              {
                season: 2025,
                picks: [
                  {
                    round: 1,
                    pickNumber: 2,
                    draftedPlayer: "Player B",
                    originalOwner: { id: "10", name: "Nashville Predators" },
                  },
                ],
              },
            ],
          },
          {
            team: { id: "19", name: "Toronto Maple Leafs" },
            seasons: [
              {
                season: 2025,
                picks: [
                  {
                    round: 1,
                    pickNumber: 1,
                    draftedPlayer: "Player A",
                    originalOwner: { id: "19", name: "Toronto Maple Leafs" },
                  },
                ],
              },
              {
                season: 2024,
                picks: [
                  {
                    round: 1,
                    pickNumber: 4,
                    draftedPlayer: "Player D",
                    originalOwner: { id: "19", name: "Toronto Maple Leafs" },
                  },
                  {
                    round: 2,
                    pickNumber: 33,
                    draftedPlayer: "Player C",
                    originalOwner: { id: "1", name: "Colorado Avalanche" },
                  },
                ],
              },
            ],
          },
        ]);
        expectArraySchema("EntryDraftTeamGroup", body);
      } finally {
        await db.cleanup();
      }
    });
  });
};
