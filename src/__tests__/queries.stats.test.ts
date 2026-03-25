jest.mock("../db/client", () => {
  const mockExecute = jest.fn();
  return {
    getDbClient: jest.fn(() => ({ execute: mockExecute })),
  };
});

import { getDbClient } from "../db/client";
import {
  getAvailableSeasonsFromDb,
  getGoaliesFromDb,
  getPlayersFromDb,
} from "../db/queries";
import type {
  GoalieWithSeason,
  PlayerWithSeason,
} from "../features/stats/types";

const mockExecute = (getDbClient() as unknown as { execute: jest.Mock }).execute;

describe("db/queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("roster stat queries", () => {
    describe("getPlayersFromDb", () => {
      test("returns mapped PlayerWithSeason array", async () => {
        const rows = [
          {
            player_id: "p001",
            name: "Connor McDavid",
            position: "F",
            games: 82,
            goals: 50,
            assists: 75,
            points: 125,
            plus_minus: 25,
            penalties: 20,
            shots: 350,
            ppp: 40,
            shp: 5,
            hits: 30,
            blocks: 25,
            season: 2024,
          },
        ];
        const expected = [
          {
            id: "p001",
            name: "Connor McDavid",
            position: "F",
            games: 82,
            goals: 50,
            assists: 75,
            points: 125,
            plusMinus: 25,
            penalties: 20,
            shots: 350,
            ppp: 40,
            shp: 5,
            hits: 30,
            blocks: 25,
            score: 0,
            scoreAdjustedByGames: 0,
            season: 2024,
          },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getPlayersFromDb("1", 2024, "regular");

        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining("games > 0"),
          args: ["1", 2024, "regular"],
        });

        expect(result).toEqual<PlayerWithSeason[]>(expected);
      });

      test("maps player_id to id", async () => {
        const rows = [
          {
            player_id: "00qs7",
            name: "Sebastian Aho",
            position: "F",
            games: 82,
            goals: 1,
            assists: 1,
            points: 2,
            plus_minus: 0,
            penalties: 0,
            shots: 0,
            ppp: 0,
            shp: 0,
            hits: 0,
            blocks: 0,
            season: 2024,
          },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getPlayersFromDb("1", 2024, "regular");
        expect(result[0].id).toBe("00qs7");
      });

      test("returns empty array when no rows", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getPlayersFromDb("1", 2024, "regular");
        expect(result).toEqual([]);
      });
    });

    describe("getGoaliesFromDb", () => {
      test("returns mapped GoalieWithSeason array with fixed goalie rate precision", async () => {
        const rows = [
          {
            goalie_id: "g001",
            name: "Carey Price",
            games: 70,
            wins: 40,
            saves: 2000,
            shutouts: 10,
            goals: 5,
            assists: 10,
            points: 15,
            penalties: 15,
            ppp: 2,
            shp: 1,
            gaa: 2.3,
            save_percent: 0.92,
            season: 2024,
          },
        ];
        const expected = [
          {
            id: "g001",
            name: "Carey Price",
            games: 70,
            wins: 40,
            saves: 2000,
            shutouts: 10,
            goals: 5,
            assists: 10,
            points: 15,
            penalties: 15,
            ppp: 2,
            shp: 1,
            gaa: "2.30",
            savePercent: "0.920",
            score: 0,
            scoreAdjustedByGames: 0,
            season: 2024,
          },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getGoaliesFromDb("1", 2024, "regular");

        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining("games > 0"),
          args: ["1", 2024, "regular"],
        });

        expect(result).toEqual<GoalieWithSeason[]>(expected);
      });

      test("maps goalie_id to id", async () => {
        const rows = [
          {
            goalie_id: "g007",
            name: "Juuse Saros",
            games: 60,
            wins: 30,
            saves: 1500,
            shutouts: 3,
            goals: 0,
            assists: 1,
            points: 1,
            penalties: 0,
            ppp: 0,
            shp: 0,
            gaa: 2.5,
            save_percent: 0.91,
            season: 2024,
          },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getGoaliesFromDb("1", 2024, "regular");
        expect(result[0].id).toBe("g007");
      });

      test("preserves played zero goalie rates with padded decimals", async () => {
        mockExecute.mockResolvedValue({
          rows: [
            {
              goalie_id: "g000",
              name: "Zero Rate Goalie",
              games: 3,
              wins: 1,
              saves: 0,
              shutouts: 1,
              goals: 0,
              assists: 0,
              points: 0,
              penalties: 0,
              ppp: 0,
              shp: 0,
              gaa: 0,
              save_percent: 0,
              season: 2024,
            },
          ],
        });

        const result = await getGoaliesFromDb("1", 2024, "regular");

        expect(result[0].gaa).toBe("0.00");
        expect(result[0].savePercent).toBe("0.000");
      });

      test("returns empty array when no rows", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getGoaliesFromDb("1", 2024, "regular");
        expect(result).toEqual([]);
      });
    });

    describe("getAvailableSeasonsFromDb", () => {
      test("returns sorted season numbers", async () => {
        const rows = [{ season: 2012 }, { season: 2013 }, { season: 2014 }];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getAvailableSeasonsFromDb("1", "regular");

        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining("games > 0"),
          args: ["1", "regular"],
        });
        expect(result).toEqual(rows.map((row) => row.season));
      });

      test("returns empty array when no seasons", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getAvailableSeasonsFromDb("1", "regular");
        expect(result).toEqual([]);
      });
    });
  });
});
