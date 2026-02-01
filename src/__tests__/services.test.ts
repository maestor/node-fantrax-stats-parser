import csv from "csvtojson";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getGoaliesStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsCombined,
} from "../services";
import {
  availableSeasons,
  sortItemsByStatField,
  applyPlayerScores,
  applyGoalieScores,
  ApiError,
} from "../helpers";
import {
  mapAvailableSeasons,
  mapPlayerData,
  mapGoalieData,
  mapCombinedPlayerData,
  mapCombinedGoalieData,
  mapCombinedPlayerDataFromPlayersWithSeason,
  mapCombinedGoalieDataFromGoaliesWithSeason,
} from "../mappings";
import { mockRawDataPlayer, mockRawDataGoalie2014, mockPlayer, mockGoalie } from "./fixtures";

import { validateCsvFileOnceOrThrow } from "../csvIntegrity";

jest.mock("csvtojson");
jest.mock("../helpers");
jest.mock("../mappings");
jest.mock("../csvIntegrity", () => ({
  validateCsvFileOnceOrThrow: jest.fn().mockResolvedValue(undefined),
}));

describe("services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateCsvFileOnceOrThrow as jest.Mock).mockResolvedValue(undefined);
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
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
      (mapPlayerData as jest.Mock).mockReturnValue([mockPlayer]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches player stats and sorts by specified field", async () => {
      const result = await getPlayersStatsSeason("regular", 2024);

      expect(mapPlayerData).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayer], "players");
      expect(result).toEqual([mockPlayer]);
    });

    test("uses max season when season is undefined", async () => {
      await getPlayersStatsSeason("regular", undefined);

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledWith(
        expect.stringContaining("regular-2024-2025.csv")
      );
    });

    test("returns empty array when season is undefined and no seasons are available", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([]);
      (mapPlayerData as jest.Mock).mockReturnValue([]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsSeason("regular", undefined);

      expect(result).toEqual([]);
      expect((csv as unknown as jest.Mock)).toHaveBeenCalledTimes(0);
    });

    test("constructs correct CSV file path", async () => {
      await getPlayersStatsSeason("playoffs", 2023);

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledWith(
        expect.stringContaining("playoffs-2023-2024.csv")
      );
    });

    test("when reportType is both, reads regular+playoffs and merges before scoring", async () => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);

      const regular = {
        name: "Jamie Benn",
        season: 2024,
        games: 12,
        goals: 0,
        assists: 0,
        points: 6,
        plusMinus: 0,
        penalties: 0,
        shots: 0,
        ppp: 0,
        shp: 0,
        hits: 0,
        blocks: 0,
        score: 0,
        scoreAdjustedByGames: 0,
      };
      const playoffs = { ...regular, games: 4, points: 3 };

      (mapPlayerData as jest.Mock).mockReturnValue([regular, playoffs]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      await getPlayersStatsSeason("both", 2024);

      const csvMockInstance = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMockInstance.fromFile).toHaveBeenCalledWith(
        expect.stringContaining("regular-2024-2025.csv")
      );
      expect(csvMockInstance.fromFile).toHaveBeenCalledWith(
        expect.stringContaining("playoffs-2024-2025.csv")
      );

      expect(applyPlayerScores).toHaveBeenCalledWith([
        expect.objectContaining({ name: "Jamie Benn", season: 2024, games: 16, points: 9 }),
      ]);
    });
  });

  describe("getGoaliesStatsSeason", () => {
    beforeEach(() => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataGoalie2014]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
      (mapGoalieData as jest.Mock).mockReturnValue([mockGoalie]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches goalie stats and sorts by specified field", async () => {
      const result = await getGoaliesStatsSeason("regular", 2024);

      expect(mapGoalieData).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalie], "goalies");
      expect(result).toEqual([mockGoalie]);
    });

    test("uses max season when season is undefined", async () => {
      await getGoaliesStatsSeason("regular", undefined);

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledWith(
        expect.stringContaining("regular-2024-2025.csv")
      );
    });

    test("when reportType is both, does not include gaa/savePercent for scoring", async () => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataGoalie2014]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);

      const regular = {
        name: "Test Goalie",
        season: 2024,
        games: 10,
        wins: 6,
        saves: 300,
        shutouts: 1,
        goals: 0,
        assists: 0,
        points: 0,
        penalties: 0,
        ppp: 0,
        shp: 0,
        gaa: "2.30",
        savePercent: "0.920",
        score: 0,
        scoreAdjustedByGames: 0,
      };
      const playoffs = { ...regular, games: 2, wins: 1, gaa: "1.00", savePercent: "0.950" };

      (mapGoalieData as jest.Mock).mockReturnValue([regular, playoffs]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

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
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (mapCombinedPlayerData as jest.Mock).mockReturnValue([mockPlayer]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches player stats for all available seasons", async () => {
      const result = await getPlayersStatsCombined("regular");

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapCombinedPlayerData).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayer], "players");
      expect(result).toEqual([mockPlayer]);
    });

    test("reads CSV files for all seasons", async () => {
      await getPlayersStatsCombined("regular");

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(3);
    });

    test("returns empty array when no seasons are available", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([]);
      (mapCombinedPlayerData as jest.Mock).mockReturnValue([]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsCombined("regular");

      expect(result).toEqual([]);
      expect((csv as unknown as jest.Mock)).toHaveBeenCalledTimes(0);
    });

    test("filters seasons when startFrom is provided", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014, 2020]);

      const result = await getPlayersStatsCombined("regular", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(1);
      expect(csvMock.fromFile).toHaveBeenCalledWith(expect.stringContaining("regular-2020-2021.csv"));
      expect(result).toEqual([mockPlayer]);
    });

    test("returns all seasons when startFrom is undefined", async () => {
      const result = await getPlayersStatsCombined("regular", "1", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(3);
      expect(result).toEqual([mockPlayer]);
    });

    test("returns empty array when startFrom is after all available seasons", async () => {
      (mapCombinedPlayerData as jest.Mock).mockReturnValue([]);

      const result = await getPlayersStatsCombined("regular", "1", 2025);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(result).toEqual([]);
    });

    test("when reportType is both, reads regular+playoffs and merges before combining", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2024]);

      const regular = {
        name: "Jamie Benn",
        season: 2024,
        games: 12,
        goals: 0,
        assists: 0,
        points: 6,
        plusMinus: 0,
        penalties: 0,
        shots: 0,
        ppp: 0,
        shp: 0,
        hits: 0,
        blocks: 0,
        score: 0,
        scoreAdjustedByGames: 0,
      };
      const playoffs = { ...regular, games: 4, points: 3 };

      (mapPlayerData as jest.Mock).mockReturnValue([regular, playoffs]);
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([mockPlayer]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsCombined("both", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "both");
      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(2);
      expect(csvMock.fromFile).toHaveBeenCalledWith(expect.stringContaining("regular-2024-2025.csv"));
      expect(csvMock.fromFile).toHaveBeenCalledWith(expect.stringContaining("playoffs-2024-2025.csv"));

      expect(mapCombinedPlayerDataFromPlayersWithSeason).toHaveBeenCalledWith([
        expect.objectContaining({ name: "Jamie Benn", season: 2024, games: 16, points: 9 }),
      ]);
      expect(result).toEqual([mockPlayer]);
    });
  });

  describe("getGoaliesStatsCombined", () => {
    beforeEach(() => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataGoalie2014]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (mapCombinedGoalieData as jest.Mock).mockReturnValue([mockGoalie]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches goalie stats for all available seasons", async () => {
      const result = await getGoaliesStatsCombined("regular");

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapCombinedGoalieData).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalie], "goalies");
      expect(result).toEqual([mockGoalie]);
    });

    test("reads CSV files for all seasons", async () => {
      await getGoaliesStatsCombined("regular");

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(3);
    });

    test("filters seasons when startFrom is provided", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014, 2020]);

      const result = await getGoaliesStatsCombined("regular", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(1);
      expect(csvMock.fromFile).toHaveBeenCalledWith(expect.stringContaining("regular-2020-2021.csv"));
      expect(result).toEqual([mockGoalie]);
    });

    test("returns all seasons when startFrom is undefined", async () => {
      const result = await getGoaliesStatsCombined("regular", "1", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(3);
      expect(result).toEqual([mockGoalie]);
    });

    test("returns empty array when startFrom is after all available seasons", async () => {
      (mapCombinedGoalieData as jest.Mock).mockReturnValue([]);

      const result = await getGoaliesStatsCombined("regular", "1", 2025);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(result).toEqual([]);
    });

    test("when reportType is both, reads regular+playoffs and strips gaa/savePercent", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2024]);

      const regular = {
        name: "Test Goalie",
        season: 2024,
        games: 10,
        wins: 6,
        saves: 300,
        shutouts: 1,
        goals: 0,
        assists: 0,
        points: 0,
        penalties: 0,
        ppp: 0,
        shp: 0,
        gaa: "2.30",
        savePercent: "0.920",
        score: 0,
        scoreAdjustedByGames: 0,
      };
      const playoffs = { ...regular, games: 2, wins: 1, gaa: "1.00", savePercent: "0.950" };

      (mapGoalieData as jest.Mock).mockReturnValue([regular, playoffs]);
      (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue([mockGoalie]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getGoaliesStatsCombined("both", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "both");
      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(2);
      expect(csvMock.fromFile).toHaveBeenCalledWith(expect.stringContaining("regular-2024-2025.csv"));
      expect(csvMock.fromFile).toHaveBeenCalledWith(expect.stringContaining("playoffs-2024-2025.csv"));

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
  });

  describe("CSV error handling", () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test("returns empty array for missing file in single season", async () => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockRejectedValue(new Error("File not found")),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2024]);
      (mapPlayerData as jest.Mock).mockReturnValue([]);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsSeason("regular", 2024);

      expect(result).toEqual([]);
    });

    test("handles partial file read errors in combined data", async () => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest
          .fn()
          .mockResolvedValueOnce([mockRawDataPlayer])
          .mockRejectedValueOnce(new Error("File not found"))
          .mockResolvedValueOnce([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (mapCombinedPlayerData as jest.Mock).mockImplementation((data) => {
        expect(data.length).toBeGreaterThan(0);
        return [mockPlayer];
      });
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsCombined("regular");

      expect(result).toEqual([mockPlayer]);
    });

    test("returns data even if some CSV files are missing", async () => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest
          .fn()
          .mockRejectedValueOnce(new Error("Not found"))
          .mockRejectedValueOnce(new Error("Not found"))
          .mockResolvedValueOnce([mockRawDataGoalie2014]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (mapCombinedGoalieData as jest.Mock).mockReturnValue([mockGoalie]);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getGoaliesStatsCombined("regular");

      expect(result).toEqual([mockGoalie]);
    });

    test("throws on CSV integrity mismatch", async () => {
      (validateCsvFileOnceOrThrow as jest.Mock).mockRejectedValue({ statusCode: 500, message: "bad csv" });
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2024]);
      (mapPlayerData as jest.Mock).mockReturnValue([]);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      await expect(getPlayersStatsSeason("regular", 2024)).rejects.toEqual(
        expect.objectContaining({ statusCode: 500 })
      );
    });

    test("re-throws ApiError instances from integrity validator", async () => {
      const apiErrorLike = new Error("api") as unknown as { statusCode: number };
      apiErrorLike.statusCode = 500;
      Object.setPrototypeOf(apiErrorLike, (ApiError as unknown as { prototype: object }).prototype);

      (validateCsvFileOnceOrThrow as jest.Mock).mockRejectedValue(apiErrorLike);
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2024]);
      (mapPlayerData as jest.Mock).mockReturnValue([]);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      await expect(getPlayersStatsSeason("regular", 2024)).rejects.toEqual(
        expect.objectContaining({ statusCode: 500 })
      );
    });

    test("re-throws errors with statusCode from csv parsing", async () => {
      (validateCsvFileOnceOrThrow as jest.Mock).mockResolvedValue(undefined);
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockRejectedValue({ statusCode: 500, message: "parse error" }),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2024]);
      (mapPlayerData as jest.Mock).mockReturnValue([]);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      await expect(getPlayersStatsSeason("regular", 2024)).rejects.toEqual(
        expect.objectContaining({ statusCode: 500 })
      );
    });

    test("re-throws errors with statusCode from integrity validator", async () => {
      (validateCsvFileOnceOrThrow as jest.Mock).mockRejectedValue({ statusCode: 500, message: "schema mismatch" });
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (mapPlayerData as jest.Mock).mockReturnValue([]);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      await expect(getPlayersStatsSeason("regular", 2024)).rejects.toEqual(
        expect.objectContaining({ statusCode: 500 })
      );
    });
  });
});
