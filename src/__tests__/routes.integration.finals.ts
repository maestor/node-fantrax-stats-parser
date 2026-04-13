import { createRequest, createResponse } from "node-mocks-http";
import { getFinalsLeaderboard } from "../features/finals/routes.js";
import { HTTP_STATUS } from "../shared/http.js";
import { createIntegrationDb } from "./integration-db.js";
import { expectArraySchema } from "./openapi-schema.js";
import { asRouteReq, getJsonBody } from "./routes.integration.helpers.js";

type FinalsRouteReq = Parameters<typeof getFinalsLeaderboard>[0];

const insertFinalsFixture = async (
  db: Awaited<ReturnType<typeof createIntegrationDb>>["db"],
): Promise<void> => {
  await db.execute({
    sql: `INSERT INTO finals_matchups (
            season, away_team_id, home_team_id, winner_team_id, home_tiebreak_won
          ) VALUES (?, ?, ?, ?, ?)`,
    args: [2014, "1", "5", "5", 0],
  });

  await db.execute({
    sql: `INSERT INTO finals_matchup_teams (
            season, team_id, side, is_winner, categories_won, categories_lost,
            categories_tied, match_points, played_games_total, played_games_skaters,
            played_games_goalies, goals, assists, points, plus_minus, penalties,
            shots, ppp, shp, hits, blocks, wins, saves, shutouts, gaa, save_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      2014,
      "1",
      "away",
      0,
      2,
      10,
      3,
      3.5,
      51,
      50,
      1,
      13,
      13,
      26,
      5,
      14,
      135,
      9,
      0,
      62,
      34,
      0,
      17,
      0,
      null,
      null,
    ],
  });
  await db.execute({
    sql: `INSERT INTO finals_matchup_teams (
            season, team_id, side, is_winner, categories_won, categories_lost,
            categories_tied, match_points, played_games_total, played_games_skaters,
            played_games_goalies, goals, assists, points, plus_minus, penalties,
            shots, ppp, shp, hits, blocks, wins, saves, shutouts, gaa, save_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      2014,
      "5",
      "home",
      1,
      10,
      2,
      3,
      11.5,
      52,
      49,
      3,
      8,
      18,
      26,
      -8,
      28,
      148,
      9,
      0,
      73,
      40,
      1,
      107,
      1,
      3.23,
      0.907,
    ],
  });

  const categories = [
    ["goals", 13, 8, "1"],
    ["points", 26, 26, null],
    ["wins", 0, 1, "5"],
    ["saves", 17, 107, "5"],
    ["gaa", null, 3.23, "5"],
    ["savePercent", null, 0.907, "5"],
  ] as const;

  for (const [statKey, awayValue, homeValue, winnerTeamId] of categories) {
    await db.execute({
      sql: `INSERT INTO finals_matchup_categories (
              season, stat_key, away_value, home_value, winner_team_id
            ) VALUES (?, ?, ?, ?, ?)`,
      args: [2014, statKey, awayValue, homeValue, winnerTeamId],
    });
  }
};

export const registerFinalsRouteIntegrationTests = (): void => {
  describe("finals routes", () => {
    test("builds finals leaderboard rows from the live finals tables", async () => {
      const db = await createIntegrationDb();

      try {
        await insertFinalsFixture(db.db);

        const req = createRequest({
          method: "GET",
          url: "/leaderboard/finals",
        });
        const res = createResponse();

        await getFinalsLeaderboard(asRouteReq<FinalsRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          season: 2014,
          winnerTeamId: "5",
          winnerTeamName: "Montreal Canadiens",
          wonOnHomeTiebreak: false,
          awayTeam: {
            teamId: "1",
            teamName: "Colorado Avalanche",
            playedGames: {
              total: 51,
              skaters: 50,
              goalies: 1,
            },
            totals: {
              saves: 17,
              gaa: null,
              savePercent: null,
            },
          },
          homeTeam: {
            teamId: "5",
            teamName: "Montreal Canadiens",
          },
          rates: {
            winRate: 0.767,
            deservedToWinRate: expect.any(Number),
          },
        });
        expect(body[0].awayTeam).not.toHaveProperty("isWinner");
        expect(body[0].homeTeam).not.toHaveProperty("isWinner");
        expect(body[0].categories).toEqual([
          {
            statKey: "goals",
            awayValue: 13,
            homeValue: 8,
            winnerTeamId: "1",
          },
          {
            statKey: "points",
            awayValue: 26,
            homeValue: 26,
            winnerTeamId: null,
          },
          {
            statKey: "wins",
            awayValue: 0,
            homeValue: 1,
            winnerTeamId: "5",
          },
          {
            statKey: "saves",
            awayValue: 17,
            homeValue: 107,
            winnerTeamId: "5",
          },
          {
            statKey: "gaa",
            awayValue: null,
            homeValue: 3.23,
            winnerTeamId: "5",
          },
          {
            statKey: "savePercent",
            awayValue: null,
            homeValue: 0.907,
            winnerTeamId: "5",
          },
        ]);
        expectArraySchema("FinalsLeaderboardEntry", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns an empty finals list when no finals rows exist", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/leaderboard/finals",
        });
        const res = createResponse();

        await getFinalsLeaderboard(asRouteReq<FinalsRouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toEqual([]);
      } finally {
        await db.cleanup();
      }
    });
  });
};
