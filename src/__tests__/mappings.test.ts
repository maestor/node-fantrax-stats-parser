import {
  mapPlayerData,
  mapCombinedPlayerData,
  mapGoalieData,
  mapCombinedGoalieData,
  mapAvailableSeasons,
} from "../mappings";
import { applyPlayerScores, applyGoalieScores } from "../helpers";
import {
  mockRawDataPlayer,
  mockRawDataPlayerWithCommas,
  mockRawDataGoalie,
  mockRawDataGoalie2012,
  mockRawDataGoalie2014,
  mockRawDataGoalieNoField18,
  mockRawDataFirstRow,
  mockRawDataEmptyName,
  mockRawDataZeroGames,
} from "./fixtures";

jest.mock("../helpers");

describe("mappings", () => {
  describe("mapPlayerData", () => {
    test("excludes first row from results", () => {
      const result = mapPlayerData([mockRawDataFirstRow, mockRawDataPlayer]);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Connor McDavid");
    });

    test("excludes players with Skaters === G", () => {
      const result = mapPlayerData([mockRawDataGoalie, mockRawDataPlayer]);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Connor McDavid");
    });

    test("excludes players with empty field2", () => {
      const result = mapPlayerData([mockRawDataEmptyName, mockRawDataPlayer]);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Connor McDavid");
    });

    test("excludes players with 0 games", () => {
      const result = mapPlayerData([mockRawDataZeroGames, mockRawDataPlayer]);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Connor McDavid");
    });

    test("correctly parses numbers with commas (1,234)", () => {
      const result = mapPlayerData([mockRawDataFirstRow, mockRawDataPlayerWithCommas]);
      expect(result[0].games).toBe(82);
      expect(result[0].goals).toBe(5678);
      expect(result[0].assists).toBe(9012);
      expect(result[0].points).toBe(14690);
      expect(result[0].shots).toBe(3000);
    });

    test("maps RawData to PlayerWithSeason with correct fields", () => {
      const result = mapPlayerData([mockRawDataFirstRow, mockRawDataPlayer]);
      expect(result[0]).toEqual({
        name: "Connor McDavid",
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
      });
    });

    test("defaults to 0 when Number() fails", () => {
      const invalidData = {
        ...mockRawDataPlayer,
        field8: "invalid", // goals
        field9: "", // assists
        field10: "", // points
        field11: "", // plusMinus
        field12: "", // penalties
        field13: "", // shots
        field14: "", // ppp
        field15: "", // shp
        field16: "", // hits
        field17: "", // blocks
      };
      const result = mapPlayerData([mockRawDataFirstRow, invalidData]);
      expect(result[0].goals).toBe(0);
      expect(result[0].assists).toBe(0);
      expect(result[0].points).toBe(0);
      expect(result[0].plusMinus).toBe(0);
      expect(result[0].penalties).toBe(0);
      expect(result[0].shots).toBe(0);
      expect(result[0].ppp).toBe(0);
      expect(result[0].shp).toBe(0);
      expect(result[0].hits).toBe(0);
      expect(result[0].blocks).toBe(0);
    });
  });

  describe("mapCombinedPlayerData", () => {
    test("sums stats for player across multiple seasons", () => {
      const season1 = {
        ...mockRawDataPlayer,
        season: 2023,
        field2: "Player A",
        field7: "50",
        field8: "30",
      };
      const season2 = {
        ...mockRawDataPlayer,
        season: 2024,
        field2: "Player A",
        field7: "32",
        field8: "20",
      };

      const result = mapCombinedPlayerData([mockRawDataFirstRow, season1, season2]);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Player A");
      expect(result[0].games).toBe(82);
      expect(result[0].goals).toBe(50);
      expect(result[0].seasons.length).toBe(2);
    });

    test("preserves individual season data in seasons array", () => {
      const season1 = { ...mockRawDataPlayer, season: 2023 };
      const season2 = { ...mockRawDataPlayer, season: 2024 };

      const result = mapCombinedPlayerData([mockRawDataFirstRow, season1, season2]);

      expect(result[0].seasons[0].season).toBe(2023);
      expect(result[0].seasons[1].season).toBe(2024);
      expect(result[0].seasons[0]).toHaveProperty("games");
      expect(result[0].seasons[0]).toHaveProperty("goals");
      expect(result[0].seasons[0]).not.toHaveProperty("name");
    });

    test("works correctly with single season data", () => {
      const result = mapCombinedPlayerData([mockRawDataFirstRow, mockRawDataPlayer]);

      expect(result.length).toBe(1);
      expect(result[0].seasons.length).toBe(1);
    });

    test("handles multiple different players", () => {
      const player1 = { ...mockRawDataPlayer, field2: "Player A" };
      const player2 = { ...mockRawDataPlayer, field2: "Player B" };

      const result = mapCombinedPlayerData([mockRawDataFirstRow, player1, player2]);

      expect(result.length).toBe(2);
      expect(result.map((p) => p.name).sort()).toEqual(["Player A", "Player B"]);
    });

    test("applies per-season scores to seasons entries", () => {
      jest.clearAllMocks();
      (applyPlayerScores as jest.Mock).mockImplementation((players) => {
        type ScoredSeasonPlayer = {
          season: number;
          score: number;
          scoreAdjustedByGames: number;
          scores?: { goals: number };
        };

        // Simulate scoring that depends only on season to verify wiring
        (players as ScoredSeasonPlayer[]).forEach((player) => {
          player.score = player.season === 2023 ? 10 : 20;
          player.scoreAdjustedByGames = player.season === 2023 ? 1 : 2;
          player.scores = { goals: player.season };
        });
        return players;
      });

      const season1 = { ...mockRawDataPlayer, season: 2023, field2: "Player A" };
      const season2 = { ...mockRawDataPlayer, season: 2024, field2: "Player A" };

      const result = mapCombinedPlayerData([mockRawDataFirstRow, season1, season2]);

      expect(applyPlayerScores).toHaveBeenCalledTimes(2);

      const seasons = result[0].seasons.sort((a, b) => a.season - b.season);

      expect(seasons[0].season).toBe(2023);
      expect(seasons[0].score).toBe(10);
      expect(seasons[0].scoreAdjustedByGames).toBe(1);
      expect(seasons[0].scores).toEqual({ goals: 2023 });

      expect(seasons[1].season).toBe(2024);
      expect(seasons[1].score).toBe(20);
      expect(seasons[1].scoreAdjustedByGames).toBe(2);
      expect(seasons[1].scores).toEqual({ goals: 2024 });
    });

    test("defaults per-season score fields when lookup is missing", () => {
      jest.clearAllMocks();

      // Force a lookup miss by replacing objects inside the per-season scoring step.
      // This keeps `playersWithSeason` (used later in reduce) unchanged while the
      // lookup keys are created from different name values.
      (applyPlayerScores as jest.Mock).mockImplementation((players) => {
        for (let i = 0; i < (players as Array<{ name: string }>).length; i++) {
          const player = (players as Array<{ name: string }>)[i];
          (players as Array<{ name: string }>)[i] = {
            ...(player as unknown as object),
            name: `${player.name}-scored`,
          } as unknown as never;
        }
        return players;
      });

      const season1 = { ...mockRawDataPlayer, season: 2023, field2: "Player A" };
      const season2 = { ...mockRawDataPlayer, season: 2024, field2: "Player A" };

      const result = mapCombinedPlayerData([mockRawDataFirstRow, season1, season2]);

      const seasons = result[0].seasons.sort((a, b) => a.season - b.season);

      expect(seasons[0].score).toBe(0);
      expect(seasons[0].scoreAdjustedByGames).toBe(0);
      expect(seasons[0].scores).toBeUndefined();

      expect(seasons[1].score).toBe(0);
      expect(seasons[1].scoreAdjustedByGames).toBe(0);
      expect(seasons[1].scores).toBeUndefined();
    });
  });

  describe("mapGoalieData", () => {
    test("only includes goalies with valid data", () => {
      const result = mapGoalieData([mockRawDataFirstRow, mockRawDataPlayer, mockRawDataGoalie]);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Test Goalie");
    });

    test("maps wins and games correctly for season 2012", () => {
      const result = mapGoalieData([mockRawDataFirstRow, mockRawDataGoalie2012]);

      expect(result[0].games).toBe(70);
      expect(result[0].wins).toBe(40);
      expect(result[0].season).toBe(2012);
    });

    test("maps wins and games correctly for season 2013", () => {
      const season2013 = { ...mockRawDataGoalie2012, season: 2013 };
      const result = mapGoalieData([mockRawDataFirstRow, season2013]);

      expect(result[0].games).toBe(70);
      expect(result[0].wins).toBe(40);
    });

    test("maps wins and games correctly for season 2014", () => {
      const result = mapGoalieData([mockRawDataFirstRow, mockRawDataGoalie2014]);

      expect(result[0].games).toBe(70);
      expect(result[0].wins).toBe(40);
      expect(result[0].season).toBe(2014);
    });

    test("maps wins and games correctly for season 2025", () => {
      const { mockRawDataGoalie2025 } = jest.requireActual("./fixtures");
      const result = mapGoalieData([mockRawDataFirstRow, mockRawDataGoalie2025]);

      expect(result[0].games).toBe(23);
      expect(result[0].wins).toBe(15);
      expect(result[0].season).toBe(2025);
    });

    test("defaults shp to 0 when field18 is missing", () => {
      const result = mapGoalieData([mockRawDataFirstRow, mockRawDataGoalieNoField18]);

      expect(result[0].shp).toBe(0);
    });

    test("maps all RawData fields to GoalieWithSeason", () => {
      const result = mapGoalieData([mockRawDataFirstRow, mockRawDataGoalie2014]);

      expect(result[0]).toEqual({
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
        score: 0,
        scoreAdjustedByGames: 0,
        season: 2014,
        gaa: "2.30",
        savePercent: "0.920",
      });
    });

    test("excludes goalies with both games and wins as 0", () => {
      const zeroGoalie = {
        ...mockRawDataGoalie2014,
        field7: "0",
        field8: "0",
      };
      const result = mapGoalieData([mockRawDataFirstRow, zeroGoalie]);

      expect(result.length).toBe(0);
    });

    test("includes goalie with games > 0, wins = 0", () => {
      const goalie = {
        ...mockRawDataGoalie2014,
        field7: "0",
        field8: "10",
      };
      const result = mapGoalieData([mockRawDataFirstRow, goalie]);

      expect(result.length).toBe(1);
    });

    test("includes goalie with wins > 0, games = 0", () => {
      const goalie = {
        ...mockRawDataGoalie2014,
        field7: "10",
        field8: "0",
      };
      const result = mapGoalieData([mockRawDataFirstRow, goalie]);

      expect(result.length).toBe(1);
    });

    test("handles commas in goalie numbers", () => {
      const goalieWithCommas = {
        ...mockRawDataGoalie2014,
        field10: "2,500",
      };
      const result = mapGoalieData([mockRawDataFirstRow, goalieWithCommas]);

      expect(result[0].saves).toBe(2500);
    });

    test("excludes goalies with empty field2", () => {
      const emptyNameGoalie = {
        ...mockRawDataGoalie2014,
        field2: "",
      };
      const result = mapGoalieData([mockRawDataFirstRow, emptyNameGoalie]);

      expect(result.length).toBe(0);
    });

    test("defaults goalie stats to 0 when Number() fails", () => {
      const invalidGoalie = {
        ...mockRawDataGoalie2014,
        field7: "10", // games - keep valid to pass filter
        field8: "", // wins - will be 0
        field10: "invalid", // saves
        field12: "", // shutouts
        field13: "", // penalties
        field14: "", // goals
        field15: "", // assists
        field16: "", // points
        field17: "", // ppp
      };
      const result = mapGoalieData([mockRawDataFirstRow, invalidGoalie]);

      expect(result[0].wins).toBe(0);
      expect(result[0].saves).toBe(0);
      expect(result[0].shutouts).toBe(0);
      expect(result[0].penalties).toBe(0);
      expect(result[0].goals).toBe(0);
      expect(result[0].assists).toBe(0);
      expect(result[0].points).toBe(0);
      expect(result[0].ppp).toBe(0);
    });

    test("defaults goalie games to 0 for season 2012 when Number() fails", () => {
      const invalidGoalie2012Games = {
        ...mockRawDataGoalie2012,
        field7: "", // games (for <=2013) - will be 0
        field8: "10", // wins (for <=2013) - keep valid to pass filter
      };
      const result = mapGoalieData([mockRawDataFirstRow, invalidGoalie2012Games]);

      expect(result[0].games).toBe(0);
      expect(result[0].wins).toBe(10);
    });

    test("defaults goalie wins to 0 for season 2012 when Number() fails", () => {
      const invalidGoalie2012Wins = {
        ...mockRawDataGoalie2012,
        field7: "10", // games (for <=2013) - keep valid to pass filter
        field8: "", // wins (for <=2013) - will be 0
      };
      const result = mapGoalieData([mockRawDataFirstRow, invalidGoalie2012Wins]);

      expect(result[0].games).toBe(10);
      expect(result[0].wins).toBe(0);
    });

    test("handles field18 with comma in ternary", () => {
      const goalieWithCommaInField18 = {
        ...mockRawDataGoalie2014,
        field18: "1,234",
      };
      const result = mapGoalieData([mockRawDataFirstRow, goalieWithCommaInField18]);

      expect(result[0].shp).toBe(1234);
    });
  });

  describe("mapCombinedGoalieData", () => {
    test("sums goalie stats for multiple seasons", () => {
      const season1 = {
        ...mockRawDataGoalie2014,
        season: 2023,
        field2: "Goalie A",
        field7: "60",
        field8: "30",
      };
      const season2 = {
        ...mockRawDataGoalie2014,
        season: 2024,
        field2: "Goalie A",
        field7: "40",
        field8: "20",
      };

      const result = mapCombinedGoalieData([mockRawDataFirstRow, season1, season2]);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Goalie A");
      expect(result[0].wins).toBe(50);
      expect(result[0].games).toBe(100);
      expect(result[0].seasons.length).toBe(2);
    });

    test("does not include gaa and savePercent in combined data root level", () => {
      const result = mapCombinedGoalieData([mockRawDataFirstRow, mockRawDataGoalie2014]);

      expect(result[0]).not.toHaveProperty("gaa");
      expect(result[0]).not.toHaveProperty("savePercent");
    });

    test("includes individual season data in seasons array", () => {
      const season1 = { ...mockRawDataGoalie2014, season: 2023 };
      const season2 = { ...mockRawDataGoalie2014, season: 2024 };

      const result = mapCombinedGoalieData([mockRawDataFirstRow, season1, season2]);

      expect(result[0].seasons[0].season).toBe(2023);
      expect(result[0].seasons[1].season).toBe(2024);
      expect(result[0].seasons[0]).toHaveProperty("wins");
      expect(result[0].seasons[0]).toHaveProperty("games");
      expect(result[0].seasons[0]).not.toHaveProperty("name");
    });

    test("handles multiple different goalies", () => {
      const goalie1 = { ...mockRawDataGoalie2014, field2: "Goalie A" };
      const goalie2 = { ...mockRawDataGoalie2014, field2: "Goalie B" };

      const result = mapCombinedGoalieData([mockRawDataFirstRow, goalie1, goalie2]);

      expect(result.length).toBe(2);
      expect(result.map((g) => g.name).sort()).toEqual(["Goalie A", "Goalie B"]);
    });

    test("handles mixed season data with year boundary", () => {
      const old = mockRawDataGoalie2012;
      const newer = mockRawDataGoalie2014;

      const result = mapCombinedGoalieData([mockRawDataFirstRow, old, newer]);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Carey Price");
      expect(result[0].wins).toBe(80);
      expect(result[0].games).toBe(140);
    });

    test("applies per-season scores to goalie seasons entries and keeps advanced stats", () => {
      jest.clearAllMocks();
      (applyGoalieScores as jest.Mock).mockImplementation((goalies) => {
        type ScoredSeasonGoalie = {
          season: number;
          score: number;
          scoreAdjustedByGames: number;
          scores?: { wins: number };
        };

        (goalies as ScoredSeasonGoalie[]).forEach((goalie) => {
          goalie.score = goalie.season === 2023 ? 15 : 25;
          goalie.scoreAdjustedByGames = goalie.season === 2023 ? 3 : 4;
          goalie.scores = { wins: goalie.season };
        });
        return goalies;
      });

      const season1 = { ...mockRawDataGoalie2014, season: 2023, field2: "Goalie A" };
      const season2 = { ...mockRawDataGoalie2014, season: 2024, field2: "Goalie A" };

      const result = mapCombinedGoalieData([mockRawDataFirstRow, season1, season2]);

      expect(applyGoalieScores).toHaveBeenCalledTimes(2);

      const seasons = result[0].seasons.sort((a, b) => a.season - b.season);

      expect(seasons[0].season).toBe(2023);
      expect(seasons[0].score).toBe(15);
      expect(seasons[0].scoreAdjustedByGames).toBe(3);
      expect(seasons[0].scores).toEqual({ wins: 2023 });
      expect(seasons[0].gaa).toBe("2.30");
      expect(seasons[0].savePercent).toBe("0.920");

      expect(seasons[1].season).toBe(2024);
      expect(seasons[1].score).toBe(25);
      expect(seasons[1].scoreAdjustedByGames).toBe(4);
      expect(seasons[1].scores).toEqual({ wins: 2024 });
      expect(seasons[1].gaa).toBe("2.30");
      expect(seasons[1].savePercent).toBe("0.920");
    });

    test("defaults per-season score fields when lookup is missing", () => {
      jest.clearAllMocks();

      (applyGoalieScores as jest.Mock).mockImplementation((goalies) => {
        for (let i = 0; i < (goalies as Array<{ name: string }>).length; i++) {
          const goalie = (goalies as Array<{ name: string }>)[i];
          (goalies as Array<{ name: string }>)[i] = {
            ...(goalie as unknown as object),
            name: `${goalie.name}-scored`,
          } as unknown as never;
        }
        return goalies;
      });

      const season1 = { ...mockRawDataGoalie2014, season: 2023, field2: "Goalie A" };
      const season2 = { ...mockRawDataGoalie2014, season: 2024, field2: "Goalie A" };

      const result = mapCombinedGoalieData([mockRawDataFirstRow, season1, season2]);

      const seasons = result[0].seasons.sort((a, b) => a.season - b.season);

      expect(seasons[0].score).toBe(0);
      expect(seasons[0].scoreAdjustedByGames).toBe(0);
      expect(seasons[0].scores).toBeUndefined();

      expect(seasons[1].score).toBe(0);
      expect(seasons[1].scoreAdjustedByGames).toBe(0);
      expect(seasons[1].scores).toBeUndefined();
    });
  });

  describe("mapAvailableSeasons", () => {
    test("maps season numbers to season objects", () => {
      const result = mapAvailableSeasons([2012, 2013, 2014]);

      expect(result).toEqual([
        { season: 2012, text: "2012-2013" },
        { season: 2013, text: "2013-2014" },
        { season: 2014, text: "2014-2015" },
      ]);
    });

    test("returns empty array when no seasons available", () => {
      const result = mapAvailableSeasons([]);

      expect(result).toEqual([]);
    });
  });
});
