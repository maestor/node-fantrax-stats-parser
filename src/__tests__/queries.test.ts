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
  getPlayerCareerRowsFromDb,
  getGoalieCareerRowsFromDb,
  getAllPlayerCareerRowsFromDb,
  getAllGoalieCareerRowsFromDb,
  getAvailableSeasonsFromDb,
  getLastModifiedFromDb,
  getPlayoffLeaderboard,
  getPlayoffSeasons,
  getRegularLeaderboard,
  getRegularSeasons,
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
        ],
      });

      const result = await getPlayersFromDb("1", 2024, "regular");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("games > 0"),
        args: ["1", 2024, "regular"],
      });

      expect(result).toEqual<PlayerWithSeason[]>([
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
      ]);
    });

    test("maps null position to undefined", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            player_id: "p002",
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

    test("maps player_id to id", async () => {
      mockExecute.mockResolvedValue({
        rows: [
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
        ],
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
    test("returns mapped GoalieWithSeason array with gaa/savePercent as strings", async () => {
      mockExecute.mockResolvedValue({
        rows: [
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
        ],
      });

      const result = await getGoaliesFromDb("1", 2024, "regular");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("games > 0"),
        args: ["1", 2024, "regular"],
      });

      expect(result).toEqual<GoalieWithSeason[]>([
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
            goalie_id: "g002",
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

    test("returns undefined for persisted zero gaa and save_percent", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            goalie_id: "g003",
            name: "Zero Placeholder Goalie",
            games: 3,
            wins: 0,
            saves: 50,
            shutouts: 0,
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

      expect(result[0].gaa).toBeUndefined();
      expect(result[0].savePercent).toBeUndefined();
    });

    test("maps goalie_id to id", async () => {
      mockExecute.mockResolvedValue({
        rows: [
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
        ],
      });

      const result = await getGoaliesFromDb("1", 2024, "regular");
      expect(result[0].id).toBe("g007");
    });

    test("returns empty array when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getGoaliesFromDb("1", 2024, "regular");
      expect(result).toEqual([]);
    });
  });

  describe("getPlayerCareerRowsFromDb", () => {
    test("returns career player rows without filtering zero-game records", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            player_id: "p001",
            name: "Connor McDavid",
            position: "F",
            team_id: "1",
            season: 2024,
            report_type: "regular",
            games: 0,
            goals: 0,
            assists: 0,
            points: 0,
            plus_minus: 0,
            penalties: 0,
            shots: 0,
            ppp: 0,
            shp: 0,
            hits: 0,
            blocks: 0,
          },
        ],
      });

      const result = await getPlayerCareerRowsFromDb("p001");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.not.stringContaining("games > 0"),
        args: ["p001"],
      });
      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("CASE report_type WHEN 'regular' THEN 0 ELSE 1 END"),
        args: ["p001"],
      });
      expect(result).toEqual([
        {
          player_id: "p001",
          name: "Connor McDavid",
          position: "F",
          team_id: "1",
          season: 2024,
          report_type: "regular",
          games: 0,
          goals: 0,
          assists: 0,
          points: 0,
          plus_minus: 0,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
        },
      ]);
    });

    test("returns empty array when no career player rows exist", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getPlayerCareerRowsFromDb("missing");
      expect(result).toEqual([]);
    });
  });

  describe("getGoalieCareerRowsFromDb", () => {
    test("returns career goalie rows without filtering zero-game records", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            goalie_id: "g001",
            name: "Carey Price",
            team_id: "2",
            season: 2023,
            report_type: "playoffs",
            games: 0,
            wins: 0,
            saves: 0,
            shutouts: 0,
            goals: 0,
            assists: 0,
            points: 0,
            penalties: 0,
            ppp: 0,
            shp: 0,
            gaa: null,
            save_percent: null,
          },
        ],
      });

      const result = await getGoalieCareerRowsFromDb("g001");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.not.stringContaining("games > 0"),
        args: ["g001"],
      });
      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("CASE report_type WHEN 'regular' THEN 0 ELSE 1 END"),
        args: ["g001"],
      });
      expect(result).toEqual([
        {
          goalie_id: "g001",
          name: "Carey Price",
          team_id: "2",
          season: 2023,
          report_type: "playoffs",
          games: 0,
          wins: 0,
          saves: 0,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          gaa: null,
          save_percent: null,
        },
      ]);
    });

    test("returns empty array when no career goalie rows exist", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getGoalieCareerRowsFromDb("missing");
      expect(result).toEqual([]);
    });
  });

  describe("getAllPlayerCareerRowsFromDb", () => {
    test("returns all player career rows without filtering zero-game records", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            player_id: "p001",
            name: "Connor McDavid",
            position: "F",
            team_id: "1",
            season: 2024,
            report_type: "regular",
            games: 0,
            goals: 0,
            assists: 0,
            points: 0,
            plus_minus: 0,
            penalties: 0,
            shots: 0,
            ppp: 0,
            shp: 0,
            hits: 0,
            blocks: 0,
          },
        ],
      });

      const result = await getAllPlayerCareerRowsFromDb();

      expect(mockExecute).toHaveBeenCalledWith(expect.not.stringContaining("games > 0"));
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("ORDER BY name ASC"));
      expect(result).toEqual([
        expect.objectContaining({
          player_id: "p001",
          report_type: "regular",
          games: 0,
        }),
      ]);
    });
  });

  describe("getAllGoalieCareerRowsFromDb", () => {
    test("returns all goalie career rows without filtering zero-game records", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            goalie_id: "g001",
            name: "Carey Price",
            team_id: "2",
            season: 2024,
            report_type: "playoffs",
            games: 0,
            wins: 0,
            saves: 0,
            shutouts: 0,
            goals: 0,
            assists: 0,
            points: 0,
            penalties: 0,
            ppp: 0,
            shp: 0,
            gaa: null,
            save_percent: null,
          },
        ],
      });

      const result = await getAllGoalieCareerRowsFromDb();

      expect(mockExecute).toHaveBeenCalledWith(expect.not.stringContaining("games > 0"));
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("ORDER BY name ASC"));
      expect(result).toEqual([
        expect.objectContaining({
          goalie_id: "g001",
          report_type: "playoffs",
          games: 0,
        }),
      ]);
    });
  });

  describe("getAvailableSeasonsFromDb", () => {
    test("returns sorted season numbers", async () => {
      mockExecute.mockResolvedValue({
        rows: [{ season: 2012 }, { season: 2013 }, { season: 2014 }],
      });

      const result = await getAvailableSeasonsFromDb("1", "regular");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("games > 0"),
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

  describe("getPlayoffLeaderboard", () => {
    test("returns mapped leaderboard rows sorted by SQL order", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            team_id: "1",
            championships: 3,
            finals: 2,
            conference_finals: 2,
            second_round: 4,
            first_round: 2,
          },
          {
            team_id: "4",
            championships: 3,
            finals: 0,
            conference_finals: 4,
            second_round: 2,
            first_round: 4,
          },
        ],
      });

      const result = await getPlayoffLeaderboard();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("playoff_results"),
      );
      expect(result).toEqual([
        {
          teamId: "1",
          championships: 3,
          finals: 2,
          conferenceFinals: 2,
          secondRound: 4,
          firstRound: 2,
        },
        {
          teamId: "4",
          championships: 3,
          finals: 0,
          conferenceFinals: 4,
          secondRound: 2,
          firstRound: 4,
        },
      ]);
    });

    test("returns empty array when no playoff results exist", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getPlayoffLeaderboard();
      expect(result).toEqual([]);
    });
  });

  describe("getPlayoffSeasons", () => {
    test("returns per-team playoff seasons", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          { team_id: "1", season: 2023, round: 2 },
          { team_id: "1", season: 2024, round: 5 },
        ],
      });

      const result = await getPlayoffSeasons();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("FROM playoff_results"),
      );
      expect(result).toEqual([
        { teamId: "1", season: 2023, round: 2 },
        { teamId: "1", season: 2024, round: 5 },
      ]);
    });

    test("returns empty array when no playoff season rows exist", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getPlayoffSeasons();
      expect(result).toEqual([]);
    });
  });

  describe("getRegularLeaderboard", () => {
    test("returns mapped leaderboard rows sorted by SQL order", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            team_id: "1",
            seasons: 10,
            wins: 355,
            losses: 79,
            ties: 46,
            points: 756,
            div_wins: 86,
            div_losses: 24,
            div_ties: 10,
            regular_trophies: 3,
          },
          {
            team_id: "4",
            seasons: 10,
            wins: 319,
            losses: 105,
            ties: 56,
            points: 694,
            div_wins: 76,
            div_losses: 28,
            div_ties: 16,
            regular_trophies: 1,
          },
        ],
      });

      const result = await getRegularLeaderboard();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("regular_results"),
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("is_regular_champion"),
      );
      expect(result).toEqual([
        {
          teamId: "1",
          wins: 355,
          losses: 79,
          ties: 46,
          points: 756,
          divWins: 86,
          divLosses: 24,
          divTies: 10,
          regularTrophies: 3,
        },
        {
          teamId: "4",
          wins: 319,
          losses: 105,
          ties: 56,
          points: 694,
          divWins: 76,
          divLosses: 28,
          divTies: 16,
          regularTrophies: 1,
        },
      ]);
    });

    test("returns empty array when no regular results exist", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getRegularLeaderboard();
      expect(result).toEqual([]);
    });
  });

  describe("getRegularSeasons", () => {
    test("returns mapped regular season rows", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            team_id: "1",
            season: 2024,
            is_regular_champion: 1,
            wins: 35,
            losses: 7,
            ties: 6,
            points: 76,
            div_wins: 8,
            div_losses: 2,
            div_ties: 2,
          },
        ],
      });

      const result = await getRegularSeasons();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("FROM regular_results"),
      );
      expect(result).toEqual([
        {
          teamId: "1",
          season: 2024,
          regularTrophy: true,
          wins: 35,
          losses: 7,
          ties: 6,
          points: 76,
          divWins: 8,
          divLosses: 2,
          divTies: 2,
        },
      ]);
    });

    test("returns empty array when no regular season rows exist", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getRegularSeasons();
      expect(result).toEqual([]);
    });
  });
});
