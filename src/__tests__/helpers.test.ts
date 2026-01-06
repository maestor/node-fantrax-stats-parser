jest.mock("fs", () => ({
  readdirSync: jest
    .fn()
    .mockReturnValue(["regular-2012-2013.csv", "regular-2013-2014.csv", "regular-2014-2015.csv"]),
}));

import fs from "fs";
import {
  sortItemsByStatField,
  applyPlayerScores,
  applyGoalieScores,
  availableSeasons,
  seasonAvailable,
  reportTypeAvailable,
  parseSeasonParam,
} from "../helpers";
import { Player, Goalie, Report } from "../types";

describe("helpers", () => {
  describe("sortItemsByStatField", () => {
    const players: Player[] = [
      {
        name: "Player A",
        games: 82,
        goals: 30,
        assists: 40,
        points: 70,
        plusMinus: 10,
        penalties: 20,
        shots: 250,
        ppp: 20,
        shp: 2,
        hits: 100,
        blocks: 50,
        score: 0,
      },
      {
        name: "Player B",
        games: 75,
        goals: 50,
        assists: 60,
        points: 110,
        plusMinus: 25,
        penalties: 15,
        shots: 350,
        ppp: 40,
        shp: 5,
        hits: 80,
        blocks: 40,
        score: 0,
      },
      {
        name: "Player C",
        games: 80,
        goals: 40,
        assists: 40,
        points: 80,
        plusMinus: 15,
        penalties: 10,
        shots: 300,
        ppp: 30,
        shp: 3,
        hits: 90,
        blocks: 45,
        score: 0,
      },
    ];

    const goalies: Goalie[] = [
      {
        name: "Goalie A",
        games: 60,
        wins: 30,
        saves: 1500,
        shutouts: 5,
        goals: 2,
        assists: 5,
        points: 7,
        penalties: 2,
        ppp: 1,
        shp: 0,
        score: 0,
      },
      {
        name: "Goalie B",
        games: 70,
        wins: 45,
        saves: 2000,
        shutouts: 8,
        goals: 3,
        assists: 8,
        points: 11,
        penalties: 4,
        ppp: 2,
        shp: 1,
        score: 0,
      },
      {
        name: "Goalie C",
        games: 65,
        wins: 35,
        saves: 1800,
        shutouts: 6,
        goals: 1,
        assists: 6,
        points: 7,
        penalties: 3,
        ppp: 1,
        shp: 0,
        score: 0,
      },
    ];

    test("sorts players by specified field (goals) descending", () => {
      const result = sortItemsByStatField([...players], "players", "goals") as Player[];
      expect(result[0].name).toBe("Player B");
      expect(result[1].name).toBe("Player C");
      expect(result[2].name).toBe("Player A");
    });

    test("returns players unsorted when sortBy is name", () => {
      const result = sortItemsByStatField([...players], "players", "name") as Player[];
      expect(result[0].name).toBe("Player A");
      expect(result[1].name).toBe("Player B");
      expect(result[2].name).toBe("Player C");
    });

    test("sorts players by default (points desc, then goals desc)", () => {
      const playersWithTie: Player[] = [
        { ...players[0], points: 80, goals: 25 },
        { ...players[1], points: 80, goals: 35 },
        { ...players[2], points: 100, goals: 40 },
      ];
      const result = sortItemsByStatField(playersWithTie, "players") as Player[];
      expect(result[0].name).toBe("Player C"); // 100 points
      expect(result[1].name).toBe("Player B"); // 80 points, 35 goals
      expect(result[2].name).toBe("Player A"); // 80 points, 25 goals
    });

    test("sorts goalies by specified field (saves) descending", () => {
      const result = sortItemsByStatField([...goalies], "goalies", "saves") as Goalie[];
      expect(result[0].name).toBe("Goalie B");
      expect(result[1].name).toBe("Goalie C");
      expect(result[2].name).toBe("Goalie A");
    });

    test("returns goalies unsorted when sortBy is name", () => {
      const result = sortItemsByStatField([...goalies], "goalies", "name") as Goalie[];
      expect(result[0].name).toBe("Goalie A");
      expect(result[1].name).toBe("Goalie B");
      expect(result[2].name).toBe("Goalie C");
    });

    test("sorts goalies by default (wins desc, then games desc)", () => {
      const goaliesWithTie: Goalie[] = [
        { ...goalies[0], wins: 40, games: 60 },
        { ...goalies[1], wins: 40, games: 70 },
        { ...goalies[2], wins: 50, games: 65 },
      ];
      const result = sortItemsByStatField(goaliesWithTie, "goalies") as Goalie[];
      expect(result[0].name).toBe("Goalie C"); // 50 wins
      expect(result[1].name).toBe("Goalie B"); // 40 wins, 70 games
      expect(result[2].name).toBe("Goalie A"); // 40 wins, 60 games
    });

    test("returns data unsorted for unknown kind", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = sortItemsByStatField([...players], "unknown" as any);
      expect(result[0].name).toBe("Player A");
      expect(result[1].name).toBe("Player B");
      expect(result[2].name).toBe("Player C");
    });
  });

  describe("applyPlayerScores", () => {
    test("calculates relative scores between 0 and 100 for players", () => {
      const testPlayers: Player[] = [
        {
          name: "Player High",
          games: 0,
          goals: 50,
          assists: 0,
          points: 0,
          plusMinus: 0,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
        },
        {
          name: "Player Half",
          games: 0,
          goals: 25,
          assists: 0,
          points: 0,
          plusMinus: 0,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
        },
      ];

      const result = applyPlayerScores(testPlayers);

      expect(result[0].score).toBeDefined();
      expect(result[1].score).toBeDefined();

      const highScore = result[0].score as number;
      const halfScore = result[1].score as number;

      expect(highScore).toBeGreaterThan(halfScore);
      expect(highScore).toBeGreaterThanOrEqual(0);
      expect(highScore).toBeLessThanOrEqual(100);
      expect(halfScore).toBeGreaterThanOrEqual(0);
      expect(halfScore).toBeLessThanOrEqual(100);

      expect(parseFloat(highScore.toFixed(2))).toBe(highScore);
      expect(parseFloat(halfScore.toFixed(2))).toBe(halfScore);
    });

    test("returns empty array unchanged when no players", () => {
      const result = applyPlayerScores([]);
      expect(result).toEqual([]);
    });
  });

  describe("applyPlayerScores plusMinus handling", () => {
    test("maps plusMinus linearly between min and max", () => {
      const testPlayers: Player[] = [
        {
          name: "Best",
          games: 0,
          goals: 0,
          assists: 0,
          points: 0,
          plusMinus: 20,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
        },
        {
          name: "Worst",
          games: 0,
          goals: 0,
          assists: 0,
          points: 0,
          plusMinus: -10,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
        },
        {
          name: "Middle",
          games: 0,
          goals: 0,
          assists: 0,
          points: 0,
          plusMinus: 5,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
        },
      ];

      const [best, worst, middle] = applyPlayerScores(testPlayers);

      expect(best.score).toBeDefined();
      expect(worst.score).toBeDefined();
      expect(middle.score).toBeDefined();

      const bestScore = best.score as number;
      const worstScore = worst.score as number;
      const middleScore = middle.score as number;

      expect(bestScore).toBeGreaterThan(middleScore);
      expect(middleScore).toBeGreaterThan(worstScore);
      expect(bestScore).toBeGreaterThanOrEqual(0);
      expect(bestScore).toBeLessThanOrEqual(100);
      expect(worstScore).toBeGreaterThanOrEqual(0);
      expect(worstScore).toBeLessThanOrEqual(100);
      expect(middleScore).toBeGreaterThanOrEqual(0);
      expect(middleScore).toBeLessThanOrEqual(100);
    });

    test("handles equal plusMinus values without contributing", () => {
      const testPlayers: Player[] = [
        {
          name: "Equal A",
          games: 0,
          goals: 0,
          assists: 0,
          points: 0,
          plusMinus: 5,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
        },
        {
          name: "Equal B",
          games: 0,
          goals: 0,
          assists: 0,
          points: 0,
          plusMinus: 5,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
        },
      ];

      const result = applyPlayerScores(testPlayers);

      expect(result[0].score).toBeDefined();
      expect(result[1].score).toBeDefined();
    });
  });

  describe("applyPlayerScores with invalid numbers", () => {
    test("treats NaN stat values as 0", () => {
      const testPlayers: Player[] = [
        {
          name: "NaN Player",
          games: 0,
          goals: Number.NaN,
          assists: 0,
          points: 0,
          plusMinus: 0,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
        },
        {
          name: "Valid Player",
          games: 0,
          goals: 10,
          assists: 0,
          points: 0,
          plusMinus: 0,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
        },
      ];

      const [nanPlayer, validPlayer] = applyPlayerScores(testPlayers);

      expect(nanPlayer.score).toBeDefined();
      expect(validPlayer.score).toBeDefined();
      expect(nanPlayer.score as number).toBeGreaterThanOrEqual(0);
      expect(validPlayer.score as number).toBeGreaterThanOrEqual(0);
    });
  });

  describe("applyGoalieScores", () => {
    test("calculates relative scores between 0 and 100 for goalies", () => {
      const testGoalies: Goalie[] = [
        {
          name: "Goalie High",
          games: 0,
          wins: 40,
          saves: 0,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          score: 0,
        },
        {
          name: "Goalie Half",
          games: 0,
          wins: 20,
          saves: 0,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          score: 0,
        },
      ];

      const result = applyGoalieScores(testGoalies);

      expect(result[0].score).toBeDefined();
      expect(result[1].score).toBeDefined();

      const highScore = result[0].score as number;
      const halfScore = result[1].score as number;

      expect(highScore).toBeGreaterThan(halfScore);
      expect(highScore).toBeGreaterThanOrEqual(0);
      expect(highScore).toBeLessThanOrEqual(100);
      expect(halfScore).toBeGreaterThanOrEqual(0);
      expect(halfScore).toBeLessThanOrEqual(100);

      expect(parseFloat(highScore.toFixed(2))).toBe(highScore);
      expect(parseFloat(halfScore.toFixed(2))).toBe(halfScore);
    });

    test("returns empty array unchanged when no goalies", () => {
      const result = applyGoalieScores([]);
      expect(result).toEqual([]);
    });

    test("includes savePercent and gaa contributions when present, including invalid values", () => {
      const testGoalies: Goalie[] = [
        {
          name: "Goalie Best",
          games: 0,
          wins: 10,
          saves: 0,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          savePercent: "0.930",
          gaa: "2.0",
          score: 0,
        },
        {
          name: "Goalie Worse Advanced",
          games: 0,
          wins: 10,
          saves: 0,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          savePercent: "0.910",
          gaa: "3.0",
          score: 0,
        },
        {
          name: "Goalie Invalid Advanced",
          games: 0,
          wins: 10,
          saves: 0,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          savePercent: "not-a-number",
          gaa: "not-a-number",
          score: 0,
        },
        {
          name: "Goalie No Advanced",
          games: 0,
          wins: 10,
          saves: 0,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          score: 0,
        },
      ];

      const [best, worseAdvanced, invalidAdvanced, noAdvanced] = applyGoalieScores(testGoalies);

      expect(best.score).toBeDefined();
      expect(worseAdvanced.score).toBeDefined();
      expect(invalidAdvanced.score).toBeDefined();
      expect(noAdvanced.score).toBeDefined();

      const bestScore = best.score as number;
      const worseAdvancedScore = worseAdvanced.score as number;
      const invalidAdvancedScore = invalidAdvanced.score as number;
      const noAdvancedScore = noAdvanced.score as number;
      expect(bestScore).toBeGreaterThanOrEqual(0);
      expect(bestScore).toBeLessThanOrEqual(100);
      expect(worseAdvancedScore).toBeGreaterThanOrEqual(0);
      expect(worseAdvancedScore).toBeLessThanOrEqual(100);
      expect(invalidAdvancedScore).toBeGreaterThanOrEqual(0);
      expect(invalidAdvancedScore).toBeLessThanOrEqual(100);
      expect(noAdvancedScore).toBeGreaterThanOrEqual(0);
      expect(noAdvancedScore).toBeLessThanOrEqual(100);
    });

    test("sets score to 0 when no contributing metrics", () => {
      const testGoalies: Goalie[] = [
        {
          name: "Goalie No Metrics",
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
          score: 5,
        },
      ];

      const [goalie] = applyGoalieScores(testGoalies);
      expect(goalie.score).toBe(0);
    });
  });

  describe("availableSeasons", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("returns array of seasons starting from START_SEASON", () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        "regular-2012-2013.csv",
        "regular-2013-2014.csv",
        "regular-2014-2015.csv",
        "playoffs-2012-2013.csv",
      ]);

      const result = availableSeasons();
      expect(result).toEqual([2012, 2013, 2014]);
      expect(result.length).toBe(3);
    });

    test("returns empty array when no files exist", async () => {
      // Mock fs with empty array for this specific test
      jest.resetModules();
      jest.doMock("fs", () => ({
        readdirSync: jest.fn().mockReturnValue([]),
      }));

      // Re-import helpers with the new mock
      const { availableSeasons: emptyAvailableSeasons } = await import("../helpers");

      const result = emptyAvailableSeasons();
      expect(result).toEqual([]);

      // Restore original mock for other tests
      jest.resetModules();
    });
  });

  describe("seasonAvailable", () => {
    beforeEach(() => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        "regular-2012-2013.csv",
        "regular-2013-2014.csv",
        "regular-2014-2015.csv",
      ]);
    });

    test("returns true for available season", () => {
      expect(seasonAvailable(2012)).toBe(true);
      expect(seasonAvailable(2013)).toBe(true);
      expect(seasonAvailable(2014)).toBe(true);
    });

    test("returns false for unavailable season", () => {
      expect(seasonAvailable(2020)).toBe(false);
      expect(seasonAvailable(2000)).toBe(false);
    });

    test("returns false for undefined season", () => {
      expect(seasonAvailable(undefined)).toBe(false);
    });
  });

  describe("reportTypeAvailable", () => {
    test("returns true for regular", () => {
      expect(reportTypeAvailable("regular")).toBe(true);
    });

    test("returns true for playoffs", () => {
      expect(reportTypeAvailable("playoffs")).toBe(true);
    });

    test("returns false for invalid report type", () => {
      expect(reportTypeAvailable("invalid" as Report)).toBe(false);
    });

    test("returns false for undefined", () => {
      expect(reportTypeAvailable(undefined)).toBe(false);
    });
  });

  describe("parseSeasonParam", () => {
    test("returns number for valid numeric string", () => {
      expect(parseSeasonParam("2024")).toBe(2024);
      expect(parseSeasonParam("2012")).toBe(2012);
    });

    test("returns undefined for undefined", () => {
      expect(parseSeasonParam(undefined)).toBe(undefined);
    });

    test("returns undefined for empty string", () => {
      expect(parseSeasonParam("")).toBe(undefined);
    });

    test("returns undefined for null", () => {
      expect(parseSeasonParam(null)).toBe(undefined);
    });

    test("returns undefined for non-numeric string", () => {
      expect(parseSeasonParam("abc")).toBe(undefined);
    });

    test("returns undefined for NaN", () => {
      expect(parseSeasonParam(NaN)).toBe(undefined);
    });

    test("handles number input correctly", () => {
      expect(parseSeasonParam(2024)).toBe(2024);
    });
  });
});
