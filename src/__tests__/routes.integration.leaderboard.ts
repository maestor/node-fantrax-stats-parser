import fs from "fs/promises";
import path from "path";
import { createRequest, createResponse } from "node-mocks-http";
import {
  getLastModified,
  getPlayoffsLeaderboard,
  getRegularLeaderboard,
} from "../routes";
import { HTTP_STATUS } from "../constants";
import { createIntegrationDb } from "./integration-db";
import { expectArraySchema } from "./openapi-schema";
import {
  asRouteReq,
  getJsonBody,
  writeSnapshot,
} from "./routes.integration.helpers";

type PlayoffsRouteReq = Parameters<typeof getPlayoffsLeaderboard>[0];
type RegularRouteReq = Parameters<typeof getRegularLeaderboard>[0];
type LastModifiedRouteReq = Parameters<typeof getLastModified>[0];

export const registerLeaderboardRouteIntegrationTests = (): void => {
  describe("leaderboard and metadata routes", () => {
    test("builds playoff leaderboard rows from the live playoff_results table", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayoffResults([
          { teamId: "1", season: 2024, round: 5 },
          { teamId: "19", season: 2024, round: 4 },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/leaderboard/playoffs",
        });
        const res = createResponse();

        await getPlayoffsLeaderboard(asRouteReq<PlayoffsRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body[0]).toEqual(
          expect.objectContaining({
            teamId: "1",
            teamName: "Colorado Avalanche",
            championships: 1,
            finals: 0,
            conferenceFinals: 0,
            secondRound: 0,
            firstRound: 0,
            appearances: 1,
            tieRank: false,
          }),
        );
        expect(
          (body[0].seasons as Array<Record<string, unknown>>).at(-1),
        ).toEqual({
          season: 2024,
          round: 5,
          key: "championship",
        });
        expectArraySchema("PlayoffLeaderboardEntry", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns playoff leaderboard zero-state from the live DB when no results exist", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/leaderboard/playoffs",
        });
        const res = createResponse();

        await getPlayoffsLeaderboard(asRouteReq<PlayoffsRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        const colorado = body.find((entry) => entry.teamId === "1");

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(colorado).toEqual(
          expect.objectContaining({
            teamId: "1",
            teamName: "Colorado Avalanche",
            appearances: 0,
            championships: 0,
            finals: 0,
            conferenceFinals: 0,
            secondRound: 0,
            firstRound: 0,
            tieRank: false,
          }),
        );
      } finally {
        await db.cleanup();
      }
    });

    test("serves playoff leaderboard snapshots from local snapshot storage", async () => {
      const db = await createIntegrationDb();

      try {
        const snapshotPayload = [
          {
            teamId: "2",
            teamName: "Carolina Hurricanes",
            appearances: 4,
            championships: 1,
            finals: 1,
            conferenceFinals: 0,
            secondRound: 1,
            firstRound: 1,
            seasons: [{ season: 2025, round: 5, key: "championship" }],
            tieRank: false,
          },
        ];
        await writeSnapshot(
          db.snapshotDir,
          "leaderboard/playoffs",
          snapshotPayload,
        );

        const req = createRequest({
          method: "GET",
          url: "/leaderboard/playoffs",
        });
        const res = createResponse();

        await getPlayoffsLeaderboard(asRouteReq<PlayoffsRouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
        expect(getJsonBody(res)).toEqual(snapshotPayload);
      } finally {
        await db.cleanup();
      }
    });

    test("builds regular leaderboard rows from the live regular_results tables", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertRegularResults([
          {
            teamId: "1",
            season: 2024,
            wins: 10,
            losses: 5,
            ties: 1,
            points: 21,
            divWins: 4,
            divLosses: 2,
            divTies: 0,
            isRegularChampion: true,
          },
          {
            teamId: "19",
            season: 2024,
            wins: 8,
            losses: 7,
            ties: 1,
            points: 17,
            divWins: 3,
            divLosses: 3,
            divTies: 0,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/leaderboard/regular",
        });
        const res = createResponse();

        await getRegularLeaderboard(asRouteReq<RegularRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(2);
        expect(body[0]).toEqual(
          expect.objectContaining({
            teamId: "1",
            teamName: "Colorado Avalanche",
            wins: 10,
            losses: 5,
            ties: 1,
            points: 21,
            regularTrophies: 1,
            winPercent: 0.625,
            divWinPercent: 0.667,
            pointsPercent: 0.656,
            tieRank: false,
          }),
        );
        expect(body[0].seasons).toEqual([
          {
            season: 2024,
            regularTrophy: true,
            wins: 10,
            losses: 5,
            ties: 1,
            points: 21,
            divWins: 4,
            divLosses: 2,
            divTies: 0,
            winPercent: 0.625,
            divWinPercent: 0.667,
            pointsPercent: 0.656,
          },
        ]);
        expectArraySchema("RegularLeaderboardEntry", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns an empty regular leaderboard from the live DB when no results exist", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/leaderboard/regular",
        });
        const res = createResponse();

        await getRegularLeaderboard(asRouteReq<RegularRouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(getJsonBody(res)).toEqual([]);
      } finally {
        await db.cleanup();
      }
    });

    test("falls back to live regular leaderboard data when the snapshot file is malformed", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertRegularResults([
          {
            teamId: "1",
            season: 2024,
            wins: 10,
            losses: 5,
            ties: 1,
            points: 21,
            divWins: 4,
            divLosses: 2,
            divTies: 0,
            isRegularChampion: true,
          },
        ]);

        const malformedSnapshotPath = path.join(
          db.snapshotDir,
          "leaderboard",
          "regular.json",
        );
        await fs.mkdir(path.dirname(malformedSnapshotPath), { recursive: true });
        await fs.writeFile(malformedSnapshotPath, "{ invalid json", "utf8");

        const req = createRequest({
          method: "GET",
          url: "/leaderboard/regular",
        });
        const res = createResponse();

        await getRegularLeaderboard(asRouteReq<RegularRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toEqual([
          expect.objectContaining({
            teamId: "1",
            teamName: "Colorado Avalanche",
            wins: 10,
            losses: 5,
            ties: 1,
            points: 21,
            regularTrophies: 1,
          }),
        ]);
      } finally {
        await db.cleanup();
      }
    });

    test("serves cached last-modified responses with a real ETag/304 flow", async () => {
      const db = await createIntegrationDb();

      try {
        await db.setLastModified("2026-03-10T12:00:00.000Z");

        const firstReq = createRequest({
          method: "GET",
          url: "/last-modified",
        });
        const firstRes = createResponse();

        await getLastModified(asRouteReq<LastModifiedRouteReq>(firstReq), firstRes);

        const firstBody = getJsonBody<Record<string, string | null>>(firstRes);
        const etag = String(firstRes.getHeader("etag"));

        expect(firstRes.statusCode).toBe(HTTP_STATUS.OK);
        expect(firstBody).toEqual({ lastModified: "2026-03-10T12:00:00.000Z" });
        expect(firstRes.getHeader("x-stats-data-source")).toBe("db");
        expect(etag).toMatch(/^".+"$/);

        const secondReq = createRequest({
          method: "GET",
          url: "/last-modified",
          headers: { "if-none-match": etag },
        });
        const secondRes = createResponse();

        await getLastModified(asRouteReq<LastModifiedRouteReq>(secondReq), secondRes);

        expect(secondRes.statusCode).toBe(304);
        expect(secondRes._getData()).toBe("");
      } finally {
        await db.cleanup();
      }
    });

    test("returns null last-modified from the live DB when metadata is missing", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/last-modified",
        });
        const res = createResponse();

        await getLastModified(asRouteReq<LastModifiedRouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(getJsonBody(res)).toEqual({ lastModified: null });
      } finally {
        await db.cleanup();
      }
    });
  });
};
