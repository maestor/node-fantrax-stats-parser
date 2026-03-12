import { createRequest, createResponse } from "node-mocks-http";
import {
  getCareerGoalie,
  getCareerGoalies,
  getCareerHighlights,
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
type CareerHighlightsReq = Parameters<typeof getCareerHighlights>[0];

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

    test("prefers canonical fantrax entity metadata for career player routes", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-canonical",
            name: "Typo Skater",
            position: null,
            games: 3,
            goals: 1,
            assists: 1,
            points: 2,
          },
        ]);
        await db.db.execute({
          sql: "UPDATE fantrax_entities SET name = ?, position = ? WHERE fantrax_id = ?",
          args: ["Canonical Skater", "D", "p-canonical"],
        });

        const detailReq = createRequest({
          method: "GET",
          url: "/career/player/p-canonical",
          params: { id: "p-canonical" },
        });
        const detailRes = createResponse();

        await getCareerPlayer(asRouteReq<CareerPlayerReq>(detailReq), detailRes);

        expect(detailRes.statusCode).toBe(HTTP_STATUS.OK);
        expect(getJsonBody<Record<string, unknown>>(detailRes)).toEqual(
          expect.objectContaining({
            id: "p-canonical",
            name: "Canonical Skater",
            position: "D",
          }),
        );

        const listReq = createRequest({
          method: "GET",
          url: "/career/players",
        });
        const listRes = createResponse();

        await getCareerPlayers(asRouteReq<CareerPlayersReq>(listReq), listRes);

        expect(listRes.statusCode).toBe(HTTP_STATUS.OK);
        expect(getJsonBody<Array<Record<string, unknown>>>(listRes)).toEqual([
          expect.objectContaining({
            id: "p-canonical",
            name: "Canonical Skater",
            position: "D",
          }),
        ]);
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

    test("prefers canonical fantrax entity metadata for career goalie routes", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            goalieId: "g-canonical",
            name: "Typo Goalie",
            games: 4,
            wins: 2,
            saves: 120,
          },
        ]);
        await db.db.execute({
          sql: "UPDATE fantrax_entities SET name = ? WHERE fantrax_id = ?",
          args: ["Canonical Goalie", "g-canonical"],
        });

        const detailReq = createRequest({
          method: "GET",
          url: "/career/goalie/g-canonical",
          params: { id: "g-canonical" },
        });
        const detailRes = createResponse();

        await getCareerGoalie(asRouteReq<CareerGoalieReq>(detailReq), detailRes);

        expect(detailRes.statusCode).toBe(HTTP_STATUS.OK);
        expect(getJsonBody<Record<string, unknown>>(detailRes)).toEqual(
          expect.objectContaining({
            id: "g-canonical",
            name: "Canonical Goalie",
          }),
        );

        const listReq = createRequest({
          method: "GET",
          url: "/career/goalies",
        });
        const listRes = createResponse();

        await getCareerGoalies(asRouteReq<CareerGoaliesReq>(listReq), listRes);

        expect(listRes.statusCode).toBe(HTTP_STATUS.OK);
        expect(getJsonBody<Array<Record<string, unknown>>>(listRes)).toEqual([
          expect.objectContaining({
            id: "g-canonical",
            name: "Canonical Goalie",
          }),
        ]);
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

    test("returns paged most-teams-played highlights from the live DB", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-three",
            name: "Four Team Skater",
            position: "F",
            games: 10,
          },
          {
            teamId: "19",
            season: 2023,
            reportType: "regular",
            playerId: "p-three",
            name: "Four Team Skater",
            position: "F",
            games: 6,
          },
          {
            teamId: "2",
            season: 2022,
            reportType: "playoffs",
            playerId: "p-three",
            name: "Four Team Skater",
            position: "F",
            games: 2,
          },
          {
            teamId: "3",
            season: 2021,
            reportType: "regular",
            playerId: "p-three",
            name: "Four Team Skater",
            position: "F",
            games: 3,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-two",
            name: "Two Team Skater",
            position: "D",
            games: 9,
          },
          {
            teamId: "2",
            season: 2023,
            reportType: "regular",
            playerId: "p-two",
            name: "Two Team Skater",
            position: "D",
            games: 7,
          },
        ]);
        await db.insertGoalies([
          {
            teamId: "6",
            season: 2022,
            reportType: "regular",
            goalieId: "g-four",
            name: "Four Team Goalie",
            games: 4,
          },
          {
            teamId: "5",
            season: 2023,
            reportType: "regular",
            goalieId: "g-four",
            name: "Four Team Goalie",
            games: 5,
          },
          {
            teamId: "4",
            season: 2024,
            reportType: "playoffs",
            goalieId: "g-four",
            name: "Four Team Goalie",
            games: 2,
          },
          {
            teamId: "3",
            season: 2025,
            reportType: "regular",
            goalieId: "g-four",
            name: "Four Team Goalie",
            games: 8,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/career/highlights/most-teams-played?skip=0&take=1",
          params: { type: "most-teams-played" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toEqual({
          type: "most-teams-played",
          skip: 0,
          take: 1,
          total: 2,
          items: [
            {
              id: "g-four",
              name: "Four Team Goalie",
              position: "G",
              teamCount: 4,
              teams: [
                { id: "6", name: "Detroit Red Wings" },
                { id: "5", name: "Montreal Canadiens" },
                { id: "4", name: "Vancouver Canucks" },
                { id: "3", name: "Calgary Flames" },
              ],
            },
          ],
        });
        expectObjectSchema("CareerTeamCountHighlightPage", body);
      } finally {
        await db.cleanup();
      }
    });

    test("counts zero-game rows for most-teams-owned highlights", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "4",
            season: 2020,
            reportType: "regular",
            playerId: "p-owned",
            name: "Owned Skater",
            position: "D",
            games: 0,
          },
          {
            teamId: "3",
            season: 2021,
            reportType: "playoffs",
            playerId: "p-owned",
            name: "Owned Skater",
            position: "D",
            games: 0,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "p-owned",
            name: "Owned Skater",
            position: "D",
            games: 0,
          },
          {
            teamId: "19",
            season: 2023,
            reportType: "regular",
            playerId: "p-owned",
            name: "Owned Skater",
            position: "D",
            games: 0,
          },
          {
            teamId: "2",
            season: 2022,
            reportType: "playoffs",
            playerId: "p-owned",
            name: "Owned Skater",
            position: "D",
            games: 1,
          },
          {
            teamId: "3",
            season: 2024,
            reportType: "regular",
            playerId: "p-miss",
            name: "Missed Cut",
            position: "F",
            games: 0,
          },
          {
            teamId: "4",
            season: 2023,
            reportType: "playoffs",
            playerId: "p-miss",
            name: "Missed Cut",
            position: "F",
            games: 0,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/career/highlights/most-teams-owned",
          params: { type: "most-teams-owned" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toEqual({
          type: "most-teams-owned",
          skip: 0,
          take: 10,
          total: 1,
          items: [
            {
              id: "p-owned",
              name: "Owned Skater",
              position: "D",
              teamCount: 5,
              teams: [
                { id: "4", name: "Vancouver Canucks" },
                { id: "3", name: "Calgary Flames" },
                { id: "2", name: "Carolina Hurricanes" },
                { id: "19", name: "Toronto Maple Leafs" },
                { id: "1", name: "Colorado Avalanche" },
              ],
            },
          ],
        });
        expectObjectSchema("CareerTeamCountHighlightPage", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns duplicate top-team rows for same-team-seasons-played ties", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          ...Array.from({ length: 8 }, (_, index) => ({
            teamId: "7",
            season: 2017 + index,
            reportType: (index % 2 === 0 ? "regular" : "playoffs") as
              | "regular"
              | "playoffs",
            playerId: "p-tie",
            name: "Tie Skater",
            position: "D",
            games: 1,
          })),
          ...Array.from({ length: 8 }, (_, index) => ({
            teamId: "19",
            season: 2017 + index,
            reportType: (index % 2 === 0 ? "playoffs" : "regular") as
              | "regular"
              | "playoffs",
            playerId: "p-tie",
            name: "Tie Skater",
            position: "D",
            games: 1,
          })),
          {
            teamId: "19",
            season: 2024,
            reportType: "regular" as const,
            playerId: "p-tie",
            name: "Tie Skater",
            position: "D",
            games: 1,
          },
        ]);
        await db.insertGoalies(
          Array.from({ length: 9 }, (_, index) => ({
            teamId: "3",
            season: 2017 + index,
            reportType: "regular" as const,
            goalieId: "g-six",
            name: "Nine Season Goalie",
            games: 1,
          })),
        );

        const req = createRequest({
          method: "GET",
          url: "/career/highlights/same-team-seasons-played",
          params: { type: "same-team-seasons-played" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toEqual({
          type: "same-team-seasons-played",
          skip: 0,
          take: 10,
          total: 3,
          items: [
            {
              id: "g-six",
              name: "Nine Season Goalie",
              position: "G",
              seasonCount: 9,
              team: { id: "3", name: "Calgary Flames" },
            },
            {
              id: "p-tie",
              name: "Tie Skater",
              position: "D",
              seasonCount: 8,
              team: { id: "7", name: "Edmonton Oilers" },
            },
            {
              id: "p-tie",
              name: "Tie Skater",
              position: "D",
              seasonCount: 8,
              team: { id: "19", name: "Toronto Maple Leafs" },
            },
          ],
        });
        expectObjectSchema("CareerSameTeamHighlightPage", body);
      } finally {
        await db.cleanup();
      }
    });

    test("counts zero-game seasons for same-team-seasons-owned highlights", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers(
          Array.from({ length: 10 }, (_, index) => ({
            teamId: "8",
            season: 2015 + index,
            reportType:
              index === 2 || index === 7 ? ("playoffs" as const) : ("regular" as const),
            playerId: "p-owned-seasons",
            name: "Owned Seasons Skater",
            position: "F",
            games: 0,
          })),
        );

        const req = createRequest({
          method: "GET",
          url: "/career/highlights/same-team-seasons-owned",
          params: { type: "same-team-seasons-owned" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toEqual({
          type: "same-team-seasons-owned",
          skip: 0,
          take: 10,
          total: 1,
          items: [
            {
              id: "p-owned-seasons",
              name: "Owned Seasons Skater",
              position: "F",
              seasonCount: 10,
              team: { id: "8", name: "San Jose Sharks" },
            },
          ],
        });
        expectObjectSchema("CareerSameTeamHighlightPage", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns most-stanley-cups highlights with cup seasons and fantasy teams", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2021,
            reportType: "playoffs",
            playerId: "p-cups",
            name: "Cup Skater",
            position: "F",
            games: 8,
          },
          {
            teamId: "2",
            season: 2023,
            reportType: "playoffs",
            playerId: "p-cups",
            name: "Cup Skater",
            position: "F",
            games: 12,
          },
          {
            teamId: "4",
            season: 2024,
            reportType: "playoffs",
            playerId: "p-one",
            name: "One Cup Skater",
            position: "D",
            games: 6,
          },
        ]);
        await db.insertGoalies([
          {
            teamId: "3",
            season: 2020,
            reportType: "playoffs",
            goalieId: "g-cups",
            name: "Cup Goalie",
            games: 4,
          },
          {
            teamId: "3",
            season: 2022,
            reportType: "playoffs",
            goalieId: "g-cups",
            name: "Cup Goalie",
            games: 4,
          },
          {
            teamId: "3",
            season: 2024,
            reportType: "playoffs",
            goalieId: "g-cups",
            name: "Cup Goalie",
            games: 5,
          },
        ]);
        await db.insertPlayoffResults([
          { teamId: "3", season: 2020, round: 5 },
          { teamId: "1", season: 2021, round: 5 },
          { teamId: "3", season: 2022, round: 5 },
          { teamId: "2", season: 2023, round: 5 },
          { teamId: "3", season: 2024, round: 5 },
          { teamId: "4", season: 2024, round: 4 },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/career/highlights/most-stanley-cups",
          params: { type: "most-stanley-cups" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toEqual({
          type: "most-stanley-cups",
          skip: 0,
          take: 10,
          total: 2,
          items: [
            {
              id: "g-cups",
              name: "Cup Goalie",
              position: "G",
              cupCount: 3,
              cups: [
                {
                  season: 2020,
                  team: { id: "3", name: "Calgary Flames" },
                },
                {
                  season: 2022,
                  team: { id: "3", name: "Calgary Flames" },
                },
                {
                  season: 2024,
                  team: { id: "3", name: "Calgary Flames" },
                },
              ],
            },
            {
              id: "p-cups",
              name: "Cup Skater",
              position: "F",
              cupCount: 2,
              cups: [
                {
                  season: 2021,
                  team: { id: "1", name: "Colorado Avalanche" },
                },
                {
                  season: 2023,
                  team: { id: "2", name: "Carolina Hurricanes" },
                },
              ],
            },
          ],
        });
        expectObjectSchema("CareerStanleyCupHighlightPage", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns reunion-king highlights from separated same-team season blocks", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          ...[2018, 2020, 2022].map((season) => ({
            teamId: "7",
            season,
            reportType: "regular" as const,
            playerId: "p-reunion",
            name: "Reunion Skater",
            position: "F",
            games: 0,
          })),
          ...[2019, 2020, 2022, 2024].map((season) => ({
            teamId: "19",
            season,
            reportType: "regular" as const,
            playerId: "p-reunion",
            name: "Reunion Skater",
            position: "F",
            games: 0,
          })),
          ...[2020, 2022].map((season) => ({
            teamId: "1",
            season,
            reportType: "regular" as const,
            playerId: "p-two",
            name: "Two Reunion",
            position: "D",
            games: 0,
          })),
        ]);
        await db.insertGoalies(
          [2017, 2019, 2021, 2023].map((season) => ({
            teamId: "3",
            season,
            reportType: "regular" as const,
            goalieId: "g-reunion",
            name: "Reunion Goalie",
            games: 0,
          })),
        );

        const req = createRequest({
          method: "GET",
          url: "/career/highlights/reunion-king",
          params: { type: "reunion-king" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toEqual({
          type: "reunion-king",
          skip: 0,
          take: 10,
          total: 4,
          items: [
            {
              id: "g-reunion",
              name: "Reunion Goalie",
              position: "G",
              reunionCount: 4,
              team: { id: "3", name: "Calgary Flames" },
              stints: [
                { fromSeason: 2017, toSeason: 2017 },
                { fromSeason: 2019, toSeason: 2019 },
                { fromSeason: 2021, toSeason: 2021 },
                { fromSeason: 2023, toSeason: 2023 },
              ],
            },
            {
              id: "p-reunion",
              name: "Reunion Skater",
              position: "F",
              reunionCount: 3,
              team: { id: "7", name: "Edmonton Oilers" },
              stints: [
                { fromSeason: 2018, toSeason: 2018 },
                { fromSeason: 2020, toSeason: 2020 },
                { fromSeason: 2022, toSeason: 2022 },
              ],
            },
            {
              id: "p-reunion",
              name: "Reunion Skater",
              position: "F",
              reunionCount: 3,
              team: { id: "19", name: "Toronto Maple Leafs" },
              stints: [
                { fromSeason: 2019, toSeason: 2020 },
                { fromSeason: 2022, toSeason: 2022 },
                { fromSeason: 2024, toSeason: 2024 },
              ],
            },
            {
              id: "p-two",
              name: "Two Reunion",
              position: "D",
              reunionCount: 2,
              team: { id: "1", name: "Colorado Avalanche" },
              stints: [
                { fromSeason: 2020, toSeason: 2020 },
                { fromSeason: 2022, toSeason: 2022 },
              ],
            },
          ],
        });
        expectObjectSchema("CareerReunionHighlightPage", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns same-team zero-game season counts for stash-king", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          ...Array.from({ length: 10 }, (_, index) => ({
            teamId: "1",
            season: 2015 + index,
            reportType: "regular" as const,
            playerId: "p-stash",
            name: "Stash Skater",
            position: "F",
            games: 0,
          })),
          {
            teamId: "1",
            season: 2015,
            reportType: "playoffs",
            playerId: "p-stash",
            name: "Stash Skater",
            position: "F",
            games: 0,
          },
          {
            teamId: "11",
            season: 2025,
            reportType: "regular",
            playerId: "p-stash",
            name: "Stash Skater",
            position: "F",
            games: 0,
          },
          {
            teamId: "11",
            season: 2025,
            reportType: "playoffs",
            playerId: "p-stash",
            name: "Stash Skater",
            position: "F",
            games: 1,
          },
          ...Array.from({ length: 10 }, (_, index) => ({
            teamId: String(index + 20),
            season: 2012 + index,
            reportType: "regular" as const,
            playerId: "p-transfer-stash",
            name: "Transfer Stash",
            position: "D",
            games: 0,
          })),
        ]);
        await db.insertGoalies(
          Array.from({ length: 11 }, (_, index) => ({
            teamId: "20",
            season: 2014 + index,
            reportType: "regular" as const,
            goalieId: "g-stash",
            name: "Stash Goalie",
            games: 0,
          })),
        );

        const req = createRequest({
          method: "GET",
          url: "/career/highlights/stash-king",
          params: { type: "stash-king" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toEqual({
          type: "stash-king",
          skip: 0,
          take: 10,
          total: 2,
          items: [
            {
              id: "g-stash",
              name: "Stash Goalie",
              position: "G",
              seasonCount: 11,
              team: { id: "20", name: "Ottawa Senators" },
            },
            {
              id: "p-stash",
              name: "Stash Skater",
              position: "F",
              seasonCount: 10,
              team: { id: "1", name: "Colorado Avalanche" },
            },
          ],
        });
        expectObjectSchema("CareerStashHighlightPage", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns regular-grinder-without-playoffs highlights from regular-season max games", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2023,
            reportType: "regular",
            playerId: "p-grinder",
            name: "Grinder Skater",
            position: "F",
            games: 30,
          },
          {
            teamId: "2",
            season: 2023,
            reportType: "regular",
            playerId: "p-grinder",
            name: "Grinder Skater",
            position: "F",
            games: 40,
          },
          {
            teamId: "2",
            season: 2024,
            reportType: "regular",
            playerId: "p-grinder",
            name: "Grinder Skater",
            position: "F",
            games: 25,
          },
          {
            teamId: "3",
            season: 2024,
            reportType: "regular",
            playerId: "p-playoffs",
            name: "Playoff Skater",
            position: "D",
            games: 82,
          },
          {
            teamId: "3",
            season: 2024,
            reportType: "playoffs",
            playerId: "p-playoffs",
            name: "Playoff Skater",
            position: "D",
            games: 8,
          },
        ]);
        await db.insertGoalies([
          {
            teamId: "5",
            season: 2023,
            reportType: "regular",
            goalieId: "g-grinder",
            name: "Goalie Grinder",
            games: 70,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/career/highlights/regular-grinder-without-playoffs",
          params: { type: "regular-grinder-without-playoffs" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        const body = getJsonBody<Record<string, unknown>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(body).toEqual({
          type: "regular-grinder-without-playoffs",
          skip: 0,
          take: 10,
          total: 2,
          items: [
            {
              id: "g-grinder",
              name: "Goalie Grinder",
              position: "G",
              regularGames: 70,
              teams: [{ id: "5", name: "Montreal Canadiens" }],
            },
            {
              id: "p-grinder",
              name: "Grinder Skater",
              position: "F",
              regularGames: 65,
              teams: [
                { id: "2", name: "Carolina Hurricanes" },
                { id: "1", name: "Colorado Avalanche" },
              ],
            },
          ],
        });
        expectObjectSchema("CareerRegularGrinderHighlightPage", body);
      } finally {
        await db.cleanup();
      }
    });

    test("serves career highlight snapshots and applies paging after loading the snapshot", async () => {
      const db = await createIntegrationDb();

      try {
        const snapshotPayload = [
          {
            id: "g-snapshot",
            name: "Snapshot Goalie",
            position: "G",
            teamCount: 5,
            teams: [
              { id: "1", name: "Colorado Avalanche" },
              { id: "2", name: "Carolina Hurricanes" },
              { id: "3", name: "Calgary Flames" },
              { id: "4", name: "Vancouver Canucks" },
              { id: "5", name: "Montreal Canadiens" },
            ],
          },
          {
            id: "p-snapshot",
            name: "Snapshot Skater",
            position: "F",
            teamCount: 4,
            teams: [
              { id: "6", name: "Detroit Red Wings" },
              { id: "7", name: "Edmonton Oilers" },
              { id: "8", name: "San Jose Sharks" },
              { id: "9", name: "New York Rangers" },
            ],
          },
        ];
        await writeSnapshot(
          db.snapshotDir,
          "career/highlights/most-teams-played",
          snapshotPayload,
        );

        const req = createRequest({
          method: "GET",
          url: "/career/highlights/most-teams-played?skip=1&take=1",
          params: { type: "most-teams-played" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
        expect(getJsonBody(res)).toEqual({
          type: "most-teams-played",
          skip: 1,
          take: 1,
          total: 2,
          items: [snapshotPayload[1]],
        });
      } finally {
        await db.cleanup();
      }
    });

    test("returns 400 for invalid career highlight paging params", async () => {
      const db = await createIntegrationDb();

      try {
        const badTakeReq = createRequest({
          method: "GET",
          url: "/career/highlights/most-teams-played?take=101",
          params: { type: "most-teams-played" },
        });
        const badTakeRes = createResponse();

        await getCareerHighlights(
          asRouteReq<CareerHighlightsReq>(badTakeReq),
          badTakeRes,
        );

        expect(badTakeRes.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(badTakeRes._getData()).toBe("Invalid paging params");

        const badSkipReq = createRequest({
          method: "GET",
          url: "/career/highlights/most-teams-played?skip=-1",
          params: { type: "most-teams-played" },
        });
        const badSkipRes = createResponse();

        await getCareerHighlights(
          asRouteReq<CareerHighlightsReq>(badSkipReq),
          badSkipRes,
        );

        expect(badSkipRes.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(badSkipRes._getData()).toBe("Invalid paging params");

        const hugeSkipReq = createRequest({
          method: "GET",
          url: "/career/highlights/most-teams-played?skip=9007199254740992",
          params: { type: "most-teams-played" },
        });
        const hugeSkipRes = createResponse();

        await getCareerHighlights(
          asRouteReq<CareerHighlightsReq>(hugeSkipReq),
          hugeSkipRes,
        );

        expect(hugeSkipRes.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(hugeSkipRes._getData()).toBe("Invalid paging params");
      } finally {
        await db.cleanup();
      }
    });

    test("returns 400 for an unknown career highlight type", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/career/highlights/not-a-real-type",
          params: { type: "not-a-real-type" },
        });
        const res = createResponse();

        await getCareerHighlights(asRouteReq<CareerHighlightsReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(res._getData()).toBe("Invalid career highlight type");
      } finally {
        await db.cleanup();
      }
    });
  });
};
