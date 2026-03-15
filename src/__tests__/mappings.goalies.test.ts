import {
  mapCombinedGoalieData,
  mapGoalieData,
} from "../features/stats/mapping";
import { applyGoalieScores } from "../features/stats/scoring";
import {
  mockRawDataFirstRow,
  mockRawDataGoalie2012,
  mockRawDataGoalie2014,
  mockRawDataGoalieNoField18,
  mockRawDataGoalieNonNumericWins,
  mockRawDataPlayer,
} from "./fixtures";

jest.mock("../features/stats/scoring");

describe("mappings", () => {
  describe("goalie mappings", () => {
    describe("mapGoalieData", () => {
      test("only includes goalies with valid data", () => {
        const { mockRawDataGoalie } = jest.requireActual("./fixtures");
        const result = mapGoalieData([
          mockRawDataFirstRow,
          mockRawDataPlayer,
          mockRawDataGoalie,
        ]);

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
        const result = mapGoalieData([
          mockRawDataFirstRow,
          mockRawDataGoalieNoField18,
        ]);

        expect(result[0].shp).toBe(0);
      });

      test("maps placeholder 0 gaa and savePercent to undefined", () => {
        const result = mapGoalieData([
          mockRawDataFirstRow,
          {
            ...mockRawDataGoalie2014,
            field10: "0",
            field12: "0",
          },
        ]);

        expect(result[0].gaa).toBeUndefined();
        expect(result[0].savePercent).toBeUndefined();
      });

      test("maps all RawData fields to GoalieWithSeason", () => {
        const result = mapGoalieData([mockRawDataFirstRow, mockRawDataGoalie2014]);

        expect(result[0]).toEqual({
          id: "g002",
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

      test("parses id from first CSV column when export keeps ID field", () => {
        const withLeadingIdColumn = {
          ...mockRawDataGoalie2014,
          Skaters: "*g007*",
          field2: "G",
          field3: "Juuse Saros",
          field4: "NSH",
          field5: "G",
          field6: "Act",
          field7: "",
          field8: "60",
          field9: "30",
          field10: "2.50",
          field11: "1500",
          field12: "0.915",
          field13: "3",
          field14: "10",
          field15: "0",
          field16: "1",
          field17: "1",
          field18: "0",
          field19: "0",
        };

        const result = mapGoalieData([mockRawDataFirstRow, withLeadingIdColumn]);

        expect(result[0].name).toBe("Juuse Saros");
        expect(result[0].id).toBe("g007");
        expect(result[0].games).toBe(60);
        expect(result[0].wins).toBe(30);
      });

      test("defaults shifted goalie SHP to 0 when id-first row is missing field19", () => {
        const withLeadingIdColumnNoField19 = {
          ...mockRawDataGoalie2014,
          Skaters: "*g007*",
          field2: "G",
          field3: "Juuse Saros",
          field4: "NSH",
          field5: "G",
          field6: "Act",
          field7: "",
          field8: "60",
          field9: "30",
          field10: "2.50",
          field11: "1500",
          field12: "0.915",
          field13: "3",
          field14: "10",
          field15: "0",
          field16: "1",
          field17: "1",
          field18: "0",
          field19: undefined,
        };

        const result = mapGoalieData([
          mockRawDataFirstRow,
          withLeadingIdColumnNoField19 as unknown as typeof mockRawDataGoalie2014,
        ]);

        expect(result[0].id).toBe("g007");
        expect(result[0].shp).toBe(0);
      });

      test("excludes goalies with both games and wins as 0", () => {
        const zeroGoalie = {
          ...mockRawDataGoalie2014,
          field8: "0",
          field9: "0",
        };
        const result = mapGoalieData([mockRawDataFirstRow, zeroGoalie]);

        expect(result.length).toBe(0);
      });

      test("includes goalies with 0 games when includeZeroGames is true", () => {
        const zeroGoalie = {
          ...mockRawDataGoalie2014,
          field8: "0",
          field9: "0",
        };
        const result = mapGoalieData([mockRawDataFirstRow, zeroGoalie], {
          includeZeroGames: true,
        });

        expect(result).toHaveLength(1);
        expect(result[0].games).toBe(0);
        expect(result[0].wins).toBe(0);
      });

      test("excludes later goalie header rows when includeZeroGames is true", () => {
        const secondHeaderRow = {
          ...mockRawDataFirstRow,
          season: 2025,
        };
        const result = mapGoalieData(
          [mockRawDataFirstRow, secondHeaderRow, mockRawDataGoalie2014],
          {
            includeZeroGames: true,
          },
        );

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Carey Price");
      });

      test("includes goalie with games > 0, wins = 0", () => {
        const goalie = {
          ...mockRawDataGoalie2014,
          field8: "0",
          field9: "10",
        };
        const result = mapGoalieData([mockRawDataFirstRow, goalie]);

        expect(result.length).toBe(1);
      });

      test("treats empty wins value as 0 (W-G parsing)", () => {
        const data = {
          ...mockRawDataGoalie2014,
          field8: "10",
          field9: "",
        };

        const result = mapGoalieData([mockRawDataFirstRow, data]);

        expect(result.length).toBe(1);
        expect(result[0].games).toBe(10);
        expect(result[0].wins).toBe(0);
      });

      test("includes goalie with wins > 0, games = 0", () => {
        const goalie = {
          ...mockRawDataGoalie2014,
          field8: "10",
          field9: "0",
        };
        const result = mapGoalieData([mockRawDataFirstRow, goalie]);

        expect(result.length).toBe(1);
      });

      test("handles commas in goalie numbers", () => {
        const goalieWithCommas = {
          ...mockRawDataGoalie2014,
          field11: "2,500",
        };
        const result = mapGoalieData([mockRawDataFirstRow, goalieWithCommas]);

        expect(result[0].saves).toBe(2500);
      });

      test("excludes goalies with empty field2", () => {
        const emptyNameGoalie = {
          ...mockRawDataGoalie2014,
          field3: "",
        };
        const result = mapGoalieData([mockRawDataFirstRow, emptyNameGoalie]);

        expect(result.length).toBe(0);
      });

      test("defaults goalie stats to 0 when Number() fails", () => {
        const invalidGoalie = {
          ...mockRawDataGoalie2014,
          field8: "10",
          field9: "",
          field11: "invalid",
          field13: "",
          field14: "",
          field15: "",
          field16: "",
          field17: "",
          field18: "",
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
          field8: "",
          field9: "10",
        };
        const result = mapGoalieData([
          mockRawDataFirstRow,
          invalidGoalie2012Games,
        ]);

        expect(result[0].games).toBe(0);
        expect(result[0].wins).toBe(10);
      });

      test("defaults goalie wins to 0 for season 2012 when Number() fails", () => {
        const invalidGoalie2012Wins = {
          ...mockRawDataGoalie2012,
          field8: "10",
          field9: "",
        };
        const result = mapGoalieData([
          mockRawDataFirstRow,
          invalidGoalie2012Wins,
        ]);

        expect(result[0].games).toBe(10);
        expect(result[0].wins).toBe(0);
      });

      test("handles field18 with comma in ternary", () => {
        const goalieWithCommaInField18 = {
          ...mockRawDataGoalie2014,
          field19: "1,234",
        };
        const result = mapGoalieData([
          mockRawDataFirstRow,
          goalieWithCommaInField18,
        ]);

        expect(result[0].shp).toBe(1234);
      });

      test("returns 0 wins when wins field contains no digits (parseWinsFromWG no-match)", () => {
        const result = mapGoalieData([
          mockRawDataFirstRow,
          mockRawDataGoalieNonNumericWins,
        ]);

        expect(result[0].name).toBe("Test Goalie Non-Numeric");
        expect(result[0].wins).toBe(0);
      });
    });

    describe("mapCombinedGoalieData", () => {
      test("sums goalie stats for multiple seasons", () => {
        const season1 = {
          ...mockRawDataGoalie2014,
          season: 2023,
          field3: "Goalie A",
          field8: "60",
          field9: "30",
        };
        const season2 = {
          ...mockRawDataGoalie2014,
          season: 2024,
          field3: "Goalie A",
          field8: "40",
          field9: "20",
        };

        const result = mapCombinedGoalieData([
          mockRawDataFirstRow,
          season1,
          season2,
        ]);

        expect(result.length).toBe(1);
        expect(result[0].name).toBe("Goalie A");
        expect(result[0].wins).toBe(50);
        expect(result[0].games).toBe(100);
        expect(result[0].seasons.length).toBe(2);
      });

      test("does not include gaa and savePercent in combined data root level", () => {
        const result = mapCombinedGoalieData([
          mockRawDataFirstRow,
          mockRawDataGoalie2014,
        ]);

        expect(result[0]).not.toHaveProperty("gaa");
        expect(result[0]).not.toHaveProperty("savePercent");
      });

      test("includes individual season data in seasons array", () => {
        const season1 = { ...mockRawDataGoalie2014, season: 2023 };
        const season2 = { ...mockRawDataGoalie2014, season: 2024 };

        const result = mapCombinedGoalieData([
          mockRawDataFirstRow,
          season1,
          season2,
        ]);

        expect(result[0].seasons[0].season).toBe(2023);
        expect(result[0].seasons[1].season).toBe(2024);
        expect(result[0].seasons[0]).toHaveProperty("wins");
        expect(result[0].seasons[0]).toHaveProperty("games");
        expect(result[0].seasons[0]).not.toHaveProperty("name");
      });

      test("handles multiple different goalies", () => {
        const goalie1 = {
          ...mockRawDataGoalie2014,
          Skaters: "*g101*",
          field3: "Goalie A",
        };
        const goalie2 = {
          ...mockRawDataGoalie2014,
          Skaters: "*g102*",
          field3: "Goalie B",
        };

        const result = mapCombinedGoalieData([
          mockRawDataFirstRow,
          goalie1,
          goalie2,
        ]);

        expect(result.length).toBe(2);
        expect(result.map((goalie) => goalie.name).sort()).toEqual([
          "Goalie A",
          "Goalie B",
        ]);
      });

      test("keeps same-name goalies separate when id differs", () => {
        const goalie1 = {
          ...mockRawDataGoalie2014,
          Skaters: "*g001*",
          field3: "John Doe",
        };
        const goalie2 = {
          ...mockRawDataGoalie2014,
          Skaters: "*g002*",
          field3: "John Doe",
          field9: "10",
        };

        const result = mapCombinedGoalieData([
          mockRawDataFirstRow,
          goalie1,
          goalie2,
        ]);

        expect(result.length).toBe(2);
        expect(result.map((goalie) => goalie.id).sort()).toEqual([
          "g001",
          "g002",
        ]);
      });

      test("handles mixed season data with year boundary", () => {
        const old = mockRawDataGoalie2012;
        const newer = mockRawDataGoalie2014;

        const result = mapCombinedGoalieData([
          mockRawDataFirstRow,
          old,
          newer,
        ]);

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

        const season1 = {
          ...mockRawDataGoalie2014,
          season: 2023,
          field3: "Goalie A",
        };
        const season2 = {
          ...mockRawDataGoalie2014,
          season: 2024,
          field3: "Goalie A",
        };

        const result = mapCombinedGoalieData([
          mockRawDataFirstRow,
          season1,
          season2,
        ]);

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
          for (let i = 0; i < (goalies as Array<{ id: string }>).length; i++) {
            const goalie = (goalies as Array<{ id: string }>)[i];
            (goalies as Array<{ id: string }>)[i] = {
              ...(goalie as unknown as object),
              id: `${goalie.id}-scored`,
            } as unknown as never;
          }
          return goalies;
        });

        const season1 = {
          ...mockRawDataGoalie2014,
          season: 2023,
          field3: "Goalie A",
        };
        const season2 = {
          ...mockRawDataGoalie2014,
          season: 2024,
          field3: "Goalie A",
        };

        const result = mapCombinedGoalieData([
          mockRawDataFirstRow,
          season1,
          season2,
        ]);

        const seasons = result[0].seasons.sort((a, b) => a.season - b.season);

        expect(seasons[0].score).toBe(0);
        expect(seasons[0].scoreAdjustedByGames).toBe(0);
        expect(seasons[0].scores).toBeUndefined();

        expect(seasons[1].score).toBe(0);
        expect(seasons[1].scoreAdjustedByGames).toBe(0);
        expect(seasons[1].scores).toBeUndefined();
      });
    });
  });
});
