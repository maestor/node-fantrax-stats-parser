import {
  mapCombinedPlayerData,
  mapPlayerData,
} from "../features/stats/mapping";
import { applyPlayerScores } from "../features/stats/scoring";
import {
  mockRawDataEmptyName,
  mockRawDataFirstRow,
  mockRawDataGoalie,
  mockRawDataPlayer,
  mockRawDataPlayerWithCommas,
  mockRawDataZeroGames,
} from "./fixtures";

jest.mock("../features/stats/scoring");

describe("mappings", () => {
  describe("player mappings", () => {
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

      test("includes players with 0 games when includeZeroGames is true", () => {
        const result = mapPlayerData(
          [mockRawDataFirstRow, mockRawDataZeroGames],
          {
            includeZeroGames: true,
          },
        );

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Zero Games Player");
        expect(result[0].games).toBe(0);
      });

      test("excludes later section header rows when includeZeroGames is true", () => {
        const secondHeaderRow = {
          ...mockRawDataFirstRow,
          season: 2025,
        };

        const result = mapPlayerData(
          [mockRawDataFirstRow, secondHeaderRow, mockRawDataZeroGames],
          {
            includeZeroGames: true,
          },
        );

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Zero Games Player");
      });

      test("correctly parses numbers with commas (1,234)", () => {
        const result = mapPlayerData([
          mockRawDataFirstRow,
          mockRawDataPlayerWithCommas,
        ]);
        expect(result[0].games).toBe(82);
        expect(result[0].goals).toBe(5678);
        expect(result[0].assists).toBe(9012);
        expect(result[0].points).toBe(14690);
        expect(result[0].shots).toBe(3000);
      });

      test("maps RawData to PlayerWithSeason with correct fields", () => {
        const result = mapPlayerData([mockRawDataFirstRow, mockRawDataPlayer]);
        expect(result[0]).toEqual({
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
        });
      });

      test("parses id from first CSV column when export keeps ID field", () => {
        const withLeadingIdColumn = {
          ...mockRawDataPlayer,
          Skaters: "*00qs7*",
          field2: "F",
          field3: "Sebastian Aho",
          field4: "CAR",
          field5: "F",
          field6: "Act",
          field7: "@NJD",
          field8: "82",
          field9: "30",
          field10: "50",
          field11: "80",
          field12: "10",
          field13: "20",
          field14: "200",
          field15: "25",
          field16: "2",
          field17: "80",
          field18: "30",
          field19: "40",
        };

        const result = mapPlayerData([mockRawDataFirstRow, withLeadingIdColumn]);

        expect(result[0].name).toBe("Sebastian Aho");
        expect(result[0].id).toBe("00qs7");
        expect(result[0].position).toBe("F");
        expect(result[0].games).toBe(82);
      });

      test("returns empty id when leading ID column is malformed", () => {
        const withoutValidId = {
          ...mockRawDataPlayer,
          Skaters: "not-an-id",
        };

        const result = mapPlayerData([mockRawDataFirstRow, withoutValidId]);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Connor McDavid");
        expect(result[0].id).toBe("");
      });

      test("filters out malformed row where name is undefined", () => {
        const malformed = {
          ...mockRawDataPlayer,
          field3: undefined,
        } as unknown as typeof mockRawDataPlayer;

        const result = mapPlayerData([mockRawDataFirstRow, malformed]);

        expect(result.length).toBe(0);
      });

      test("defaults to 0 when Number() fails", () => {
        const invalidData = {
          ...mockRawDataPlayer,
          field9: "invalid",
          field10: "",
          field11: "",
          field12: "",
          field13: "",
          field14: "",
          field15: "",
          field16: "",
          field17: "",
          field18: "",
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
          field3: "Player A",
          field8: "50",
          field9: "30",
        };
        const season2 = {
          ...mockRawDataPlayer,
          season: 2024,
          field3: "Player A",
          field8: "32",
          field9: "20",
        };

        const result = mapCombinedPlayerData([
          mockRawDataFirstRow,
          season1,
          season2,
        ]);

        expect(result.length).toBe(1);
        expect(result[0].name).toBe("Player A");
        expect(result[0].games).toBe(82);
        expect(result[0].goals).toBe(50);
        expect(result[0].seasons.length).toBe(2);
      });

      test("preserves individual season data in seasons array", () => {
        const season1 = { ...mockRawDataPlayer, season: 2023 };
        const season2 = { ...mockRawDataPlayer, season: 2024 };

        const result = mapCombinedPlayerData([
          mockRawDataFirstRow,
          season1,
          season2,
        ]);

        expect(result[0].seasons[0].season).toBe(2023);
        expect(result[0].seasons[1].season).toBe(2024);
        expect(result[0].seasons[0]).toHaveProperty("games");
        expect(result[0].seasons[0]).toHaveProperty("goals");
        expect(result[0].seasons[0]).not.toHaveProperty("name");
      });

      test("works correctly with single season data", () => {
        const result = mapCombinedPlayerData([
          mockRawDataFirstRow,
          mockRawDataPlayer,
        ]);

        expect(result.length).toBe(1);
        expect(result[0].seasons.length).toBe(1);
      });

      test("handles multiple different players", () => {
        const player1 = {
          ...mockRawDataPlayer,
          Skaters: "*id001*",
          field3: "Player A",
        };
        const player2 = {
          ...mockRawDataPlayer,
          Skaters: "*id002*",
          field3: "Player B",
        };

        const result = mapCombinedPlayerData([
          mockRawDataFirstRow,
          player1,
          player2,
        ]);

        expect(result.length).toBe(2);
        expect(result.map((player) => player.name).sort()).toEqual([
          "Player A",
          "Player B",
        ]);
      });

      test("keeps same-name players separate when id differs", () => {
        const player1 = {
          ...mockRawDataPlayer,
          Skaters: "*id001*",
          field3: "Alex Smith",
        };
        const player2 = {
          ...mockRawDataPlayer,
          Skaters: "*id002*",
          field3: "Alex Smith",
          field9: "10",
        };

        const result = mapCombinedPlayerData([
          mockRawDataFirstRow,
          player1,
          player2,
        ]);

        expect(result.length).toBe(2);
        expect(result.map((player) => player.id).sort()).toEqual([
          "id001",
          "id002",
        ]);
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

          (players as ScoredSeasonPlayer[]).forEach((player) => {
            player.score = player.season === 2023 ? 10 : 20;
            player.scoreAdjustedByGames = player.season === 2023 ? 1 : 2;
            player.scores = { goals: player.season };
          });
          return players;
        });

        const season1 = {
          ...mockRawDataPlayer,
          season: 2023,
          field3: "Player A",
        };
        const season2 = {
          ...mockRawDataPlayer,
          season: 2024,
          field3: "Player A",
        };

        const result = mapCombinedPlayerData([
          mockRawDataFirstRow,
          season1,
          season2,
        ]);

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

        (applyPlayerScores as jest.Mock).mockImplementation((players) => {
          for (let i = 0; i < (players as Array<{ id: string }>).length; i++) {
            const player = (players as Array<{ id: string }>)[i];
            (players as Array<{ id: string }>)[i] = {
              ...(player as unknown as object),
              id: `${player.id}-scored`,
            } as unknown as never;
          }
          return players;
        });

        const season1 = {
          ...mockRawDataPlayer,
          season: 2023,
          field3: "Player A",
        };
        const season2 = {
          ...mockRawDataPlayer,
          season: 2024,
          field3: "Player A",
        };

        const result = mapCombinedPlayerData([
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
