import fs from "fs/promises";
import path from "path";
import { createRequest, createResponse } from "node-mocks-http";
import { getLastModified } from "../features/meta/routes.js";
import {
  getPlayoffsLeaderboard,
  getRegularLeaderboard,
  getTransactionsLeaderboard,
} from "../features/leaderboard/routes.js";
import { HTTP_STATUS } from "../shared/http.js";
import { createIntegrationDb } from "./integration-db.js";
import { expectArraySchema } from "./openapi-schema.js";
import {
  asRouteReq,
  getJsonBody,
  writeSnapshot,
} from "./routes.integration.helpers.js";

type PlayoffsRouteReq = Parameters<typeof getPlayoffsLeaderboard>[0];
type RegularRouteReq = Parameters<typeof getRegularLeaderboard>[0];
type TransactionsRouteReq = Parameters<typeof getTransactionsLeaderboard>[0];
type LastModifiedRouteReq = Parameters<typeof getLastModified>[0];

const insertClaimEventItem = async (
  db: Awaited<ReturnType<typeof createIntegrationDb>>["db"],
  row: {
    season: number;
    teamId: string;
    occurredAt: string;
    sourceFile: string;
    sourceGroupIndex: number;
    sequence: number;
    actionType: "claim" | "drop";
    rawName: string;
  },
): Promise<void> => {
  const eventResult = await db.execute({
    sql: `INSERT INTO claim_events (
            season, team_id, occurred_at, source_file, source_group_index
          ) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    args: [
      row.season,
      row.teamId,
      row.occurredAt,
      row.sourceFile,
      row.sourceGroupIndex,
    ],
  });
  const eventId = Number(eventResult.rows[0].id);

  await db.execute({
    sql: `INSERT INTO claim_event_items (
            claim_event_id, season, team_id, occurred_at, sequence, action_type,
            fantrax_entity_id, raw_name, raw_position, match_status, match_strategy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      eventId,
      row.season,
      row.teamId,
      row.occurredAt,
      row.sequence,
      row.actionType,
      null,
      row.rawName,
      null,
      "not_applicable",
      "not_applicable",
    ],
  });
};

const insertTradeBlock = async (
  db: Awaited<ReturnType<typeof createIntegrationDb>>["db"],
  row: {
    season: number;
    occurredAt: string;
    sourceFile: string;
    sourceBlockIndex: number;
    sourcePeriod: number;
    participantSignature: string;
    sequence: number;
    fromTeamId: string;
    toTeamId: string;
    rawName: string;
  },
): Promise<void> => {
  const blockResult = await db.execute({
    sql: `INSERT INTO trade_source_blocks (
            season, occurred_at, source_file, source_block_index, source_period, participant_signature
          ) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [
      row.season,
      row.occurredAt,
      row.sourceFile,
      row.sourceBlockIndex,
      row.sourcePeriod,
      row.participantSignature,
    ],
  });
  const blockId = Number(blockResult.rows[0].id);

  await db.execute({
    sql: `INSERT INTO trade_block_items (
            trade_source_block_id, sequence, from_team_id, to_team_id, asset_type,
            fantrax_entity_id, raw_name, raw_position, match_status, match_strategy,
            draft_season, draft_round, draft_original_team_id, raw_asset_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      blockId,
      row.sequence,
      row.fromTeamId,
      row.toTeamId,
      "player",
      null,
      row.rawName,
      "F",
      "not_applicable",
      "not_applicable",
      null,
      null,
      null,
      row.rawName,
    ],
  });
};

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

    test("builds transaction leaderboard rows from live transaction tables", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "player-1",
            name: "Roster Forward",
            position: "F",
            games: 10,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            playerId: "player-1",
            name: "Roster Forward",
            position: "F",
            games: 4,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "player-2",
            name: "Roster Defender",
            position: "D",
            games: 12,
          },
          {
            teamId: "1",
            season: 2025,
            reportType: "regular",
            playerId: "player-1",
            name: "Roster Forward",
            position: "F",
            games: 8,
          },
          {
            teamId: "1",
            season: 2025,
            reportType: "regular",
            playerId: "player-3",
            name: "New Skater",
            position: "F",
            games: 7,
          },
        ]);
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            goalieId: "goalie-1",
            name: "Roster Goalie",
            games: 6,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            goalieId: "goalie-1",
            name: "Roster Goalie",
            games: 2,
          },
          {
            teamId: "1",
            season: 2025,
            reportType: "regular",
            goalieId: "goalie-1",
            name: "Roster Goalie",
            games: 9,
          },
          {
            teamId: "1",
            season: 2025,
            reportType: "regular",
            goalieId: "goalie-2",
            name: "New Goalie",
            games: 5,
          },
        ]);
        await insertClaimEventItem(db.db, {
          season: 2025,
          teamId: "1",
          occurredAt: "2026-03-05T17:00:00.000Z",
          sourceFile: "claims-2025-2026.csv",
          sourceGroupIndex: 0,
          sequence: 0,
          actionType: "claim",
          rawName: "Claimed Player",
        });
        await insertClaimEventItem(db.db, {
          season: 2025,
          teamId: "1",
          occurredAt: "2026-03-06T17:00:00.000Z",
          sourceFile: "claims-2025-2026.csv",
          sourceGroupIndex: 1,
          sequence: 0,
          actionType: "drop",
          rawName: "Dropped Player",
        });
        await insertTradeBlock(db.db, {
          season: 2025,
          occurredAt: "2026-03-07T17:00:00.000Z",
          sourceFile: "trades-2025-2026.csv",
          sourceBlockIndex: 0,
          sourcePeriod: 150,
          participantSignature: "1|19",
          sequence: 0,
          fromTeamId: "1",
          toTeamId: "19",
          rawName: "Trade Asset A",
        });
        await insertTradeBlock(db.db, {
          season: 2025,
          occurredAt: "2026-03-07T17:00:00.000Z",
          sourceFile: "trades-2025-2026.csv",
          sourceBlockIndex: 1,
          sourcePeriod: 151,
          participantSignature: "1|19",
          sequence: 0,
          fromTeamId: "19",
          toTeamId: "1",
          rawName: "Trade Asset B",
        });

        const req = createRequest({
          method: "GET",
          url: "/leaderboard/transactions",
        });
        const res = createResponse();

        await getTransactionsLeaderboard(
          asRouteReq<TransactionsRouteReq>(req),
          res,
        );

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        const colorado = body.find((entry) => entry.teamId === "1");

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(colorado).toEqual(
          expect.objectContaining({
            teamId: "1",
            teamName: "Colorado Avalanche",
            claims: 1,
            drops: 1,
            trades: 1,
            players: 3,
            goalies: 2,
            tieRank: false,
          }),
        );
        expect(colorado?.seasons).toEqual([
          {
            season: 2024,
            claims: 0,
            drops: 0,
            trades: 0,
            players: 2,
            goalies: 1,
          },
          {
            season: 2025,
            claims: 1,
            drops: 1,
            trades: 1,
            players: 2,
            goalies: 2,
          },
        ]);
        expectArraySchema("TransactionLeaderboardEntry", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns transaction leaderboard zero-state from the live DB when no transaction rows exist", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/leaderboard/transactions",
        });
        const res = createResponse();

        await getTransactionsLeaderboard(
          asRouteReq<TransactionsRouteReq>(req),
          res,
        );

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        const colorado = body.find((entry) => entry.teamId === "1");

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(32);
        expect(colorado).toEqual(
          expect.objectContaining({
            teamId: "1",
            teamName: "Colorado Avalanche",
            claims: 0,
            drops: 0,
            trades: 0,
            players: 0,
            goalies: 0,
            seasons: [],
            tieRank: false,
          }),
        );
      } finally {
        await db.cleanup();
      }
    });

    test("returns player and goalie counts for roster-only seasons without transaction rows", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "player-1",
            name: "Roster Forward",
            position: "F",
            games: 10,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            playerId: "player-1",
            name: "Roster Forward",
            position: "F",
            games: 3,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            playerId: "player-2",
            name: "Roster Defender",
            position: "D",
            games: 11,
          },
        ]);
        await db.insertGoalies([
          {
            teamId: "1",
            season: 2024,
            reportType: "regular",
            goalieId: "goalie-1",
            name: "Roster Goalie",
            games: 7,
          },
          {
            teamId: "1",
            season: 2024,
            reportType: "playoffs",
            goalieId: "goalie-1",
            name: "Roster Goalie",
            games: 2,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/leaderboard/transactions",
        });
        const res = createResponse();

        await getTransactionsLeaderboard(
          asRouteReq<TransactionsRouteReq>(req),
          res,
        );

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        const colorado = body.find((entry) => entry.teamId === "1");

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(colorado).toEqual(
          expect.objectContaining({
            teamId: "1",
            teamName: "Colorado Avalanche",
            claims: 0,
            drops: 0,
            trades: 0,
            players: 2,
            goalies: 1,
            tieRank: false,
          }),
        );
        expect(colorado?.seasons).toEqual([
          {
            season: 2024,
            claims: 0,
            drops: 0,
            trades: 0,
            players: 2,
            goalies: 1,
          },
        ]);
        expectArraySchema("TransactionLeaderboardEntry", body);
      } finally {
        await db.cleanup();
      }
    });

    test("serves transaction leaderboard snapshots from local snapshot storage", async () => {
      const db = await createIntegrationDb();

      try {
        const snapshotPayload = [
          {
            teamId: "2",
            teamName: "Carolina Hurricanes",
            claims: 77,
            drops: 70,
            trades: 15,
            players: 140,
            goalies: 18,
            seasons: [
              {
                season: 2025,
                claims: 12,
                drops: 11,
                trades: 3,
                players: 21,
                goalies: 3,
              },
            ],
            tieRank: false,
          },
        ];
        await writeSnapshot(
          db.snapshotDir,
          "leaderboard/transactions",
          snapshotPayload,
        );

        const req = createRequest({
          method: "GET",
          url: "/leaderboard/transactions",
        });
        const res = createResponse();

        await getTransactionsLeaderboard(
          asRouteReq<TransactionsRouteReq>(req),
          res,
        );

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
        expect(getJsonBody(res)).toEqual(snapshotPayload);
      } finally {
        await db.cleanup();
      }
    });

    test("falls back to live transaction leaderboard data when the snapshot file is malformed", async () => {
      const db = await createIntegrationDb();

      try {
        await insertClaimEventItem(db.db, {
          season: 2025,
          teamId: "1",
          occurredAt: "2026-03-05T17:00:00.000Z",
          sourceFile: "claims-2025-2026.csv",
          sourceGroupIndex: 0,
          sequence: 0,
          actionType: "claim",
          rawName: "Claimed Player",
        });

        const malformedSnapshotPath = path.join(
          db.snapshotDir,
          "leaderboard",
          "transactions.json",
        );
        await fs.mkdir(path.dirname(malformedSnapshotPath), {
          recursive: true,
        });
        await fs.writeFile(malformedSnapshotPath, "{ invalid json", "utf8");

        const req = createRequest({
          method: "GET",
          url: "/leaderboard/transactions",
        });
        const res = createResponse();

        await getTransactionsLeaderboard(
          asRouteReq<TransactionsRouteReq>(req),
          res,
        );

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              teamId: "1",
              teamName: "Colorado Avalanche",
              claims: 1,
              drops: 0,
              trades: 0,
              players: 0,
              goalies: 0,
            }),
          ]),
        );
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
