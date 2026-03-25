import { createRequest, createResponse } from "node-mocks-http";
import {
  getPlayersCombined,
  getPlayersSeason,
} from "../features/stats/routes.js";
import { ERROR_MESSAGES, HTTP_STATUS } from "../shared/http.js";
import { createIntegrationDb } from "./integration-db.js";
import { expectArraySchema } from "./openapi-schema.js";
import {
  asRouteReq,
  getJsonBody,
  writeSnapshot,
} from "./routes.integration.helpers.js";

type SeasonRouteReq = Parameters<typeof getPlayersSeason>[0];
type CombinedRouteReq = Parameters<typeof getPlayersCombined>[0];

export const registerPlayerRouteIntegrationTests = (): void => {
  describe("player routes", () => {
    test("returns 400 for unavailable playoff season using the real DB season lookup", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            playerId: "p-playoff",
            name: "Playoff Only",
            position: "F",
            games: 4,
            goals: 2,
            assists: 2,
            points: 4,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/players/season/playoffs/2023?teamId=1",
          params: { reportType: "playoffs", season: "2023" },
        });
        const res = createResponse();

        await getPlayersSeason(asRouteReq<SeasonRouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(res._getData()).toBe(ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
        expect(res.getHeader("cache-control")).toBe("private, no-store");
      } finally {
        await db.cleanup();
      }
    });

    test("returns player season rows from the live DB", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-season",
            name: "Season Skater",
            position: "F",
            games: 12,
            goals: 5,
            assists: 7,
            points: 12,
            plusMinus: 4,
            penalties: 3,
            shots: 24,
            ppp: 2,
            hits: 6,
            blocks: 4,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/players/season/regular/2024?teamId=1",
          params: { reportType: "regular", season: "2024" },
        });
        const res = createResponse();

        await getPlayersSeason(asRouteReq<SeasonRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "p-season",
            name: "Season Skater",
            position: "F",
            games: 12,
            goals: 5,
            assists: 7,
            points: 12,
          }),
        );
        expectArraySchema("Player", body);
      } finally {
        await db.cleanup();
      }
    });

    test("omits null player positions from the live DB response", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-no-position",
            name: "Positionless Skater",
            position: null,
            games: 7,
            goals: 2,
            assists: 3,
            points: 5,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/players/season/regular/2024?teamId=1",
          params: { reportType: "regular", season: "2024" },
        });
        const res = createResponse();

        await getPlayersSeason(asRouteReq<SeasonRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "p-no-position",
            name: "Positionless Skater",
            games: 7,
            points: 5,
          }),
        );
        expect(body[0]).not.toHaveProperty("position");
        expectArraySchema("Player", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns the current configured player season when the season param is omitted", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2023,
            reportType: "regular",
            playerId: "p-old",
            name: "Older Skater",
            position: "F",
            games: 9,
            goals: 4,
            assists: 3,
            points: 7,
          },
          {
            teamId: "1",
            season: 2025,
            reportType: "regular",
            playerId: "p-new",
            name: "Newest Skater",
            position: "F",
            games: 12,
            goals: 5,
            assists: 6,
            points: 11,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/players/season/regular?teamId=1",
          params: { reportType: "regular" },
        });
        const res = createResponse();

        await getPlayersSeason(asRouteReq<SeasonRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "p-new",
            name: "Newest Skater",
            games: 12,
            points: 11,
          }),
        );
        expectArraySchema("Player", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns combined player data from the live DB and honors startFrom", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2023,
            reportType: "regular",
            playerId: "p-combined",
            name: "Combined Skater",
            position: "F",
            games: 8,
            goals: 3,
            assists: 4,
            points: 7,
            plusMinus: 1,
            penalties: 2,
            shots: 14,
            ppp: 1,
            hits: 4,
            blocks: 3,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-combined",
            name: "Combined Skater",
            position: "F",
            games: 10,
            goals: 5,
            assists: 6,
            points: 11,
            plusMinus: 3,
            penalties: 1,
            shots: 20,
            ppp: 2,
            shp: 1,
            hits: 7,
            blocks: 6,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/players/combined/regular?teamId=1&startFrom=2024",
          params: { reportType: "regular" },
          headers: { host: "localhost" },
        });
        const res = createResponse();

        await getPlayersCombined(asRouteReq<CombinedRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "p-combined",
            name: "Combined Skater",
            games: 10,
            goals: 5,
            assists: 6,
            points: 11,
          }),
        );
        expect(body[0].seasons).toEqual([
          expect.objectContaining({
            season: 2024,
            games: 10,
            points: 11,
          }),
        ]);
        expectArraySchema("CombinedPlayer", body);
      } finally {
        await db.cleanup();
      }
    });

    test("merges regular and playoff player stats across all seasons in combined both route", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2023,
            reportType: "regular",
            playerId: "p-both",
            name: "Merged Skater",
            position: "F",
            games: 8,
            goals: 3,
            assists: 4,
            points: 7,
            plusMinus: 1,
            shots: 14,
          },
          {
            teamId: "1",
            season: 2023,
            reportType: "playoffs",
            playerId: "p-both",
            name: "Merged Skater",
            position: "F",
            games: 2,
            goals: 1,
            assists: 1,
            points: 2,
            plusMinus: 1,
            shots: 4,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-both",
            name: "Merged Skater",
            position: "F",
            games: 10,
            goals: 5,
            assists: 6,
            points: 11,
            plusMinus: 3,
            shots: 20,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            playerId: "p-both",
            name: "Merged Skater",
            position: "F",
            games: 3,
            goals: 2,
            assists: 1,
            points: 3,
            plusMinus: 1,
            shots: 5,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/players/combined/both?teamId=1",
          params: { reportType: "both" },
        });
        const res = createResponse();

        await getPlayersCombined(asRouteReq<CombinedRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "p-both",
            name: "Merged Skater",
            games: 23,
            goals: 11,
            assists: 12,
            points: 23,
          }),
        );
        expect(body[0].seasons).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              season: 2023,
              games: 10,
              points: 9,
            }),
            expect.objectContaining({
              season: 2024,
              games: 13,
              points: 14,
            }),
          ]),
        );
        expectArraySchema("CombinedPlayer", body);
      } finally {
        await db.cleanup();
      }
    });

    test("honors startFrom in combined player both route", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2023,
            reportType: "regular",
            playerId: "p-filtered-both",
            name: "Filtered Merged Skater",
            position: "F",
            games: 8,
            goals: 3,
            assists: 4,
            points: 7,
          },
          {
            teamId: "1",
            season: 2023,
            reportType: "playoffs",
            playerId: "p-filtered-both",
            name: "Filtered Merged Skater",
            position: "F",
            games: 2,
            goals: 1,
            assists: 1,
            points: 2,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-filtered-both",
            name: "Filtered Merged Skater",
            position: "F",
            games: 10,
            goals: 5,
            assists: 6,
            points: 11,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            playerId: "p-filtered-both",
            name: "Filtered Merged Skater",
            position: "F",
            games: 3,
            goals: 2,
            assists: 1,
            points: 3,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/players/combined/both?teamId=1&startFrom=2024",
          params: { reportType: "both" },
          headers: { host: "localhost" },
        });
        const res = createResponse();

        await getPlayersCombined(asRouteReq<CombinedRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "p-filtered-both",
            name: "Filtered Merged Skater",
            games: 13,
            goals: 7,
            assists: 7,
            points: 14,
          }),
        );
        expect(body[0].seasons).toEqual([
          expect.objectContaining({
            season: 2024,
            games: 13,
            points: 14,
          }),
        ]);
        expectArraySchema("CombinedPlayer", body);
      } finally {
        await db.cleanup();
      }
    });

    test("serves player combined snapshots from local snapshot storage", async () => {
      const db = await createIntegrationDb();

      try {
        const snapshotPayload = [
          {
            id: "p-snapshot",
            name: "Snapshot Skater",
            position: "F",
            games: 99,
            goals: 44,
            assists: 55,
            points: 99,
            plusMinus: 11,
            penalties: 12,
            shots: 320,
            ppp: 22,
            shp: 1,
            hits: 80,
            blocks: 42,
            score: 100,
            scoreAdjustedByGames: 100,
            seasons: [],
          },
        ];
        await writeSnapshot(
          db.snapshotDir,
          "players/combined/regular/team-1",
          snapshotPayload,
        );

        const req = createRequest({
          method: "GET",
          url: "/players/combined/regular",
          params: { reportType: "regular" },
        });
        const res = createResponse();

        await getPlayersCombined(asRouteReq<CombinedRouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
        expect(getJsonBody(res)).toEqual(snapshotPayload);
      } finally {
        await db.cleanup();
      }
    });

    test("uses player combined snapshots when startFrom matches the default window", async () => {
      const db = await createIntegrationDb();

      try {
        const snapshotPayload = [
          {
            id: "p-default-window",
            name: "Default Window Skater",
            position: "F",
            games: 55,
            goals: 21,
            assists: 34,
            points: 55,
            plusMinus: 9,
            penalties: 10,
            shots: 210,
            ppp: 11,
            shp: 1,
            hits: 20,
            blocks: 18,
            score: 100,
            scoreAdjustedByGames: 100,
            seasons: [],
          },
        ];
        await writeSnapshot(
          db.snapshotDir,
          "players/combined/regular/team-1",
          snapshotPayload,
        );

        const req = createRequest({
          method: "GET",
          url: "/players/combined/regular?startFrom=2012",
          params: { reportType: "regular" },
          headers: { host: "localhost" },
        });
        const res = createResponse();

        await getPlayersCombined(asRouteReq<CombinedRouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
        expect(getJsonBody(res)).toEqual(snapshotPayload);
      } finally {
        await db.cleanup();
      }
    });
  });
};
