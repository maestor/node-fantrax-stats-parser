jest.mock("fs", () => ({
  readdirSync: jest
    .fn()
    .mockReturnValue(["regular-2012-2013.csv", "regular-2013-2014.csv", "regular-2014-2015.csv"]),
}));

import fs from "fs";
import path from "path";
import { MIN_GAMES_FOR_ADJUSTED_SCORE } from "../constants";
import {
  ApiError,
  sortItemsByStatField,
  applyPlayerScores,
  applyPlayerScoresByPosition,
  applyGoalieScores,
  availableSeasons,
  ERROR_MESSAGES,
  getTeamsWithCsvFolders,
  HTTP_STATUS,
  listSeasonsForTeam,
  resetHelperCachesForTests,
  seasonAvailable,
  reportTypeAvailable,
  parseSeasonParam,
  resolveTeamId,
} from "../helpers";
import { Player, Goalie, Report } from "../types";

describe("helpers", () => {
  beforeEach(() => {
    resetHelperCachesForTests();
  });

  test("memoizes listSeasonsForTeam results", () => {
    (fs.readdirSync as unknown as jest.Mock).mockClear();

    const first = listSeasonsForTeam("1", "regular");
    const second = listSeasonsForTeam("1", "regular");

    expect(first).toEqual(second);
    // First call does two readdirSync calls (exists-check + list).
    // Second call is fully served from cache.
    expect(fs.readdirSync).toHaveBeenCalledTimes(2);
  });

  test("memoizes getTeamsWithCsvFolders results", () => {
    (fs.readdirSync as unknown as jest.Mock).mockClear();
    const first = getTeamsWithCsvFolders();
    const callsAfterFirst = (fs.readdirSync as unknown as jest.Mock).mock.calls.length;

    const second = getTeamsWithCsvFolders();
    const callsAfterSecond = (fs.readdirSync as unknown as jest.Mock).mock.calls.length;

    expect(first).toEqual(second);
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  test("memoizes hasTeamCsvDir via resolveTeamId", () => {
    (fs.readdirSync as unknown as jest.Mock).mockClear();

    const first = resolveTeamId("1");
    const callsAfterFirst = (fs.readdirSync as unknown as jest.Mock).mock.calls.length;

    const second = resolveTeamId("1");
    const callsAfterSecond = (fs.readdirSync as unknown as jest.Mock).mock.calls.length;

    expect(first).toBe("1");
    expect(second).toBe("1");
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  test("hasTeamCsvDir re-throws non-ENOENT errors", () => {
    resetHelperCachesForTests();
    const permError = new Error("Permission denied") as NodeJS.ErrnoException;
    permError.code = "EPERM";
    (fs.readdirSync as unknown as jest.Mock).mockImplementationOnce(() => {
      throw permError;
    });

    expect(() => getTeamsWithCsvFolders()).toThrow("Permission denied");
  });

  test("hasTeamCsvDir re-throws when error has no code property", () => {
    resetHelperCachesForTests();
    (fs.readdirSync as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error("Generic error"); // No code property
    });

    expect(() => getTeamsWithCsvFolders()).toThrow("Generic error");
  });

  test("hasTeamCsvDir re-throws when thrown value is undefined", () => {
    resetHelperCachesForTests();
    (fs.readdirSync as unknown as jest.Mock).mockImplementationOnce(() => {
      throw undefined;
    });

    expect(() => getTeamsWithCsvFolders()).toThrow();
  });

  test("ensureTeamCsvDirOrThrow re-throws non-ENOENT errors", () => {
    resetHelperCachesForTests();
    (fs.readdirSync as unknown as jest.Mock)
      .mockReturnValueOnce([]) // First call for hasTeamCsvDir succeeds
      .mockImplementationOnce(() => {
        const permError = new Error("Permission denied") as NodeJS.ErrnoException;
        permError.code = "EPERM";
        throw permError;
      });

    expect(() => listSeasonsForTeam("1", "regular")).toThrow("Permission denied");
  });

  test("ensureTeamCsvDirOrThrow re-throws when error has no code property", () => {
    resetHelperCachesForTests();
    (fs.readdirSync as unknown as jest.Mock)
      .mockReturnValueOnce([]) // First call for hasTeamCsvDir succeeds
      .mockImplementationOnce(() => {
        throw new Error("Generic error"); // No code property
      });

    expect(() => listSeasonsForTeam("1", "regular")).toThrow("Generic error");
  });

  test("ensureTeamCsvDirOrThrow re-throws when thrown value is undefined", () => {
    resetHelperCachesForTests();
    (fs.readdirSync as unknown as jest.Mock)
      .mockReturnValueOnce([]) // First call for hasTeamCsvDir succeeds
      .mockImplementationOnce(() => {
        throw undefined;
      });

    expect(() => listSeasonsForTeam("1", "regular")).toThrow();
  });

  test("ensureTeamCsvDirOrThrow re-throws ENOENT for unconfigured team (not ApiError)", () => {
    resetHelperCachesForTests();
    (fs.readdirSync as unknown as jest.Mock).mockImplementation(() => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    // Team "999" is not configured, so ENOENT should be re-thrown, not wrapped in ApiError
    expect(() => listSeasonsForTeam("999", "regular")).toThrow("ENOENT");
  });

  test("ensureTeamCsvDirOrThrow re-throws undefined for unconfigured team", () => {
    resetHelperCachesForTests();
    (fs.readdirSync as unknown as jest.Mock).mockImplementation(() => {
      throw undefined;
    });

    // Team "999" is not configured, err is undefined, so should re-throw
    expect(() => listSeasonsForTeam("999", "regular")).toThrow();
  });

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
        scoreAdjustedByGames: 0,
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
        scoreAdjustedByGames: 0,
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
        scoreAdjustedByGames: 0,
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
        scoreAdjustedByGames: 0,
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
        scoreAdjustedByGames: 0,
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
        scoreAdjustedByGames: 0,
      },
    ];

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
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScores(testPlayers);

      expect(result[0].score).toBeDefined();
      expect(result[1].score).toBeDefined();

      expect(result[0].scores).toBeDefined();
      expect(result[0].scores?.goals).toBeDefined();
      expect(result[1].scores?.goals).toBeDefined();

      const highScore = result[0].score as number;
      const halfScore = result[1].score as number;

      expect(highScore).toBeGreaterThan(halfScore);
      expect(highScore).toBeGreaterThanOrEqual(0);
      expect(highScore).toBeLessThanOrEqual(100);
      expect(halfScore).toBeGreaterThanOrEqual(0);
      expect(halfScore).toBeLessThanOrEqual(100);

      expect(highScore).toBe(100);

      expect(parseFloat(highScore.toFixed(2))).toBe(highScore);
      expect(parseFloat(halfScore.toFixed(2))).toBe(halfScore);
    });

    test("returns empty array unchanged when no players", () => {
      const result = applyPlayerScores([]);
      expect(result).toEqual([]);
    });

    test("sets scoreAdjustedByGames to 0 for players under minimum games", () => {
      const minGames = MIN_GAMES_FOR_ADJUSTED_SCORE;
      const belowMinGames = Math.max(minGames - 1, 0);

      const testPlayers: Player[] = [
        {
          name: "Few Games High Stats",
          games: belowMinGames,
          goals: 5,
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Eligible Player",
          games: minGames,
          goals: 5,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const [fewGames, eligible] = applyPlayerScores(testPlayers);

      expect(fewGames.scoreAdjustedByGames).toBe(0);
      expect(eligible.scoreAdjustedByGames).toBeGreaterThan(0);
    });

    test("sets scoreAdjustedByGames to 0 when no players meet minimum games", () => {
      const minGames = MIN_GAMES_FOR_ADJUSTED_SCORE;
      const belowMinGamesA = Math.max(minGames - 1, 0);
      const belowMinGamesB = Math.max(minGames - 2, 0);

      const testPlayers: Player[] = [
        {
          name: "Under Min A",
          games: belowMinGamesA,
          goals: 5,
          assists: 3,
          points: 8,
          plusMinus: 2,
          penalties: 1,
          shots: 10,
          ppp: 1,
          shp: 0,
          hits: 2,
          blocks: 1,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Under Min B",
          games: belowMinGamesB,
          goals: 4,
          assists: 2,
          points: 6,
          plusMinus: -1,
          penalties: 2,
          shots: 8,
          ppp: 1,
          shp: 0,
          hits: 1,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScores(testPlayers);

      expect(result.every((p) => p.scoreAdjustedByGames === 0)).toBe(true);
    });

    test("uses 0 baseline for always-positive stats", () => {
      const testPlayers: Player[] = [
        {
          name: "Top Scorer",
          games: 0,
          goals: 40,
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Zero Goals",
          games: 0,
          goals: 0,
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Lowest With Goals",
          games: 0,
          goals: 3,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const [top, zero, lowest] = applyPlayerScores(testPlayers);

      expect(zero.score).toBe(0);
      expect((lowest.score as number) > 0).toBe(true);
      expect((top.score as number) > (lowest.score as number)).toBe(true);
    });

    test("handles equal positive values for always-positive stats", () => {
      const testPlayers: Player[] = [
        {
          name: "Player One",
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Player Two",
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
          scoreAdjustedByGames: 0,
        },
      ];

      const [one, two] = applyPlayerScores(testPlayers);

      expect(one.score).toBeDefined();
      expect(two.score).toBeDefined();
      expect(one.score).toBe(two.score);
      expect((one.score as number) > 0).toBe(true);
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
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScores(testPlayers);

      expect(result[0].score).toBeDefined();
      expect(result[1].score).toBeDefined();
    });

    test("uses per-game plusMinus in scoreAdjustedByGames", () => {
      const minGames = MIN_GAMES_FOR_ADJUSTED_SCORE;

      const testPlayers: Player[] = [
        {
          name: "Best PlusMinus",
          games: minGames,
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Middle PlusMinus",
          games: minGames,
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Worst PlusMinus",
          games: minGames,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const [best, middle, worst] = applyPlayerScores(testPlayers);

      expect(best.scoreAdjustedByGames).toBeDefined();
      expect(middle.scoreAdjustedByGames).toBeDefined();
      expect(worst.scoreAdjustedByGames).toBeDefined();

      const bestAdj = best.scoreAdjustedByGames as number;
      const middleAdj = middle.scoreAdjustedByGames as number;
      const worstAdj = worst.scoreAdjustedByGames as number;

      expect(bestAdj).toBeGreaterThan(middleAdj);
      expect(middleAdj).toBeGreaterThan(worstAdj);
      expect(bestAdj).toBeGreaterThanOrEqual(0);
      expect(bestAdj).toBeLessThanOrEqual(100);
      expect(worstAdj).toBeGreaterThanOrEqual(0);
      expect(worstAdj).toBeLessThanOrEqual(100);

      expect(bestAdj).toBe(100);
    });

    test("keeps scoreAdjustedByGames at 0 when all per-game stats are zero", () => {
      const minGames = MIN_GAMES_FOR_ADJUSTED_SCORE;

      const testPlayers: Player[] = [
        {
          name: "Zero Stats Eligible A",
          games: minGames,
          goals: 0,
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Zero Stats Eligible B",
          games: minGames + 1,
          goals: 0,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScores(testPlayers);

      expect(result.every((p) => p.scoreAdjustedByGames === 0)).toBe(true);
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
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const [nanPlayer, validPlayer] = applyPlayerScores(testPlayers);

      expect(nanPlayer.score).toBeDefined();
      expect(validPlayer.score).toBeDefined();
      expect(nanPlayer.score as number).toBeGreaterThanOrEqual(0);
      expect(validPlayer.score as number).toBeGreaterThanOrEqual(0);
    });
  });

  describe("applyPlayerScoresByPosition", () => {
    test("returns empty array unchanged when no players", () => {
      const result = applyPlayerScoresByPosition([]);
      expect(result).toEqual([]);
    });

    test("scores forwards against forwards only", () => {
      const testPlayers: Player[] = [
        {
          name: "Forward High",
          position: "F",
          games: 10,
          goals: 20,
          assists: 30,
          points: 50,
          plusMinus: 10,
          penalties: 5,
          shots: 100,
          ppp: 10,
          shp: 2,
          hits: 20,
          blocks: 5,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Forward Low",
          position: "F",
          games: 10,
          goals: 10,
          assists: 15,
          points: 25,
          plusMinus: 5,
          penalties: 10,
          shots: 50,
          ppp: 5,
          shp: 1,
          hits: 10,
          blocks: 3,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Defenseman",
          position: "D",
          games: 10,
          goals: 5,
          assists: 10,
          points: 15,
          plusMinus: 15,
          penalties: 2,
          shots: 30,
          ppp: 3,
          shp: 0,
          hits: 50,
          blocks: 40,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScoresByPosition(testPlayers);

      // Forward High should score 100 among forwards
      expect(result[0].scoreByPosition).toBe(100);
      expect(result[0].scoresByPosition).toBeDefined();
      expect(result[0].scoreByPositionAdjustedByGames).toBeDefined();

      // Forward Low should score less than Forward High
      expect((result[1].scoreByPosition as number) < 100).toBe(true);
      expect(result[1].scoreByPosition).toBeGreaterThan(0);

      // Defenseman is only one in his group, so should score 100
      expect(result[2].scoreByPosition).toBe(100);
    });

    test("handles players with no position", () => {
      const testPlayers: Player[] = [
        {
          name: "No Position Player",
          games: 10,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 0,
          penalties: 0,
          shots: 50,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScoresByPosition(testPlayers);

      // Player without position should not have position scores
      expect(result[0].scoreByPosition).toBeUndefined();
    });

    test("sets scoreByPositionAdjustedByGames to 0 for players under minimum games", () => {
      const minGames = MIN_GAMES_FOR_ADJUSTED_SCORE;
      const belowMinGames = Math.max(minGames - 1, 0);

      const testPlayers: Player[] = [
        {
          name: "Few Games Forward",
          position: "F",
          games: belowMinGames,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 0,
          penalties: 0,
          shots: 50,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Eligible Forward",
          position: "F",
          games: minGames,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 0,
          penalties: 0,
          shots: 50,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScoresByPosition(testPlayers);

      expect(result[0].scoreByPositionAdjustedByGames).toBe(0);
      expect((result[1].scoreByPositionAdjustedByGames as number) > 0).toBe(true);
    });

    test("handles all players below minimum games in position group", () => {
      const belowMinGames = Math.max(MIN_GAMES_FOR_ADJUSTED_SCORE - 1, 0);

      const testPlayers: Player[] = [
        {
          name: "Few Games Forward 1",
          position: "F",
          games: belowMinGames,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 0,
          penalties: 0,
          shots: 50,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Few Games Forward 2",
          position: "F",
          games: belowMinGames,
          goals: 5,
          assists: 5,
          points: 10,
          plusMinus: 0,
          penalties: 0,
          shots: 25,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScoresByPosition(testPlayers);

      expect(result[0].scoreByPositionAdjustedByGames).toBe(0);
      expect(result[1].scoreByPositionAdjustedByGames).toBe(0);
    });

    test("handles plusMinus with equal values in position group", () => {
      const testPlayers: Player[] = [
        {
          name: "Forward 1",
          position: "F",
          games: 10,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 5,
          penalties: 0,
          shots: 50,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Forward 2",
          position: "F",
          games: 10,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 5,
          penalties: 0,
          shots: 50,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScoresByPosition(testPlayers);

      // Equal stats should result in equal scores
      expect(result[0].scoreByPosition).toBe(result[1].scoreByPosition);
    });

    test("treats NaN stat values as 0 in position scoring", () => {
      const testPlayers: Player[] = [
        {
          name: "NaN Forward",
          position: "F",
          games: 10,
          goals: NaN,
          assists: 10,
          points: 10,
          plusMinus: 0,
          penalties: 0,
          shots: 50,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Valid Forward",
          position: "F",
          games: 10,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 0,
          penalties: 0,
          shots: 50,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScoresByPosition(testPlayers);

      expect(result[0].scoreByPosition).toBeDefined();
      expect(result[1].scoreByPosition).toBeDefined();
      expect((result[0].scoreByPosition as number) >= 0).toBe(true);
    });

    test("handles negative plusMinus per game in position scoring", () => {
      const testPlayers: Player[] = [
        {
          name: "Positive Forward",
          position: "F",
          games: 10,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 20,
          penalties: 0,
          shots: 50,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Negative Forward",
          position: "F",
          games: 10,
          goals: 5,
          assists: 5,
          points: 10,
          plusMinus: -15,
          penalties: 0,
          shots: 25,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScoresByPosition(testPlayers);

      // Positive plusMinus player should score higher in position scoring
      expect((result[0].scoreByPositionAdjustedByGames as number) > (result[1].scoreByPositionAdjustedByGames as number)).toBe(true);
    });

    test("handles all stats at zero in position group", () => {
      const testPlayers: Player[] = [
        {
          name: "Zero Forward 1",
          position: "F",
          games: 1,
          goals: 0,
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Zero Forward 2",
          position: "F",
          games: 1,
          goals: 0,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyPlayerScoresByPosition(testPlayers);

      expect(result[0].scoreByPosition).toBeDefined();
      expect(result[1].scoreByPosition).toBeDefined();
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
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyGoalieScores(testGoalies);

      expect(result[0].score).toBeDefined();
      expect(result[1].score).toBeDefined();
      expect(result[0].scores).toBeDefined();
      expect(result[0].scores?.wins).toBeDefined();
      expect(result[1].scores?.wins).toBeDefined();

      const highScore = result[0].score as number;
      const halfScore = result[1].score as number;

      expect(highScore).toBeGreaterThan(halfScore);
      expect(highScore).toBeGreaterThanOrEqual(0);
      expect(highScore).toBeLessThanOrEqual(100);
      expect(halfScore).toBeGreaterThanOrEqual(0);
      expect(halfScore).toBeLessThanOrEqual(100);

      expect(highScore).toBe(100);

      expect(parseFloat(highScore.toFixed(2))).toBe(highScore);
      expect(parseFloat(halfScore.toFixed(2))).toBe(halfScore);
    });

    test("returns empty array unchanged when no goalies", () => {
      const result = applyGoalieScores([]);
      expect(result).toEqual([]);
    });

    test("sets scoreAdjustedByGames to 0 for goalies under minimum games", () => {
      const minGames = MIN_GAMES_FOR_ADJUSTED_SCORE;
      const belowMinGames = Math.max(minGames - 1, 0);

      const testGoalies: Goalie[] = [
        {
          name: "Few Games Goalie",
          games: belowMinGames,
          wins: 5,
          saves: 200,
          shutouts: 1,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Eligible Goalie",
          games: minGames,
          wins: 5,
          saves: 200,
          shutouts: 1,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const [fewGames, eligible] = applyGoalieScores(testGoalies);

      expect(fewGames.scoreAdjustedByGames).toBe(0);
      expect(eligible.scoreAdjustedByGames).toBeGreaterThan(0);
    });

    test("sets scoreAdjustedByGames to 0 when no goalies meet minimum games", () => {
      const minGames = MIN_GAMES_FOR_ADJUSTED_SCORE;
      const belowMinGamesA = Math.max(minGames - 1, 0);
      const belowMinGamesB = Math.max(minGames - 2, 0);

      const testGoalies: Goalie[] = [
        {
          name: "Under Min Goalie A",
          games: belowMinGamesA,
          wins: 2,
          saves: 50,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Under Min Goalie B",
          games: belowMinGamesB,
          wins: 3,
          saves: 60,
          shutouts: 1,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const result = applyGoalieScores(testGoalies);

      expect(result.every((g) => g.scoreAdjustedByGames === 0)).toBe(true);
    });

    test("uses 0 baseline for goalie always-positive stats", () => {
      const testGoalies: Goalie[] = [
        {
          name: "Top Goalie",
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Zero Wins",
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
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Lowest With Wins",
          games: 0,
          wins: 3,
          saves: 0,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const [top, zero, lowest] = applyGoalieScores(testGoalies);

      expect(zero.score).toBe(0);
      expect((lowest.score as number) > 0).toBe(true);
      expect((top.score as number) > (lowest.score as number)).toBe(true);
    });

    test("handles equal positive values for goalie always-positive stats", () => {
      const testGoalies: Goalie[] = [
        {
          name: "Goalie One",
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Goalie Two",
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
          scoreAdjustedByGames: 0,
        },
      ];

      const [one, two] = applyGoalieScores(testGoalies);

      expect(one.score).toBeDefined();
      expect(two.score).toBeDefined();
      expect(one.score).toBe(two.score);
      expect((one.score as number) > 0).toBe(true);
    });

    test("handles equal savePercent values using full contribution", () => {
      const testGoalies: Goalie[] = [
        {
          name: "Equal A",
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
          savePercent: "0.920",
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Equal B",
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
          savePercent: "0.920",
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const [a, b] = applyGoalieScores(testGoalies);

      expect(a.score).toBeDefined();
      expect(b.score).toBeDefined();
      expect(a.score).toBe(b.score);
      expect(a.score).toBe(100);
    });

    test("sets savePercent contribution to 0 when below baseline", () => {
      const testGoalies: Goalie[] = [
        {
          name: "Above Baseline",
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
          savePercent: "0.900",
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Below Baseline",
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
          savePercent: "0.840",
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const [above, below] = applyGoalieScores(testGoalies);

      expect(above.scores?.savePercent).toBeGreaterThan(0);
      expect(below.scores?.savePercent).toBe(0);
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
          scoreAdjustedByGames: 0,
        },
        {
          name: "Goalie Slightly Worse GAA",
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
          savePercent: "0.925",
          gaa: "2.4",
          score: 0,
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
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
          scoreAdjustedByGames: 0,
        },
      ];

      const [best, slightlyWorseGaa, worseAdvanced, invalidAdvanced, noAdvanced] =
        applyGoalieScores(testGoalies);

      expect(best.score).toBeDefined();
      expect(slightlyWorseGaa.score).toBeDefined();
      expect(worseAdvanced.score).toBeDefined();
      expect(invalidAdvanced.score).toBeDefined();
      expect(noAdvanced.score).toBeDefined();

      const bestScore = best.score as number;
      const slightlyWorseGaaScore = slightlyWorseGaa.score as number;
      const worseAdvancedScore = worseAdvanced.score as number;
      const invalidAdvancedScore = invalidAdvanced.score as number;
      const noAdvancedScore = noAdvanced.score as number;
      expect(bestScore).toBeGreaterThanOrEqual(0);
      expect(bestScore).toBeLessThanOrEqual(100);
      expect(slightlyWorseGaaScore).toBeGreaterThanOrEqual(0);
      expect(slightlyWorseGaaScore).toBeLessThanOrEqual(100);
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
          scoreAdjustedByGames: 0,
        },
      ];

      const [goalie] = applyGoalieScores(testGoalies);
      expect(goalie.score).toBe(0);
    });

    test("sets GAA score to 0 when GAA is 75% or more worse than best (ratio >= GOALIE_GAA_MAX_DIFF_RATIO)", () => {
      const testGoalies: Goalie[] = [
        {
          name: "Goalie Best GAA",
          games: 30,
          wins: 20,
          saves: 800,
          shutouts: 3,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          gaa: "2.0",
          savePercent: "0.920",
          score: 0,
          scoreAdjustedByGames: 0,
        },
        {
          name: "Goalie Extreme GAA",
          games: 30,
          wins: 10,
          saves: 600,
          shutouts: 1,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          gaa: "4.0", // 100% worse than 2.0 (diff=2.0, ratio=1.0 >= 0.75)
          savePercent: "0.880",
          score: 0,
          scoreAdjustedByGames: 0,
        },
      ];

      const [best, extreme] = applyGoalieScores(testGoalies);

      // Best GAA should score 100 for GAA component
      expect(best.scores?.gaa).toBe(100);
      // Extreme GAA (100% worse) exceeds 75% threshold, so GAA score should be 0
      expect(extreme.scores?.gaa).toBe(0);
    });
  });

  describe("resolveTeamId", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("defaults to DEFAULT_TEAM_ID for non-string values", () => {
      expect(resolveTeamId(123 as unknown)).toBe("1");
    });

    test("defaults to DEFAULT_TEAM_ID for empty string", () => {
      expect(resolveTeamId("   ")).toBe("1");
    });

    test("defaults to DEFAULT_TEAM_ID for unknown team", () => {
      expect(resolveTeamId("999")).toBe("1");
    });

    test("keeps configured team id when csv folder exists", () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      expect(resolveTeamId("2")).toBe("2");
    });

    test("defaults to DEFAULT_TEAM_ID for configured team missing csv folder", () => {
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        const err = new Error("missing") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      });

      expect(resolveTeamId("2")).toBe("1");
    });
  });

  describe("availableSeasons", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("returns seasons parsed from filenames for default team", () => {
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

    test("when reportType is both, returns union of regular and playoffs seasons", () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        "regular-2012-2013.csv",
        "regular-2013-2014.csv",
        "playoffs-2013-2014.csv",
        "playoffs-2014-2015.csv",
      ]);

      const result = availableSeasons("1", "both");
      expect(result).toEqual([2012, 2013, 2014]);
    });

    test("returns empty array when folder exists but has no matching files", () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      const result = availableSeasons();
      expect(result).toEqual([]);
    });

    test("ignores files with invalid season boundary", () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        "regular-2012-2014.csv",
        "regular-2013-2014.csv",
        "not-a-season.txt",
      ]);

      const result = availableSeasons();
      expect(result).toEqual([2013]);
    });

    test("skips files when parsed years are not finite", () => {
      (fs.readdirSync as jest.Mock).mockReturnValue(["regular-2012-2013.csv"]);

      const originalIsFinite = Number.isFinite;
      const isFiniteSpy = jest
        .spyOn(Number, "isFinite")
        .mockImplementation((value: unknown) => {
          if (value === 2012 || value === 2013) return false;
          return originalIsFinite(value as number);
        });

      const result = availableSeasons();
      expect(result).toEqual([]);

      isFiniteSpy.mockRestore();
    });

    test("rethrows non-ENOENT fs errors", () => {
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        const err = new Error("EACCES") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      });

      expect(() => availableSeasons()).toThrow("EACCES");
    });

    test("does not convert ENOENT to 422 for unconfigured teams", () => {
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      });

      try {
        listSeasonsForTeam("999", "regular");
        throw new Error("Expected listSeasonsForTeam to throw");
      } catch (error) {
        expect((error as { statusCode?: number }).statusCode).toBeUndefined();
      }
    });

    test("throws 422 when configured team folder is missing", () => {
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      });

      try {
        availableSeasons();
        throw new Error("Expected availableSeasons to throw");
      } catch (error) {
        expect((error as { statusCode?: number }).statusCode).toBe(422);
      }
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
      expect(seasonAvailable(undefined)).toBe(true);
    });
  });

  describe("reportTypeAvailable", () => {
    test("returns true for regular", () => {
      expect(reportTypeAvailable("regular")).toBe(true);
    });

    test("returns true for playoffs", () => {
      expect(reportTypeAvailable("playoffs")).toBe(true);
    });

    test("returns true for both", () => {
      expect(reportTypeAvailable("both")).toBe(true);
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

  describe("team CSV folder helpers", () => {
    beforeEach(() => {
      (fs.readdirSync as jest.Mock).mockReset();
    });

    test("resolveTeamId returns default when configured team folder is missing (ENOENT)", () => {
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        const err = Object.assign(new Error("not found"), { code: "ENOENT" });
        throw err;
      });

      expect(resolveTeamId("2")).toBe("1");
    });

    test("resolveTeamId rethrows unexpected fs errors", () => {
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        const err = Object.assign(new Error("no access"), { code: "EACCES" });
        throw err;
      });

      expect(() => resolveTeamId("2")).toThrow("no access");
    });

    test("listSeasonsForTeam throws ApiError when configured team folder is missing", () => {
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        const err = Object.assign(new Error("not found"), { code: "ENOENT" });
        throw err;
      });

      expect(() => listSeasonsForTeam("2", "regular")).toThrow(ApiError);

      try {
        listSeasonsForTeam("2", "regular");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
        expect((err as ApiError).message).toBe(ERROR_MESSAGES.TEAM_CSV_FOLDER_MISSING("2"));
      }
    });

    test("getTeamsWithCsvFolders filters to teams with existing csv folders", () => {
      const existingTeamId = "1";
      const csvSegment = `${path.sep}csv${path.sep}`;

      (fs.readdirSync as jest.Mock).mockImplementation((dir: unknown) => {
        if (typeof dir === "string" && dir.includes(csvSegment) && dir.endsWith(`${csvSegment}${existingTeamId}`)) {
          return [];
        }
        const err = Object.assign(new Error("not found"), { code: "ENOENT" });
        throw err;
      });

      const teams = getTeamsWithCsvFolders();
      expect(teams).toHaveLength(1);
      expect(teams[0]).toMatchObject({ id: "1", name: "colorado" });
    });
  });
});
