import { createRequest, createResponse } from "node-mocks-http";
import {
  getCareerGoalie,
  getCareerGoalies,
  getCareerPlayer,
  getCareerPlayers,
} from "../routes";
import { HTTP_STATUS } from "../constants";
import { createIntegrationDb } from "./integration-db";
import { expectArraySchema, expectObjectSchema } from "./openapi-schema";
import {
  asRouteReq,
  getJsonBody,
  writeSnapshot,
} from "./routes.integration.helpers";

type CareerPlayerReq = Parameters<typeof getCareerPlayer>[0];
type CareerGoalieReq = Parameters<typeof getCareerGoalie>[0];
type CareerPlayersReq = Parameters<typeof getCareerPlayers>[0];
type CareerGoaliesReq = Parameters<typeof getCareerGoalies>[0];

export const registerCareerRouteIntegrationTests = (): void => {
  describe("career routes", () => {
    test("returns career player aggregates from real player rows", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-career",
            name: "Career Skater",
            position: "F",
            games: 10,
            goals: 4,
            assists: 6,
            points: 10,
            plusMinus: 3,
            shots: 25,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            playerId: "p-career",
            name: "Career Skater",
            position: "F",
            games: 2,
            goals: 1,
            assists: 1,
            points: 2,
            shots: 6,
          },
          {
            teamId: "19",
            season: 2023,
            reportType: "regular",
            playerId: "p-career",
            name: "Career Skater",
            position: "F",
            games: 5,
            goals: 2,
            assists: 3,
            points: 5,
            plusMinus: 1,
            shots: 11,
          },
          {
            teamId: "2",
            season: 2022,
            reportType: "regular",
            playerId: "p-career",
            name: "Career Skater",
            position: "F",
            games: 0,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/career/player/p-career",
          params: { id: "p-career" },
        });
        const res = createResponse();

        await getCareerPlayer(asRouteReq<CareerPlayerReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toEqual(
          expect.objectContaining({
            id: "p-career",
            name: "Career Skater",
            position: "F",
          }),
        );

        const summary = body.summary as Record<string, unknown>;
        expect(summary.firstSeason).toBe(2022);
        expect(summary.lastSeason).toBe(2024);
        expect(summary.seasonCount).toEqual({ owned: 3, played: 2 });
        expect(summary.teamCount).toEqual({ owned: 3, played: 2 });

        const totals = body.totals as Record<string, Record<string, unknown>>;
        expect(totals.career.games).toBe(17);
        expect(totals.career.points).toBe(17);
        expect(totals.regular.games).toBe(15);
        expect(totals.playoffs.games).toBe(2);

        const seasons = body.seasons as Array<Record<string, unknown>>;
        expect(seasons).toHaveLength(4);
        expect(
          seasons.map((season) => `${season.season}-${season.teamId}-${season.reportType}`),
        ).toEqual([
          "2024-1-regular",
          "2024-1-playoffs",
          "2023-19-regular",
          "2022-2-regular",
        ]);
        expectObjectSchema("CareerPlayer", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns 404 for a missing career player from the live DB", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/career/player/missing",
          params: { id: "missing" },
        });
        const res = createResponse();

        await getCareerPlayer(asRouteReq<CareerPlayerReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
        expect(res._getData()).toBe("Player not found");
        expect(res.getHeader("cache-control")).toBe("private, no-store");
      } finally {
        await db.cleanup();
      }
    });

    test("returns career player list data from the live DB", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-list",
            name: "List Skater",
            position: "F",
            games: 10,
            goals: 4,
            assists: 6,
            points: 10,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            playerId: "p-list",
            name: "List Skater",
            position: "F",
            games: 2,
            goals: 1,
            assists: 1,
            points: 2,
          },
          {
            teamId: "19",
            season: 2023,
            reportType: "regular",
            playerId: "p-list",
            name: "List Skater",
            position: "F",
            games: 0,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/career/players",
        });
        const res = createResponse();

        await getCareerPlayers(asRouteReq<CareerPlayersReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toEqual([
          {
            id: "p-list",
            name: "List Skater",
            position: "F",
            firstSeason: 2023,
            lastSeason: 2024,
            seasonsOwned: 2,
            seasonsPlayedRegular: 1,
            seasonsPlayedPlayoffs: 1,
            teamsOwned: 2,
            teamsPlayedRegular: 1,
            teamsPlayedPlayoffs: 1,
            regularGames: 10,
            playoffGames: 2,
          },
        ]);
        expectArraySchema("CareerPlayerListItem", body);
      } finally {
        await db.cleanup();
      }
    });

    test("serves career player list snapshots from local snapshot storage", async () => {
      const db = await createIntegrationDb();

      try {
        const snapshotPayload = [
          {
            id: "p-list-snapshot",
            name: "Snapshot List Skater",
            position: "D",
            firstSeason: 2020,
            lastSeason: 2024,
            seasonsOwned: 5,
            seasonsPlayedRegular: 4,
            seasonsPlayedPlayoffs: 2,
            teamsOwned: 2,
            teamsPlayedRegular: 2,
            teamsPlayedPlayoffs: 1,
            regularGames: 250,
            playoffGames: 20,
          },
        ];
        await writeSnapshot(db.snapshotDir, "career/players", snapshotPayload);

        const req = createRequest({
          method: "GET",
          url: "/career/players",
        });
        const res = createResponse();

        await getCareerPlayers(asRouteReq<CareerPlayersReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
        expect(getJsonBody(res)).toEqual(snapshotPayload);
      } finally {
        await db.cleanup();
      }
    });

    test("returns career goalie aggregates from real goalie rows", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            goalieId: "g-career",
            name: "Career Goalie",
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
            teamId: "19",
            season: 2023,
            reportType: "playoffs",
            goalieId: "g-career",
            name: "Career Goalie",
            games: 4,
            wins: 2,
            saves: 110,
            shutouts: 1,
            gaa: 2.05,
            savePercent: 0.925,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/career/goalie/g-career",
          params: { id: "g-career" },
        });
        const res = createResponse();

        await getCareerGoalie(asRouteReq<CareerGoalieReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toEqual(
          expect.objectContaining({
            id: "g-career",
            name: "Career Goalie",
          }),
        );
        const totals = body.totals as Record<string, Record<string, unknown>>;
        expect(totals.career.games).toBe(16);
        expect(totals.career.wins).toBe(10);
        expect(totals.regular.games).toBe(12);
        expect(totals.playoffs.games).toBe(4);
        expectObjectSchema("CareerGoalie", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns 404 for a missing career goalie from the live DB", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/career/goalie/missing",
          params: { id: "missing" },
        });
        const res = createResponse();

        await getCareerGoalie(asRouteReq<CareerGoalieReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
        expect(res._getData()).toBe("Goalie not found");
        expect(res.getHeader("cache-control")).toBe("private, no-store");
      } finally {
        await db.cleanup();
      }
    });

    test("returns career goalie list data from the live DB", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            goalieId: "g-list",
            name: "List Goalie",
            games: 10,
            wins: 7,
            saves: 280,
            shutouts: 2,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            goalieId: "g-list",
            name: "List Goalie",
            games: 3,
            wins: 1,
            saves: 75,
            shutouts: 0,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/career/goalies",
        });
        const res = createResponse();

        await getCareerGoalies(asRouteReq<CareerGoaliesReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toEqual([
          {
            id: "g-list",
            name: "List Goalie",
            firstSeason: 2024,
            lastSeason: 2024,
            seasonsOwned: 1,
            seasonsPlayedRegular: 1,
            seasonsPlayedPlayoffs: 1,
            teamsOwned: 1,
            teamsPlayedRegular: 1,
            teamsPlayedPlayoffs: 1,
            regularGames: 10,
            playoffGames: 3,
          },
        ]);
        expectArraySchema("CareerGoalieListItem", body);
      } finally {
        await db.cleanup();
      }
    });

    test("serves career goalie list snapshots from local snapshot storage", async () => {
      const db = await createIntegrationDb();

      try {
        const snapshotPayload = [
          {
            id: "g-list-snapshot",
            name: "Snapshot List Goalie",
            firstSeason: 2021,
            lastSeason: 2025,
            seasonsOwned: 5,
            seasonsPlayedRegular: 4,
            seasonsPlayedPlayoffs: 2,
            teamsOwned: 2,
            teamsPlayedRegular: 2,
            teamsPlayedPlayoffs: 1,
            regularGames: 210,
            playoffGames: 18,
          },
        ];
        await writeSnapshot(db.snapshotDir, "career/goalies", snapshotPayload);

        const req = createRequest({
          method: "GET",
          url: "/career/goalies",
        });
        const res = createResponse();

        await getCareerGoalies(asRouteReq<CareerGoaliesReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
        expect(getJsonBody(res)).toEqual(snapshotPayload);
      } finally {
        await db.cleanup();
      }
    });
  });
};
