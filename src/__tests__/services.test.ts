import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getGoaliesStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsCombined,
  getPlayerCareerData,
  getGoalieCareerData,
  getCareerPlayersData,
  getCareerGoaliesData,
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
} from "../services";
import {
  availableSeasons,
  sortItemsByStatField,
  applyPlayerScores,
  applyPlayerScoresByPosition,
  applyGoalieScores,
} from "../helpers";
import {
  mapAvailableSeasons,
  mapCombinedPlayerDataFromPlayersWithSeason,
  mapCombinedGoalieDataFromGoaliesWithSeason,
} from "../mappings";
import {
  getPlayersFromDb,
  getGoaliesFromDb,
  getPlayerCareerRowsFromDb,
  getGoalieCareerRowsFromDb,
  getAllPlayerCareerRowsFromDb,
  getAllGoalieCareerRowsFromDb,
  getPlayoffLeaderboard,
  getPlayoffSeasons,
  getRegularLeaderboard,
  getRegularSeasons,
} from "../db/queries";
import { mockPlayer, mockGoalie, mockPlayerWithSeason, mockGoalieWithSeason } from "./fixtures";
import { TEAMS } from "../constants";

jest.mock("../helpers");
jest.mock("../mappings");
jest.mock("../db/queries");

describe("services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAvailableSeasons", () => {
    test("uses default team and report when optional params are omitted", async () => {
      const mockSeasons = [
        { season: 2012, text: "2012-2013" },
        { season: 2013, text: "2013-2014" },
      ];
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons();

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapAvailableSeasons).toHaveBeenCalledWith([2012, 2013]);
      expect(result).toEqual(mockSeasons);
    });
  });

  describe("getPlayersStatsSeason", () => {
    beforeEach(() => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
      (getPlayersFromDb as jest.Mock).mockResolvedValue([mockPlayerWithSeason]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (applyPlayerScoresByPosition as jest.Mock).mockImplementation(() => {});
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("uses max season when season is undefined", async () => {
      await getPlayersStatsSeason("regular", undefined);

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
    });

    test("returns empty array when season is undefined and no seasons are available", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsSeason("regular", undefined);

      expect(result).toEqual([]);
      expect(getPlayersFromDb).not.toHaveBeenCalled();
    });

    test("when reportType is both, queries regular+playoffs and merges before scoring", async () => {
      const regular = { ...mockPlayerWithSeason, games: 12, points: 6 };
      const playoffs = { ...mockPlayerWithSeason, games: 4, points: 3 };

      (getPlayersFromDb as jest.Mock)
        .mockResolvedValueOnce([regular]) // regular
        .mockResolvedValueOnce([playoffs]); // playoffs

      await getPlayersStatsSeason("both", 2024);

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "playoffs");

      expect(applyPlayerScores).toHaveBeenCalledWith([
        expect.objectContaining({ name: "Test Player", season: 2024, games: 16, points: 9 }),
      ]);
    });
  });

  describe("getGoaliesStatsSeason", () => {
    beforeEach(() => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
      (getGoaliesFromDb as jest.Mock).mockResolvedValue([mockGoalieWithSeason]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("uses max season when season is undefined", async () => {
      await getGoaliesStatsSeason("regular", undefined);

      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2024, "regular");
    });

    test("when reportType is both, strips gaa/savePercent for merged goalies", async () => {
      const regular = { ...mockGoalieWithSeason, games: 10, wins: 6, gaa: "2.30", savePercent: "0.920" };
      const playoffs = { ...mockGoalieWithSeason, games: 2, wins: 1, gaa: "1.00", savePercent: "0.950" };

      (getGoaliesFromDb as jest.Mock)
        .mockResolvedValueOnce([regular]) // regular
        .mockResolvedValueOnce([playoffs]); // playoffs

      await getGoaliesStatsSeason("both", 2024);

      expect(applyGoalieScores).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Test Goalie",
          season: 2024,
          games: 12,
          wins: 7,
          gaa: undefined,
          savePercent: undefined,
        }),
      ]);
    });
  });

  describe("getPlayersStatsCombined", () => {
    beforeEach(() => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (getPlayersFromDb as jest.Mock).mockResolvedValue([mockPlayerWithSeason]);
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([mockPlayer]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (applyPlayerScoresByPosition as jest.Mock).mockImplementation(() => {});
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("returns empty array when no seasons are available", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([]);
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsCombined("regular");

      expect(result).toEqual([]);
      expect(getPlayersFromDb).not.toHaveBeenCalled();
    });

    test("filters seasons when startFrom is provided", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014, 2020]);

      const result = await getPlayersStatsCombined("regular", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getPlayersFromDb).toHaveBeenCalledTimes(1);
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2020, "regular");
      expect(result).toEqual([mockPlayer]);
    });

    test("returns empty array when startFrom is after all available seasons", async () => {
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([]);

      const result = await getPlayersStatsCombined("regular", "1", 2025);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(result).toEqual([]);
    });

    test("when reportType is both, queries regular+playoffs and merges before combining", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2024]);

      const regular = { ...mockPlayerWithSeason, games: 12, points: 6 };
      const playoffs = { ...mockPlayerWithSeason, games: 4, points: 3 };

      (getPlayersFromDb as jest.Mock)
        .mockResolvedValueOnce([regular]) // regular
        .mockResolvedValueOnce([playoffs]); // playoffs
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([mockPlayer]);

      const result = await getPlayersStatsCombined("both", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "both");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "playoffs");

      expect(mapCombinedPlayerDataFromPlayersWithSeason).toHaveBeenCalledWith([
        expect.objectContaining({ name: "Test Player", season: 2024, games: 16, points: 9 }),
      ]);
      expect(result).toEqual([mockPlayer]);
    });

    test("when reportType is both and startFrom is undefined, uses all seasons", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2024]);
      (getPlayersFromDb as jest.Mock)
        .mockResolvedValueOnce([mockPlayerWithSeason]) // regular
        .mockResolvedValueOnce([mockPlayerWithSeason]); // playoffs
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([mockPlayer]);

      const result = await getPlayersStatsCombined("both", "1", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "both");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(result).toEqual([mockPlayer]);
    });

  });

  describe("getGoaliesStatsCombined", () => {
    beforeEach(() => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (getGoaliesFromDb as jest.Mock).mockResolvedValue([mockGoalieWithSeason]);
      (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue([mockGoalie]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("uses the default team and full season list when startFrom is omitted", async () => {
      const result = await getGoaliesStatsCombined("regular");

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledTimes(3);
      expect(result).toEqual([mockGoalie]);
    });

    test("filters seasons when startFrom is provided", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014, 2020]);

      const result = await getGoaliesStatsCombined("regular", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledTimes(1);
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2020, "regular");
      expect(result).toEqual([mockGoalie]);
    });

    test("returns empty array when startFrom is after all available seasons", async () => {
      (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue([]);

      const result = await getGoaliesStatsCombined("regular", "1", 2025);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(result).toEqual([]);
    });

    test("when reportType is both, queries regular+playoffs and strips gaa/savePercent", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2024]);

      const regular = { ...mockGoalieWithSeason, games: 10, wins: 6, gaa: "2.30", savePercent: "0.920" };
      const playoffs = { ...mockGoalieWithSeason, games: 2, wins: 1, gaa: "1.00", savePercent: "0.950" };

      (getGoaliesFromDb as jest.Mock)
        .mockResolvedValueOnce([regular]) // regular
        .mockResolvedValueOnce([playoffs]); // playoffs
      (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue([mockGoalie]);

      const result = await getGoaliesStatsCombined("both", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "both");
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2024, "playoffs");

      expect(mapCombinedGoalieDataFromGoaliesWithSeason).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Test Goalie",
          season: 2024,
          games: 12,
          wins: 7,
          gaa: undefined,
          savePercent: undefined,
        }),
      ]);
      expect(result).toEqual([mockGoalie]);
    });

    test("when reportType is both and startFrom is undefined, uses all seasons", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2024]);
      (getGoaliesFromDb as jest.Mock)
        .mockResolvedValueOnce([mockGoalieWithSeason]) // regular
        .mockResolvedValueOnce([mockGoalieWithSeason]); // playoffs
      (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue([mockGoalie]);

      const result = await getGoaliesStatsCombined("both", "1", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "both");
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(result).toEqual([mockGoalie]);
    });

  });

  describe("getPlayerCareerData", () => {
    test("builds a career response with owned and played counts", async () => {
      (getPlayerCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          player_id: "p001",
          name: "Career Skater",
          position: "F",
          team_id: "1",
          season: 2024,
          report_type: "regular",
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
        },
        {
          player_id: "p001",
          name: "Career Skater",
          position: "F",
          team_id: "1",
          season: 2024,
          report_type: "playoffs",
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
        {
          player_id: "p001",
          name: "Career Skater",
          position: "F",
          team_id: "99",
          season: 2023,
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
        {
          player_id: "p001",
          name: "Career Skater",
          position: "F",
          team_id: "1",
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
          shp: 0,
          hits: 5,
          blocks: 4,
        },
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
      expect(result.seasons.map((row) => `${row.season}-${row.teamId}-${row.reportType}`)).toEqual([
        "2024-1-regular",
        "2024-1-playoffs",
        "2023-99-regular",
        "2022-1-playoffs",
      ]);
    });

    test("throws 404 metadata when player is not found", async () => {
      (getPlayerCareerRowsFromDb as jest.Mock).mockResolvedValue([]);

      await expect(getPlayerCareerData("missing")).rejects.toMatchObject({
        statusCode: 404,
        body: "Player not found",
      });
    });

    test("sorts season and team aggregates consistently", async () => {
      (getPlayerCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          player_id: "p002",
          name: "Skater One",
          position: "D",
          team_id: "1",
          season: 2021,
          report_type: "playoffs",
          games: 1,
          goals: 1,
          assists: 0,
          points: 1,
          plus_minus: 1,
          penalties: 0,
          shots: 2,
          ppp: 0,
          shp: 0,
          hits: 1,
          blocks: 0,
        },
        {
          player_id: "p002",
          name: "Skater One",
          position: "D",
          team_id: "2",
          season: 2021,
          report_type: "regular",
          games: 1,
          goals: 0,
          assists: 1,
          points: 1,
          plus_minus: 0,
          penalties: 0,
          shots: 1,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 1,
        },
        {
          player_id: "p002",
          name: "Skater One",
          position: "D",
          team_id: "1",
          season: 2021,
          report_type: "regular",
          games: 1,
          goals: 1,
          assists: 1,
          points: 2,
          plus_minus: 1,
          penalties: 0,
          shots: 3,
          ppp: 1,
          shp: 0,
          hits: 1,
          blocks: 1,
        },
        {
          player_id: "p002",
          name: "Skater One",
          position: "D",
          team_id: "1",
          season: 2021,
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

      const result = await getPlayerCareerData("p002");

      expect(result.position).toBe("D");
      expect(result.seasons.map((row) => `${row.teamId}-${row.reportType}`)).toEqual([
        "1-regular",
        "1-regular",
        "1-playoffs",
        "2-regular",
      ]);
      expect(result.summary.teams.map((team) => team.teamId)).toEqual(["2", "1"]);
      expect(result.totals.career.teams.map((team) => team.teamId)).toEqual(["2", "1"]);
    });

    test("throws when player career rows are missing position", async () => {
      (getPlayerCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          player_id: "p002",
          name: "Broken Skater",
          position: null,
          team_id: "1",
          season: 2021,
          report_type: "regular",
          games: 1,
          goals: 1,
          assists: 1,
          points: 2,
          plus_minus: 1,
          penalties: 0,
          shots: 3,
          ppp: 1,
          shp: 0,
          hits: 1,
          blocks: 1,
        },
      ]);

      await expect(getPlayerCareerData("p002")).rejects.toThrow("Player position missing");
    });

    test("uses later sort tie-breakers for summary and totals team ordering", async () => {
      (getPlayerCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          player_id: "p003",
          name: "Sorting Skater",
          position: "F",
          team_id: "3",
          season: 2022,
          report_type: "regular",
          games: 1,
          goals: 0,
          assists: 1,
          points: 1,
          plus_minus: 0,
          penalties: 0,
          shots: 1,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
        },
        {
          player_id: "p003",
          name: "Sorting Skater",
          position: "F",
          team_id: "3",
          season: 2021,
          report_type: "regular",
          games: 1,
          goals: 1,
          assists: 0,
          points: 1,
          plus_minus: 0,
          penalties: 0,
          shots: 1,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
        },
        {
          player_id: "p003",
          name: "Sorting Skater",
          position: "F",
          team_id: "2",
          season: 2024,
          report_type: "playoffs",
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
        {
          player_id: "p003",
          name: "Sorting Skater",
          position: "F",
          team_id: "2",
          season: 2020,
          report_type: "regular",
          games: 1,
          goals: 0,
          assists: 1,
          points: 1,
          plus_minus: 0,
          penalties: 0,
          shots: 1,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
        },
        {
          player_id: "p003",
          name: "Sorting Skater",
          position: "F",
          team_id: "1",
          season: 2020,
          report_type: "regular",
          games: 1,
          goals: 1,
          assists: 1,
          points: 2,
          plus_minus: 0,
          penalties: 0,
          shots: 1,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
        },
      ]);

      const result = await getPlayerCareerData("p003");

      expect(result.summary.teams.map((team) => team.teamId)).toEqual(["1", "2", "3"]);
      expect(result.totals.career.teams.map((team) => team.teamId)).toEqual(["3", "2", "1"]);
    });
  });

  describe("getGoalieCareerData", () => {
    test("builds a goalie career response without aggregated rate stats", async () => {
      (getGoalieCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          goalie_id: "g001",
          name: "Career Goalie",
          team_id: "2",
          season: 2024,
          report_type: "regular",
          games: 50,
          wins: 30,
          saves: 1400,
          shutouts: 4,
          goals: 0,
          assists: 3,
          points: 3,
          penalties: 2,
          ppp: 0,
          shp: 0,
          gaa: 2.25,
          save_percent: 0.918,
        },
        {
          goalie_id: "g001",
          name: "Career Goalie",
          team_id: "77",
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
        {
          goalie_id: "g001",
          name: "Career Goalie",
          team_id: "2",
          season: 2022,
          report_type: "playoffs",
          games: 8,
          wins: 5,
          saves: 210,
          shutouts: 1,
          goals: 0,
          assists: 1,
          points: 1,
          penalties: 0,
          ppp: 0,
          shp: 0,
          gaa: 2.1,
          save_percent: 0.926,
        },
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
          gaa: "2.1",
          savePercent: "0.926",
        }),
      ]);
    });

    test("maps persisted zero goalie rate placeholders to undefined in career seasons", async () => {
      (getGoalieCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          goalie_id: "g002",
          name: "Zero Placeholder Goalie",
          team_id: "2",
          season: 2024,
          report_type: "regular",
          games: 1,
          wins: 0,
          saves: 20,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          gaa: 0,
          save_percent: 0,
        },
      ]);

      const result = await getGoalieCareerData("g002");

      expect(result.seasons[0].gaa).toBeUndefined();
      expect(result.seasons[0].savePercent).toBeUndefined();
    });

    test("throws 404 metadata when goalie is not found", async () => {
      (getGoalieCareerRowsFromDb as jest.Mock).mockResolvedValue([]);

      await expect(getGoalieCareerData("missing")).rejects.toMatchObject({
        statusCode: 404,
        body: "Goalie not found",
      });
    });
  });

  describe("getCareerPlayersData", () => {
    test("builds player career list items with owned and played counts", async () => {
      (getAllPlayerCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          player_id: "p002",
          name: "Alpha Skater",
          position: "D",
          team_id: "2",
          season: 2024,
          report_type: "regular",
          games: 1,
          goals: 0,
          assists: 1,
          points: 1,
          plus_minus: 0,
          penalties: 0,
          shots: 1,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
        },
        {
          player_id: "p001",
          name: "Beta Skater",
          position: "F",
          team_id: "1",
          season: 2024,
          report_type: "regular",
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
        },
        {
          player_id: "p001",
          name: "Beta Skater",
          position: "F",
          team_id: "1",
          season: 2024,
          report_type: "playoffs",
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
        {
          player_id: "p001",
          name: "Beta Skater",
          position: "F",
          team_id: "99",
          season: 2023,
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
        {
          player_id: "p001",
          name: "Beta Skater",
          position: "F",
          team_id: "1",
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
          shp: 0,
          hits: 5,
          blocks: 4,
        },
      ]);

      const result = await getCareerPlayersData();

      expect(result).toEqual([
        {
          id: "p002",
          name: "Alpha Skater",
          position: "D",
          firstSeason: 2024,
          lastSeason: 2024,
          seasonsOwned: 1,
          seasonsPlayedRegular: 1,
          seasonsPlayedPlayoffs: 0,
          teamsOwned: 1,
          teamsPlayedRegular: 1,
          teamsPlayedPlayoffs: 0,
          regularGames: 1,
          playoffGames: 0,
        },
        {
          id: "p001",
          name: "Beta Skater",
          position: "F",
          firstSeason: 2022,
          lastSeason: 2024,
          seasonsOwned: 3,
          seasonsPlayedRegular: 1,
          seasonsPlayedPlayoffs: 1,
          teamsOwned: 2,
          teamsPlayedRegular: 1,
          teamsPlayedPlayoffs: 1,
          regularGames: 82,
          playoffGames: 5,
        },
      ]);
    });

    test("throws when a player list row is missing position", async () => {
      (getAllPlayerCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          player_id: "p002",
          name: "Broken Skater",
          position: null,
          team_id: "2",
          season: 2024,
          report_type: "regular",
          games: 1,
          goals: 0,
          assists: 1,
          points: 1,
          plus_minus: 0,
          penalties: 0,
          shots: 1,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
        },
      ]);

      await expect(getCareerPlayersData()).rejects.toThrow("Player position missing");
    });

    test("sorts player list ties by id when names match", async () => {
      (getAllPlayerCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          player_id: "p002",
          name: "Same Name",
          position: "F",
          team_id: "1",
          season: 2024,
          report_type: "regular",
          games: 1,
          goals: 0,
          assists: 1,
          points: 1,
          plus_minus: 0,
          penalties: 0,
          shots: 1,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
        },
        {
          player_id: "p001",
          name: "Same Name",
          position: "D",
          team_id: "2",
          season: 2024,
          report_type: "regular",
          games: 1,
          goals: 0,
          assists: 1,
          points: 1,
          plus_minus: 0,
          penalties: 0,
          shots: 1,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
        },
      ]);

      const result = await getCareerPlayersData();

      expect(result.map((item) => item.id)).toEqual(["p001", "p002"]);
    });
  });

  describe("getCareerGoaliesData", () => {
    test("builds goalie career list items with owned and played counts", async () => {
      (getAllGoalieCareerRowsFromDb as jest.Mock).mockResolvedValue([
        {
          goalie_id: "g002",
          name: "Alpha Goalie",
          team_id: "2",
          season: 2024,
          report_type: "regular",
          games: 10,
          wins: 6,
          saves: 250,
          shutouts: 1,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          gaa: 2.3,
          save_percent: 0.92,
        },
        {
          goalie_id: "g001",
          name: "Beta Goalie",
          team_id: "2",
          season: 2024,
          report_type: "regular",
          games: 50,
          wins: 30,
          saves: 1400,
          shutouts: 4,
          goals: 0,
          assists: 3,
          points: 3,
          penalties: 2,
          ppp: 0,
          shp: 0,
          gaa: 2.25,
          save_percent: 0.918,
        },
        {
          goalie_id: "g001",
          name: "Beta Goalie",
          team_id: "77",
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
        {
          goalie_id: "g001",
          name: "Beta Goalie",
          team_id: "2",
          season: 2022,
          report_type: "playoffs",
          games: 8,
          wins: 5,
          saves: 210,
          shutouts: 1,
          goals: 0,
          assists: 1,
          points: 1,
          penalties: 0,
          ppp: 0,
          shp: 0,
          gaa: 2.1,
          save_percent: 0.926,
        },
      ]);

      const result = await getCareerGoaliesData();

      expect(result).toEqual([
        {
          id: "g002",
          name: "Alpha Goalie",
          firstSeason: 2024,
          lastSeason: 2024,
          seasonsOwned: 1,
          seasonsPlayedRegular: 1,
          seasonsPlayedPlayoffs: 0,
          teamsOwned: 1,
          teamsPlayedRegular: 1,
          teamsPlayedPlayoffs: 0,
          regularGames: 10,
          playoffGames: 0,
        },
        {
          id: "g001",
          name: "Beta Goalie",
          firstSeason: 2022,
          lastSeason: 2024,
          seasonsOwned: 3,
          seasonsPlayedRegular: 1,
          seasonsPlayedPlayoffs: 1,
          teamsOwned: 2,
          teamsPlayedRegular: 1,
          teamsPlayedPlayoffs: 1,
          regularGames: 50,
          playoffGames: 8,
        },
      ]);
    });
  });

  describe("getPlayoffLeaderboardData", () => {
    const mockGetPlayoffLeaderboard = getPlayoffLeaderboard as jest.MockedFunction<
      typeof getPlayoffLeaderboard
    >;
    const mockGetPlayoffSeasons = getPlayoffSeasons as jest.MockedFunction<
      typeof getPlayoffSeasons
    >;

    beforeEach(() => {
      mockGetPlayoffSeasons.mockResolvedValue([]);
    });

    test("resolves teamName from TEAMS and sets tieRank false for non-tied entries", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 3, finals: 2, conferenceFinals: 2, secondRound: 4, firstRound: 2 },
        { teamId: "4", championships: 3, finals: 0, conferenceFinals: 4, secondRound: 2, firstRound: 4 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result[0]).toMatchObject({
        teamId: "1",
        teamName: "Colorado Avalanche",
        appearances: 13,
        seasons: expect.any(Array),
        tieRank: false,
      });
      expect(result[1]).toMatchObject({
        teamId: "4",
        teamName: "Vancouver Canucks",
        appearances: 13,
        tieRank: false,
      });
    });

    test("sets tieRank true when 5-tuple matches previous entry", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 1, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 3 },
        { teamId: "15", championships: 1, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 3 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result[0].appearances).toBe(4);
      expect(result[1].appearances).toBe(4);
      expect(result[0].tieRank).toBe(false);
      expect(result[1].tieRank).toBe(true);
    });

    test("first entry is always tieRank false", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 5, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 0 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result[0].appearances).toBe(5);
      expect(result[0].tieRank).toBe(false);
    });

    test("returns all TEAMS with zero values when no data", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([]);
      const result = await getPlayoffLeaderboardData();
      expect(result).toHaveLength(TEAMS.length);
      for (const entry of result) {
        expect(entry.appearances).toBe(0);
        expect(entry.championships).toBe(0);
        expect(entry.finals).toBe(0);
        expect(entry.conferenceFinals).toBe(0);
        expect(entry.secondRound).toBe(0);
        expect(entry.firstRound).toBe(0);
      }
    });

    test("teams absent from DB rows appear at end with all zeros", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 2, finals: 1, conferenceFinals: 1, secondRound: 2, firstRound: 3 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result).toHaveLength(TEAMS.length);
      const missing = result.filter((r) => r.teamId !== "1");
      for (const entry of missing) {
        expect(entry.appearances).toBe(0);
        expect(entry.championships).toBe(0);
        expect(entry.finals).toBe(0);
        expect(entry.conferenceFinals).toBe(0);
        expect(entry.secondRound).toBe(0);
        expect(entry.firstRound).toBe(0);
      }
    });

    test("uses teamId as teamName when team not found in TEAMS", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "999", championships: 1, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 0 },
      ]);

      const result = await getPlayoffLeaderboardData();
      expect(result[0].teamName).toBe("999");
    });

    test("adds season breakdown with notQualified defaults within latest playoff season", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 1, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 0 },
      ]);
      mockGetPlayoffSeasons.mockResolvedValue([
        { teamId: "1", season: 2012, round: 1 },
        { teamId: "1", season: 2013, round: 5 },
      ]);

      const result = await getPlayoffLeaderboardData();
      const colorado = result.find((entry) => entry.teamId === "1");

      expect(colorado).toBeDefined();
      expect(colorado?.seasons[0]).toEqual({ season: 2012, round: 1, key: "firstRound" });
      expect(colorado?.seasons[1]).toEqual({ season: 2013, round: 5, key: "championship" });
      expect(colorado?.seasons).toHaveLength(2);
    });

    test("uses team firstSeason for playoff season breakdown", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "32", championships: 0, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 1 },
      ]);
      mockGetPlayoffSeasons.mockResolvedValue([{ teamId: "32", season: 2018, round: 1 }]);

      const result = await getPlayoffLeaderboardData();
      const vegas = result.find((entry) => entry.teamId === "32");

      expect(vegas).toBeDefined();
      expect(vegas?.seasons[0].season).toBe(2017);
      expect(vegas?.seasons[0].key).toBe("notQualified");
      expect(vegas?.seasons[1]).toEqual({ season: 2018, round: 1, key: "firstRound" });
    });

    test("maps playoff round keys for final, conferenceFinal and secondRound", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 0, finals: 1, conferenceFinals: 1, secondRound: 1, firstRound: 0 },
      ]);
      mockGetPlayoffSeasons.mockResolvedValue([
        { teamId: "1", season: 2012, round: 4 },
        { teamId: "1", season: 2013, round: 3 },
        { teamId: "1", season: 2014, round: 2 },
      ]);

      const result = await getPlayoffLeaderboardData();
      const colorado = result.find((entry) => entry.teamId === "1");

      expect(colorado).toBeDefined();
      expect(colorado?.seasons[0]).toEqual({ season: 2012, round: 4, key: "final" });
      expect(colorado?.seasons[1]).toEqual({ season: 2013, round: 3, key: "conferenceFinal" });
      expect(colorado?.seasons[2]).toEqual({ season: 2014, round: 2, key: "secondRound" });
    });
  });

  describe("getRegularLeaderboardData", () => {
    const mockGetRegularLeaderboard = getRegularLeaderboard as jest.MockedFunction<
      typeof getRegularLeaderboard
    >;
    const mockGetRegularSeasons = getRegularSeasons as jest.MockedFunction<
      typeof getRegularSeasons
    >;

    const baseRow = {
      teamId: "1",
      wins: 355,
      losses: 79,
      ties: 46,
      points: 756,
      divWins: 86,
      divLosses: 24,
      divTies: 10,
      regularTrophies: 2,
    };

    beforeEach(() => {
      mockGetRegularSeasons.mockResolvedValue([]);
    });

    test("resolves teamName from TEAMS and sets tieRank false for first entry", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([baseRow]);

      const result = await getRegularLeaderboardData();

      expect(result[0]).toMatchObject({
        teamId: "1",
        teamName: "Colorado Avalanche",
        seasons: [],
        tieRank: false,
      });
    });

    test("calculates winPercent correctly (3 decimal places)", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([baseRow]);

      const result = await getRegularLeaderboardData();

      // 355 / (355 + 79 + 46) = 355 / 480 = 0.739583... → 0.740
      expect(result[0].winPercent).toBe(
        Math.round((355 / (355 + 79 + 46)) * 1000) / 1000,
      );
    });

    test("calculates divWinPercent correctly (3 decimal places)", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([baseRow]);

      const result = await getRegularLeaderboardData();

      // 86 / (86 + 24 + 10) = 86 / 120 = 0.7166... → 0.717
      expect(result[0].divWinPercent).toBe(
        Math.round((86 / (86 + 24 + 10)) * 1000) / 1000,
      );
    });

    test("sets tieRank true when points AND wins match previous entry", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([
        { ...baseRow, teamId: "1", points: 756, wins: 355 },
        { ...baseRow, teamId: "4", points: 756, wins: 355 },
      ]);

      const result = await getRegularLeaderboardData();

      expect(result[0].tieRank).toBe(false);
      expect(result[1].tieRank).toBe(true);
    });

    test("sets tieRank false when points match but wins differ", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([
        { ...baseRow, teamId: "1", points: 756, wins: 355 },
        { ...baseRow, teamId: "4", points: 756, wins: 350 },
      ]);

      const result = await getRegularLeaderboardData();

      expect(result[0].tieRank).toBe(false);
      expect(result[1].tieRank).toBe(false);
    });

    test("sets tieRank false when wins match but points differ", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([
        { ...baseRow, teamId: "1", points: 756, wins: 355 },
        { ...baseRow, teamId: "4", points: 700, wins: 355 },
      ]);

      const result = await getRegularLeaderboardData();

      expect(result[0].tieRank).toBe(false);
      expect(result[1].tieRank).toBe(false);
    });

    test("falls back to teamId when team not found in TEAMS", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([
        { ...baseRow, teamId: "999" },
      ]);

      const result = await getRegularLeaderboardData();

      expect(result[0].teamName).toBe("999");
    });

    test("returns empty array when no data", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([]);

      const result = await getRegularLeaderboardData();

      expect(result).toEqual([]);
    });

    test("returns winPercent 0 when all games are zero", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([
        { ...baseRow, wins: 0, losses: 0, ties: 0 },
      ]);

      const result = await getRegularLeaderboardData();

      expect(result[0].winPercent).toBe(0);
    });

    test("returns divWinPercent 0 when all division games are zero", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([
        { ...baseRow, divWins: 0, divLosses: 0, divTies: 0 },
      ]);

      const result = await getRegularLeaderboardData();

      expect(result[0].divWinPercent).toBe(0);
    });

    test("calculates pointsPercent correctly (3 decimal places)", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([baseRow]);

      const result = await getRegularLeaderboardData();

      // points=756, total=(355+79+46)=480, maxPoints=480*2=960
      // pointsPercent = 756/960 = 0.7875
      expect(result[0].pointsPercent).toBe(
        Math.round((756 / ((355 + 79 + 46) * 2)) * 1000) / 1000,
      );
    });

    test("returns pointsPercent 0 when all games are zero", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([
        { ...baseRow, wins: 0, losses: 0, ties: 0, points: 0 },
      ]);

      const result = await getRegularLeaderboardData();

      expect(result[0].pointsPercent).toBe(0);
    });

    test("adds per-season breakdown with computed percents", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([baseRow]);
      mockGetRegularSeasons.mockResolvedValue([
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

      const result = await getRegularLeaderboardData();

      expect(result[0].seasons).toEqual([
        {
          season: 2024,
          regularTrophy: true,
          wins: 35,
          losses: 7,
          ties: 6,
          points: 76,
          divWins: 8,
          divLosses: 2,
          divTies: 2,
          winPercent: Math.round((35 / (35 + 7 + 6)) * 1000) / 1000,
          divWinPercent: Math.round((8 / (8 + 2 + 2)) * 1000) / 1000,
          pointsPercent: Math.round((76 / ((35 + 7 + 6) * 2)) * 1000) / 1000,
        },
      ]);
    });

    test("includes multiple per-season rows for same team", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([baseRow]);
      mockGetRegularSeasons.mockResolvedValue([
        {
          teamId: "1",
          season: 2023,
          regularTrophy: false,
          wins: 30,
          losses: 10,
          ties: 8,
          points: 68,
          divWins: 7,
          divLosses: 3,
          divTies: 2,
        },
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

      const result = await getRegularLeaderboardData();

      expect(result[0].seasons).toHaveLength(2);
      expect(result[0].seasons[0].season).toBe(2023);
      expect(result[0].seasons[0].regularTrophy).toBe(false);
      expect(result[0].seasons[1].season).toBe(2024);
      expect(result[0].seasons[1].regularTrophy).toBe(true);
    });
  });
});
