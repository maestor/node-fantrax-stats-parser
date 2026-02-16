jest.mock("../db/client", () => {
  const mockExecute = jest.fn();
  return {
    getDbClient: jest.fn(() => ({ execute: mockExecute })),
  };
});

import { getDbClient } from "../db/client";
import {
  getPlayersFromDb,
  getGoaliesFromDb,
  getAvailableSeasonsFromDb,
  getTeamIdsWithData,
  getLastModifiedFromDb,
} from "../db/queries";
import type { PlayerWithSeason, GoalieWithSeason } from "../types";

const mockExecute = (getDbClient() as unknown as { execute: jest.Mock }).execute;

describe("db/queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getPlayersFromDb", () => {
    test("returns mapped PlayerWithSeason array", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
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
        ],
      });

      const result = await getPlayersFromDb("1", 2024, "regular");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("SELECT"),
        args: ["1", 2024, "regular"],
      });

      expect(result).toEqual<PlayerWithSeason[]>([
        {
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
      ]);
    });

    test("maps null position to undefined", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            name: "Test Player",
            position: null,
            games: 10,
            goals: 5,
            assists: 5,
            points: 10,
            plus_minus: 0,
            penalties: 2,
            shots: 30,
            ppp: 1,
            shp: 0,
            hits: 5,
            blocks: 3,
            season: 2024,
          },
        ],
      });

      const result = await getPlayersFromDb("1", 2024, "regular");
      expect(result[0].position).toBeUndefined();
    });

    test("returns empty array when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getPlayersFromDb("1", 2024, "regular");
      expect(result).toEqual([]);
    });
  });

  describe("getGoaliesFromDb", () => {
    test("returns mapped GoalieWithSeason array with gaa/savePercent as strings", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
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
        ],
      });

      const result = await getGoaliesFromDb("1", 2024, "regular");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("SELECT"),
        args: ["1", 2024, "regular"],
      });

      expect(result).toEqual<GoalieWithSeason[]>([
        {
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
          gaa: "2.3",
          savePercent: "0.92",
          score: 0,
          scoreAdjustedByGames: 0,
          season: 2024,
        },
      ]);
    });

    test("returns undefined for null gaa and save_percent", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            name: "Test Goalie",
            games: 5,
            wins: 2,
            saves: 100,
            shutouts: 0,
            goals: 0,
            assists: 0,
            points: 0,
            penalties: 0,
            ppp: 0,
            shp: 0,
            gaa: null,
            save_percent: null,
            season: 2024,
          },
        ],
      });

      const result = await getGoaliesFromDb("1", 2024, "regular");

      expect(result[0].gaa).toBeUndefined();
      expect(result[0].savePercent).toBeUndefined();
    });

    test("returns empty array when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getGoaliesFromDb("1", 2024, "regular");
      expect(result).toEqual([]);
    });
  });

  describe("getAvailableSeasonsFromDb", () => {
    test("returns sorted season numbers", async () => {
      mockExecute.mockResolvedValue({
        rows: [{ season: 2012 }, { season: 2013 }, { season: 2014 }],
      });

      const result = await getAvailableSeasonsFromDb("1", "regular");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("DISTINCT season"),
        args: ["1", "regular"],
      });
      expect(result).toEqual([2012, 2013, 2014]);
    });

    test("returns empty array when no seasons", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getAvailableSeasonsFromDb("1", "regular");
      expect(result).toEqual([]);
    });
  });

  describe("getTeamIdsWithData", () => {
    test("returns distinct team IDs from both tables", async () => {
      mockExecute.mockResolvedValue({
        rows: [{ team_id: "1" }, { team_id: "2" }, { team_id: "3" }],
      });

      const result = await getTeamIdsWithData();

      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("UNION"));
      expect(result).toEqual(["1", "2", "3"]);
    });

    test("returns empty array when no data", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getTeamIdsWithData();
      expect(result).toEqual([]);
    });
  });

  describe("getLastModifiedFromDb", () => {
    test("returns timestamp from import_metadata", async () => {
      mockExecute.mockResolvedValue({
        rows: [{ value: "2026-02-15T12:00:00.000Z" }],
      });

      const result = await getLastModifiedFromDb();

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("import_metadata"),
        args: ["last_modified"],
      });
      expect(result).toBe("2026-02-15T12:00:00.000Z");
    });

    test("returns null when no metadata row", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getLastModifiedFromDb();
      expect(result).toBeNull();
    });
  });
});
