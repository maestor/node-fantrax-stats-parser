import {
  getGoalieCareerData,
  getPlayerCareerData,
} from "../features/career/service";
import {
  getGoalieCareerRowsFromDb,
  getPlayerCareerRowsFromDb,
} from "../db/queries";
import { TEAMS } from "../config";
import {
  createGoalieCareerRow,
  createPlayerCareerRow,
} from "./services.career.fixtures";

jest.mock("../db/queries");

describe("services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("career detail services", () => {
    describe("getPlayerCareerData", () => {
      const mockGetPlayerCareerRowsFromDb =
        getPlayerCareerRowsFromDb as jest.MockedFunction<
          typeof getPlayerCareerRowsFromDb
        >;

      test("builds a career response with owned and played counts", async () => {
        mockGetPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            games: 82,
            goals: 30,
            assists: 50,
            points: 80,
            plus_minus: 12,
            penalties: 18,
            shots: 240,
            ppp: 20,
            shp: 1,
            hits: 40,
            blocks: 30,
          }),
          createPlayerCareerRow({
            report_type: "playoffs",
          }),
          createPlayerCareerRow({
            team_id: "99",
            season: 2023,
          }),
          createPlayerCareerRow({
            season: 2022,
            report_type: "playoffs",
            games: 5,
            goals: 2,
            assists: 4,
            points: 6,
            plus_minus: 3,
            penalties: 2,
            shots: 15,
            ppp: 1,
            hits: 5,
            blocks: 4,
          }),
        ]);

        const result = await getPlayerCareerData("p001");

        expect(result).toMatchObject({
          id: "p001",
          name: "Career Skater",
          position: "F",
          summary: {
            firstSeason: 2022,
            lastSeason: 2024,
            seasonCount: { owned: 3, played: 2 },
            teamCount: { owned: 2, played: 1 },
            teams: [
              {
                teamId: "1",
                teamName: TEAMS[0].presentName,
                seasonCount: { owned: 2, played: 2 },
                firstSeason: 2022,
                lastSeason: 2024,
              },
              {
                teamId: "99",
                teamName: "99",
                seasonCount: { owned: 1, played: 0 },
                firstSeason: 2023,
                lastSeason: 2023,
              },
            ],
          },
          totals: {
            career: {
              seasonCount: { owned: 3, played: 2 },
              teamCount: { owned: 2, played: 1 },
              games: 87,
              goals: 32,
              assists: 54,
              points: 86,
              plusMinus: 15,
              penalties: 20,
              shots: 255,
              ppp: 21,
              shp: 1,
              hits: 45,
              blocks: 34,
            },
            regular: {
              seasonCount: { owned: 2, played: 1 },
              teamCount: { owned: 2, played: 1 },
              games: 82,
              goals: 30,
              assists: 50,
              points: 80,
            },
            playoffs: {
              seasonCount: { owned: 2, played: 1 },
              teamCount: { owned: 1, played: 1 },
              games: 5,
              goals: 2,
              assists: 4,
              points: 6,
            },
          },
        });
        expect(result.totals.career.teams).toEqual([
          expect.objectContaining({
            teamId: "1",
            teamName: TEAMS[0].presentName,
            seasonCount: { owned: 2, played: 2 },
            games: 87,
            points: 86,
          }),
          expect.objectContaining({
            teamId: "99",
            teamName: "99",
            seasonCount: { owned: 1, played: 0 },
            games: 0,
            points: 0,
          }),
        ]);
        expect(
          result.seasons.map((row) => `${row.season}-${row.teamId}-${row.reportType}`),
        ).toEqual([
          "2024-1-regular",
          "2024-1-playoffs",
          "2023-99-regular",
          "2022-1-playoffs",
        ]);
      });

      test("throws 404 metadata when player is not found", async () => {
        mockGetPlayerCareerRowsFromDb.mockResolvedValue([]);

        await expect(getPlayerCareerData("missing")).rejects.toMatchObject({
          statusCode: 404,
          body: "Player not found",
        });
      });

      test("sorts season and team aggregates consistently", async () => {
        mockGetPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "p002",
            name: "Skater One",
            position: "D",
            season: 2021,
            report_type: "playoffs",
            games: 1,
            goals: 1,
            points: 1,
            plus_minus: 1,
            shots: 2,
            hits: 1,
          }),
          createPlayerCareerRow({
            player_id: "p002",
            name: "Skater One",
            position: "D",
            team_id: "2",
            season: 2021,
            games: 1,
            assists: 1,
            points: 1,
            shots: 1,
            blocks: 1,
          }),
          createPlayerCareerRow({
            player_id: "p002",
            name: "Skater One",
            position: "D",
            season: 2021,
            games: 1,
            goals: 1,
            assists: 1,
            points: 2,
            plus_minus: 1,
            shots: 3,
            ppp: 1,
            hits: 1,
            blocks: 1,
          }),
          createPlayerCareerRow({
            player_id: "p002",
            name: "Skater One",
            position: "D",
            season: 2021,
          }),
        ]);

        const result = await getPlayerCareerData("p002");

        expect(result.position).toBe("D");
        expect(result.seasons.map((row) => `${row.teamId}-${row.reportType}`)).toEqual([
          "1-regular",
          "1-regular",
          "1-playoffs",
          "2-regular",
        ]);
        expect(result.summary.teams.map((team) => team.teamId)).toEqual([
          "2",
          "1",
        ]);
        expect(result.totals.career.teams.map((team) => team.teamId)).toEqual([
          "2",
          "1",
        ]);
      });

      test("throws when player career rows are missing position", async () => {
        mockGetPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "p002",
            name: "Broken Skater",
            position: null,
            season: 2021,
            games: 1,
            goals: 1,
            assists: 1,
            points: 2,
            plus_minus: 1,
            shots: 3,
            ppp: 1,
            hits: 1,
            blocks: 1,
          }),
        ]);

        await expect(getPlayerCareerData("p002")).rejects.toThrow(
          "Player position missing",
        );
      });

      test("uses later sort tie-breakers for summary and totals team ordering", async () => {
        mockGetPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "p003",
            name: "Sorting Skater",
            team_id: "3",
            season: 2022,
            assists: 1,
            points: 1,
            shots: 1,
          }),
          createPlayerCareerRow({
            player_id: "p003",
            name: "Sorting Skater",
            team_id: "3",
            season: 2021,
            games: 1,
            goals: 1,
            points: 1,
            shots: 1,
          }),
          createPlayerCareerRow({
            player_id: "p003",
            name: "Sorting Skater",
            team_id: "2",
            season: 2024,
            report_type: "playoffs",
          }),
          createPlayerCareerRow({
            player_id: "p003",
            name: "Sorting Skater",
            team_id: "2",
            season: 2020,
            games: 1,
            assists: 1,
            points: 1,
            shots: 1,
          }),
          createPlayerCareerRow({
            player_id: "p003",
            name: "Sorting Skater",
            team_id: "1",
            season: 2020,
            games: 1,
            goals: 1,
            assists: 1,
            points: 2,
            shots: 1,
          }),
        ]);

        const result = await getPlayerCareerData("p003");

        expect(result.summary.teams.map((team) => team.teamId)).toEqual([
          "1",
          "2",
          "3",
        ]);
        expect(result.totals.career.teams.map((team) => team.teamId)).toEqual([
          "3",
          "2",
          "1",
        ]);
      });
    });

    describe("getGoalieCareerData", () => {
      const mockGetGoalieCareerRowsFromDb =
        getGoalieCareerRowsFromDb as jest.MockedFunction<
          typeof getGoalieCareerRowsFromDb
        >;

      test("builds a goalie career response without aggregated rate stats", async () => {
        mockGetGoalieCareerRowsFromDb.mockResolvedValue([
          createGoalieCareerRow({
            games: 50,
            wins: 30,
            saves: 1400,
            shutouts: 4,
            assists: 3,
            points: 3,
            penalties: 2,
            gaa: 2.25,
            save_percent: 0.918,
          }),
          createGoalieCareerRow({
            team_id: "77",
            season: 2023,
            report_type: "playoffs",
          }),
          createGoalieCareerRow({
            season: 2022,
            report_type: "playoffs",
            games: 8,
            wins: 5,
            saves: 210,
            shutouts: 1,
            assists: 1,
            points: 1,
            gaa: 2.1,
            save_percent: 0.9,
          }),
        ]);

        const result = await getGoalieCareerData("g001");

        expect(result).toMatchObject({
          id: "g001",
          name: "Career Goalie",
          summary: {
            firstSeason: 2022,
            lastSeason: 2024,
            seasonCount: { owned: 3, played: 2 },
            teamCount: { owned: 2, played: 1 },
          },
          totals: {
            career: {
              seasonCount: { owned: 3, played: 2 },
              teamCount: { owned: 2, played: 1 },
              games: 58,
              wins: 35,
              saves: 1610,
              shutouts: 5,
              goals: 0,
              assists: 4,
              points: 4,
              penalties: 2,
              ppp: 0,
              shp: 0,
            },
            regular: {
              seasonCount: { owned: 1, played: 1 },
              teamCount: { owned: 1, played: 1 },
              games: 50,
              wins: 30,
            },
            playoffs: {
              seasonCount: { owned: 2, played: 1 },
              teamCount: { owned: 2, played: 1 },
              games: 8,
              wins: 5,
            },
          },
        });
        expect(result.totals.career).not.toHaveProperty("gaa");
        expect(result.totals.career.teams[0]).not.toHaveProperty("gaa");
        expect(result.seasons).toEqual([
          expect.objectContaining({
            season: 2024,
            teamId: "2",
            reportType: "regular",
            teamName: TEAMS[1].presentName,
            gaa: "2.25",
            savePercent: "0.918",
          }),
          expect.objectContaining({
            season: 2023,
            teamId: "77",
            reportType: "playoffs",
            teamName: "77",
            gaa: undefined,
            savePercent: undefined,
          }),
          expect.objectContaining({
            season: 2022,
            teamId: "2",
            reportType: "playoffs",
            teamName: TEAMS[1].presentName,
            gaa: "2.10",
            savePercent: "0.900",
          }),
        ]);
      });

      test("preserves persisted zero goalie rate values for played career seasons", async () => {
        mockGetGoalieCareerRowsFromDb.mockResolvedValue([
          createGoalieCareerRow({
            goalie_id: "g002",
            name: "Zero Placeholder Goalie",
            games: 1,
            saves: 20,
            gaa: 0,
            save_percent: 0,
          }),
        ]);

        const result = await getGoalieCareerData("g002");

        expect(result.seasons[0].gaa).toBe("0.00");
        expect(result.seasons[0].savePercent).toBe("0.000");
      });

      test("keeps zero goalie rate placeholders undefined for non-played career seasons", async () => {
        mockGetGoalieCareerRowsFromDb.mockResolvedValue([
          createGoalieCareerRow({
            goalie_id: "g003",
            name: "Bench Goalie",
            games: 0,
            saves: 0,
            gaa: 0,
            save_percent: 0,
          }),
        ]);

        const result = await getGoalieCareerData("g003");

        expect(result.seasons[0].gaa).toBeUndefined();
        expect(result.seasons[0].savePercent).toBeUndefined();
      });

      test("throws 404 metadata when goalie is not found", async () => {
        mockGetGoalieCareerRowsFromDb.mockResolvedValue([]);

        await expect(getGoalieCareerData("missing")).rejects.toMatchObject({
          statusCode: 404,
          body: "Goalie not found",
        });
      });
    });
  });
});
