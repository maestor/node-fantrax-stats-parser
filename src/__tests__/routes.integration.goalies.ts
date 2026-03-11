import { createRequest, createResponse } from "node-mocks-http";
import { getGoaliesCombined, getGoaliesSeason } from "../routes";
import { ERROR_MESSAGES, HTTP_STATUS } from "../constants";
import { createIntegrationDb } from "./integration-db";
import { expectArraySchema } from "./openapi-schema";
import {
  asRouteReq,
  getJsonBody,
  writeSnapshot,
} from "./routes.integration.helpers";

type SeasonRouteReq = Parameters<typeof getGoaliesSeason>[0];
type CombinedRouteReq = Parameters<typeof getGoaliesCombined>[0];

export const registerGoalieRouteIntegrationTests = (): void => {
  describe("goalie routes", () => {
    test("merges regular and playoff goalie stats in combined both route without leaking rate fields", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            goalieId: "g-combined",
            name: "Merged Goalie",
            games: 10,
            wins: 6,
            saves: 300,
            shutouts: 2,
            goals: 0,
            assists: 1,
            points: 1,
            gaa: 2.2,
            savePercent: 0.92,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            goalieId: "g-combined",
            name: "Merged Goalie",
            games: 4,
            wins: 2,
            saves: 120,
            shutouts: 1,
            goals: 0,
            assists: 0,
            points: 0,
            gaa: 1.8,
            savePercent: 0.935,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/goalies/combined/both?teamId=1&startFrom=2024",
          params: { reportType: "both" },
        });
        const res = createResponse();

        await getGoaliesCombined(asRouteReq<CombinedRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "g-combined",
            name: "Merged Goalie",
            games: 14,
            wins: 8,
            saves: 420,
            shutouts: 3,
            assists: 1,
            points: 1,
          }),
        );
        expect(body[0]).not.toHaveProperty("gaa");
        expect(body[0]).not.toHaveProperty("savePercent");
        expectArraySchema("CombinedGoalie", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns goalie season rows from the live DB", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            goalieId: "g-season",
            name: "Season Goalie",
            games: 12,
            wins: 8,
            saves: 340,
            shutouts: 2,
            goals: 0,
            assists: 1,
            points: 1,
            gaa: 2.15,
            savePercent: 0.918,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/goalies/season/regular/2024?teamId=1",
          params: { reportType: "regular", season: "2024" },
        });
        const res = createResponse();

        await getGoaliesSeason(asRouteReq<SeasonRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "g-season",
            name: "Season Goalie",
            games: 12,
            wins: 8,
            saves: 340,
            shutouts: 2,
            savePercent: "0.918",
            gaa: "2.15",
          }),
        );
        expectArraySchema("Goalie", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns the current configured goalie season when the season param is omitted", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2023,
            reportType: "regular",
            goalieId: "g-old",
            name: "Older Goalie",
            games: 9,
            wins: 5,
            saves: 250,
            shutouts: 1,
            gaa: 2.4,
            savePercent: 0.915,
          },
          {
            teamId: "1",
            season: 2025,
            reportType: "regular",
            goalieId: "g-new",
            name: "Newest Goalie",
            games: 12,
            wins: 8,
            saves: 340,
            shutouts: 2,
            gaa: 2.15,
            savePercent: 0.918,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/goalies/season/regular?teamId=1",
          params: { reportType: "regular" },
        });
        const res = createResponse();

        await getGoaliesSeason(asRouteReq<SeasonRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "g-new",
            name: "Newest Goalie",
            games: 12,
            wins: 8,
          }),
        );
        expectArraySchema("Goalie", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns 400 for unavailable goalie season using the real DB season lookup", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            goalieId: "g-playoff",
            name: "Playoff Goalie",
            games: 4,
            wins: 2,
            saves: 100,
            shutouts: 1,
            gaa: 2.1,
            savePercent: 0.925,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/goalies/season/playoffs/2023?teamId=1",
          params: { reportType: "playoffs", season: "2023" },
        });
        const res = createResponse();

        await getGoaliesSeason(asRouteReq<SeasonRouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(res._getData()).toBe(ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
        expect(res.getHeader("cache-control")).toBe("private, no-store");
      } finally {
        await db.cleanup();
      }
    });

    test("serves goalie combined snapshots from local snapshot storage", async () => {
      const db = await createIntegrationDb();

      try {
        const snapshotPayload = [
          {
            id: "g-snapshot",
            name: "Snapshot Goalie",
            games: 66,
            wins: 40,
            saves: 1800,
            shutouts: 6,
            goals: 0,
            assists: 2,
            points: 2,
            penalties: 3,
            ppp: 0,
            shp: 0,
            score: 100,
            scoreAdjustedByGames: 100,
            seasons: [],
          },
        ];
        await writeSnapshot(
          db.snapshotDir,
          "goalies/combined/regular/team-1",
          snapshotPayload,
        );

        const req = createRequest({
          method: "GET",
          url: "/goalies/combined/regular",
          params: { reportType: "regular" },
        });
        const res = createResponse();

        await getGoaliesCombined(asRouteReq<CombinedRouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
        expect(getJsonBody(res)).toEqual(snapshotPayload);
      } finally {
        await db.cleanup();
      }
    });

    test("returns combined goalie data from all seasons when startFrom is omitted", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2023,
            reportType: "regular",
            goalieId: "g-window",
            name: "Window Goalie",
            games: 9,
            wins: 5,
            saves: 250,
            shutouts: 1,
            assists: 1,
            points: 1,
            gaa: 2.4,
            savePercent: 0.915,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            goalieId: "g-window",
            name: "Window Goalie",
            games: 12,
            wins: 8,
            saves: 340,
            shutouts: 2,
            assists: 1,
            points: 1,
            gaa: 2.15,
            savePercent: 0.918,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/goalies/combined/regular?teamId=1",
          params: { reportType: "regular" },
        });
        const res = createResponse();

        await getGoaliesCombined(asRouteReq<CombinedRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "g-window",
            name: "Window Goalie",
            games: 21,
            wins: 13,
            saves: 590,
            shutouts: 3,
            assists: 2,
            points: 2,
          }),
        );
        expect(body[0].seasons).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ season: 2023, games: 9, wins: 5 }),
            expect.objectContaining({ season: 2024, games: 12, wins: 8 }),
          ]),
        );
        expectArraySchema("CombinedGoalie", body);
      } finally {
        await db.cleanup();
      }
    });

    test("uses goalie combined snapshots when startFrom matches the team window", async () => {
      const db = await createIntegrationDb();

      try {
        const snapshotPayload = [
          {
            id: "g-window",
            name: "Window Goalie",
            games: 44,
            wins: 27,
            saves: 1200,
            shutouts: 4,
            goals: 0,
            assists: 1,
            points: 1,
            penalties: 1,
            ppp: 0,
            shp: 0,
            score: 100,
            scoreAdjustedByGames: 100,
            seasons: [],
          },
        ];
        await writeSnapshot(
          db.snapshotDir,
          "goalies/combined/regular/team-28",
          snapshotPayload,
        );

        const req = createRequest({
          method: "GET",
          url: "/goalies/combined/regular?teamId=28&startFrom=2021",
          params: { reportType: "regular" },
          headers: { host: "localhost" },
        });
        const res = createResponse();

        await getGoaliesCombined(asRouteReq<CombinedRouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
        expect(getJsonBody(res)).toEqual(snapshotPayload);
      } finally {
        await db.cleanup();
      }
    });

    test("merges regular and playoff goalie stats across all seasons in combined both route", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2023,
            reportType: "regular",
            goalieId: "g-both",
            name: "Merged Window Goalie",
            games: 9,
            wins: 5,
            saves: 250,
            shutouts: 1,
            assists: 1,
            points: 1,
            gaa: 2.4,
            savePercent: 0.915,
          },
          {
            teamId: "1",
            season: 2023,
            reportType: "playoffs",
            goalieId: "g-both",
            name: "Merged Window Goalie",
            games: 2,
            wins: 1,
            saves: 60,
            shutouts: 0,
            assists: 0,
            points: 0,
            gaa: 2.1,
            savePercent: 0.926,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            goalieId: "g-both",
            name: "Merged Window Goalie",
            games: 12,
            wins: 8,
            saves: 340,
            shutouts: 2,
            assists: 1,
            points: 1,
            gaa: 2.15,
            savePercent: 0.918,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            goalieId: "g-both",
            name: "Merged Window Goalie",
            games: 3,
            wins: 2,
            saves: 90,
            shutouts: 1,
            assists: 0,
            points: 0,
            gaa: 1.95,
            savePercent: 0.931,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/goalies/combined/both?teamId=1",
          params: { reportType: "both" },
        });
        const res = createResponse();

        await getGoaliesCombined(asRouteReq<CombinedRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: "g-both",
            name: "Merged Window Goalie",
            games: 26,
            wins: 16,
            saves: 740,
            shutouts: 4,
            assists: 2,
            points: 2,
          }),
        );
        expect(body[0]).not.toHaveProperty("gaa");
        expect(body[0]).not.toHaveProperty("savePercent");
        expect(body[0].seasons).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              season: 2023,
              games: 11,
              wins: 6,
            }),
            expect.objectContaining({
              season: 2024,
              games: 15,
              wins: 10,
            }),
          ]),
        );
        expectArraySchema("CombinedGoalie", body);
      } finally {
        await db.cleanup();
      }
    });
  });
};
