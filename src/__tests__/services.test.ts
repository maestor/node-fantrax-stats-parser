import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getGoaliesStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsCombined,
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
import { getPlayersFromDb, getGoaliesFromDb, getPlayoffLeaderboard, getRegularLeaderboard } from "../db/queries";
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
    test("calls and returns mapAvailableSeasons result", async () => {
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

    test("filters seasons when startFrom is provided", async () => {
      const mockSeasons = [{ season: 2020, text: "2020-2021" }];
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2020]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons("1", "regular", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapAvailableSeasons).toHaveBeenCalledWith([2020]);
      expect(result).toEqual(mockSeasons);
    });

    test("returns all seasons when startFrom is undefined", async () => {
      const mockSeasons = [
        { season: 2012, text: "2012-2013" },
        { season: 2013, text: "2013-2014" },
      ];
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons("1", "regular", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapAvailableSeasons).toHaveBeenCalledWith([2012, 2013]);
      expect(result).toEqual(mockSeasons);
    });

    test("returns empty array when startFrom is after all available seasons", async () => {
      const mockSeasons: Array<{ season: number; text: string }> = [];
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons("1", "regular", 2025);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapAvailableSeasons).toHaveBeenCalledWith([]);
      expect(result).toEqual(mockSeasons);
    });

    test("uses regular report type when reportType is both", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (availableSeasons as jest.Mock).mockReturnValue([2012]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons("1", "both");

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
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

    test("fetches player stats from DB and sorts", async () => {
      const result = await getPlayersStatsSeason("regular", 2024);

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(applyPlayerScores).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayerWithSeason], "players");
      expect(result).toEqual([mockPlayerWithSeason]);
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

    test("queries correct report type", async () => {
      await getPlayersStatsSeason("playoffs", 2023);

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2023, "playoffs");
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

    test("fetches goalie stats from DB and sorts", async () => {
      const result = await getGoaliesStatsSeason("regular", 2024);

      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(applyGoalieScores).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalieWithSeason], "goalies");
      expect(result).toEqual([mockGoalieWithSeason]);
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

    test("fetches player stats for all available seasons", async () => {
      const result = await getPlayersStatsCombined("regular");

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getPlayersFromDb).toHaveBeenCalledTimes(3);
      expect(mapCombinedPlayerDataFromPlayersWithSeason).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayer], "players");
      expect(result).toEqual([mockPlayer]);
    });

    test("queries DB for each season", async () => {
      await getPlayersStatsCombined("regular");

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2012, "regular");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2013, "regular");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2014, "regular");
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

    test("returns all seasons when startFrom is undefined", async () => {
      const result = await getPlayersStatsCombined("regular", "1", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getPlayersFromDb).toHaveBeenCalledTimes(3);
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

    test("fetches goalie stats for all available seasons", async () => {
      const result = await getGoaliesStatsCombined("regular");

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledTimes(3);
      expect(mapCombinedGoalieDataFromGoaliesWithSeason).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalie], "goalies");
      expect(result).toEqual([mockGoalie]);
    });

    test("queries DB for each season", async () => {
      await getGoaliesStatsCombined("regular");

      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2012, "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2013, "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2014, "regular");
    });

    test("filters seasons when startFrom is provided", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014, 2020]);

      const result = await getGoaliesStatsCombined("regular", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledTimes(1);
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2020, "regular");
      expect(result).toEqual([mockGoalie]);
    });

    test("returns all seasons when startFrom is undefined", async () => {
      const result = await getGoaliesStatsCombined("regular", "1", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledTimes(3);
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

  describe("getPlayoffLeaderboardData", () => {
    const mockGetPlayoffLeaderboard = getPlayoffLeaderboard as jest.MockedFunction<
      typeof getPlayoffLeaderboard
    >;

    test("resolves teamName from TEAMS and sets tieRank false for non-tied entries", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 3, finals: 2, conferenceFinals: 2, secondRound: 4, firstRound: 2 },
        { teamId: "4", championships: 3, finals: 0, conferenceFinals: 4, secondRound: 2, firstRound: 4 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result[0]).toMatchObject({
        teamId: "1",
        teamName: "Colorado Avalanche",
        tieRank: false,
      });
      expect(result[1]).toMatchObject({
        teamId: "4",
        teamName: "Vancouver Canucks",
        tieRank: false,
      });
    });

    test("sets tieRank true when 5-tuple matches previous entry", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 1, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 3 },
        { teamId: "15", championships: 1, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 3 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result[0].tieRank).toBe(false);
      expect(result[1].tieRank).toBe(true);
    });

    test("first entry is always tieRank false", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 5, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 0 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result[0].tieRank).toBe(false);
    });

    test("returns all TEAMS with zero values when no data", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([]);
      const result = await getPlayoffLeaderboardData();
      expect(result).toHaveLength(TEAMS.length);
      for (const entry of result) {
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
  });

  describe("getRegularLeaderboardData", () => {
    const mockGetRegularLeaderboard = getRegularLeaderboard as jest.MockedFunction<
      typeof getRegularLeaderboard
    >;

    const baseRow = {
      teamId: "1",
      seasons: 10,
      wins: 355,
      losses: 79,
      ties: 46,
      points: 756,
      divWins: 86,
      divLosses: 24,
      divTies: 10,
      regularTrophies: 2,
    };

    test("resolves teamName from TEAMS and sets tieRank false for first entry", async () => {
      mockGetRegularLeaderboard.mockResolvedValue([baseRow]);

      const result = await getRegularLeaderboardData();

      expect(result[0]).toMatchObject({
        teamId: "1",
        teamName: "Colorado Avalanche",
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
  });
});
