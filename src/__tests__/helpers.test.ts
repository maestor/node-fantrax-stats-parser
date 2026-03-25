import { CURRENT_SEASON, TEAMS } from "../config/index.js";
import {
  availableSeasons,
  parseSeasonParam,
  reportTypeAvailable,
  seasonAvailable,
} from "../shared/seasons.js";
import { getTeamsWithData, resolveTeamId } from "../shared/teams.js";
import { sortItemsByStatField } from "../features/stats/scoring.js";
import { createGoalie, createPlayer } from "./fixtures.js";
import type { Goalie, Player, Report } from "../shared/types/index.js";

describe("helpers utilities", () => {
  describe("sortItemsByStatField", () => {
    test("sorts players by score, then points, then goals", () => {
      const players = [
        createPlayer({ name: "Player A", score: 80, points: 80, goals: 25 }),
        createPlayer({ name: "Player B", score: 80, points: 80, goals: 35 }),
        createPlayer({ name: "Player C", score: 100, points: 70, goals: 40 }),
      ];

      const result = sortItemsByStatField(players, "players") as Player[];

      expect(result.map((player) => player.name)).toEqual([
        "Player C",
        "Player B",
        "Player A",
      ]);
    });

    test("sorts goalies by score, then wins, then games", () => {
      const goalies = [
        createGoalie({ name: "Goalie A", score: 80, wins: 40, games: 60 }),
        createGoalie({ name: "Goalie B", score: 80, wins: 40, games: 70 }),
        createGoalie({ name: "Goalie C", score: 100, wins: 35, games: 65 }),
      ];

      const result = sortItemsByStatField(goalies, "goalies") as Goalie[];

      expect(result.map((goalie) => goalie.name)).toEqual([
        "Goalie C",
        "Goalie B",
        "Goalie A",
      ]);
    });

    test("returns data unchanged for unknown kinds", () => {
      const players = [
        createPlayer({ name: "Player A" }),
        createPlayer({ name: "Player B" }),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = sortItemsByStatField(players, "unknown" as any);

      expect(result).toEqual(players);
    });
  });

  describe("resolveTeamId", () => {
    test("normalizes invalid values to the default team", () => {
      expect(resolveTeamId(123 as unknown)).toBe("1");
      expect(resolveTeamId("   ")).toBe("1");
      expect(resolveTeamId("999")).toBe("1");
    });

    test("keeps configured team ids and trims whitespace", () => {
      expect(resolveTeamId("2")).toBe("2");
      expect(resolveTeamId(" 28 ")).toBe("28");
    });
  });

  describe("season defaults", () => {
    test("uses the default team and report when availableSeasons is called without args", async () => {
      const seasons = await availableSeasons();

      expect(seasons[0]).toBe(2012);
      expect(seasons.at(-1)).toBe(CURRENT_SEASON);
    });

    test("uses the default team and report when seasonAvailable is called without optional args", async () => {
      await expect(seasonAvailable(undefined)).resolves.toBe(true);
      await expect(seasonAvailable(2012)).resolves.toBe(true);
      await expect(seasonAvailable(2000)).resolves.toBe(false);
    });
  });

  describe("reportTypeAvailable", () => {
    test("accepts supported report types and rejects invalid ones", () => {
      expect(reportTypeAvailable("regular")).toBe(true);
      expect(reportTypeAvailable("playoffs")).toBe(true);
      expect(reportTypeAvailable("both")).toBe(true);
      expect(reportTypeAvailable("invalid" as Report)).toBe(false);
      expect(reportTypeAvailable(undefined)).toBe(false);
    });
  });

  describe("parseSeasonParam", () => {
    test("parses numeric values and rejects missing or invalid ones", () => {
      expect(parseSeasonParam("2024")).toBe(2024);
      expect(parseSeasonParam("2012")).toBe(2012);
      expect(parseSeasonParam(2024)).toBe(2024);
      expect(parseSeasonParam(undefined)).toBe(undefined);
      expect(parseSeasonParam("")).toBe(undefined);
      expect(parseSeasonParam(null)).toBe(undefined);
      expect(parseSeasonParam("abc")).toBe(undefined);
      expect(parseSeasonParam(NaN)).toBe(undefined);
    });
  });

  describe("getTeamsWithData", () => {
    test("returns a copy of every configured team including expansions", () => {
      const teams = getTeamsWithData();

      expect(teams).toEqual(TEAMS);
      expect(teams).not.toBe(TEAMS);
      expect(teams).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "28", name: "seattle" }),
          expect.objectContaining({ id: "32", name: "vegas" }),
        ]),
      );
    });
  });
});
