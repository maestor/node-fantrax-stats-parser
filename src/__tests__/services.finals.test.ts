import { getFinalsLeaderboardData } from "../features/finals/service.js";
import {
  getFinalsCategories,
  getFinalsMatchups,
} from "../db/queries.js";

jest.mock("../db/queries");

describe("finals service", () => {
  const mockGetFinalsMatchups =
    getFinalsMatchups as jest.MockedFunction<typeof getFinalsMatchups>;
  const mockGetFinalsCategories =
    getFinalsCategories as jest.MockedFunction<typeof getFinalsCategories>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns an empty list when no finals are imported", async () => {
    mockGetFinalsMatchups.mockResolvedValue([]);
    mockGetFinalsCategories.mockResolvedValue([]);

    await expect(getFinalsLeaderboardData()).resolves.toEqual([]);
  });

  test("maps finals matchups, category winners, team names, and rates", async () => {
    mockGetFinalsMatchups.mockResolvedValue([
      {
        season: 2024,
        wonOnHomeTiebreak: false,
        winnerTeamId: "1",
      awayTeam: {
        teamId: "1",
        isWinner: true,
          score: {
            matchPoints: 8.5,
            categoriesWon: 8,
            categoriesLost: 6,
            categoriesTied: 1,
          },
          playedGames: { total: 12, skaters: 10, goalies: 2 },
          totals: {
            goals: 10,
            assists: 10,
            points: 20,
            plusMinus: 3,
            penalties: 12,
            shots: 80,
            ppp: 6,
            shp: 1,
            hits: 30,
            blocks: 20,
            wins: 1,
            gaa: 2.5,
            saves: 50,
            savePercent: 0.91,
            shutouts: 0,
          },
        },
      homeTeam: {
        teamId: "999",
        isWinner: false,
          score: {
            matchPoints: 6.5,
            categoriesWon: 6,
            categoriesLost: 8,
            categoriesTied: 1,
          },
          playedGames: { total: 12, skaters: 10, goalies: 2 },
          totals: {
            goals: 9,
            assists: 9,
            points: 18,
            plusMinus: 1,
            penalties: 10,
            shots: 75,
            ppp: 5,
            shp: 0,
            hits: 28,
            blocks: 18,
            wins: 1,
            gaa: 2.7,
            saves: 48,
            savePercent: 0.9,
            shutouts: 0,
          },
        },
      },
    ]);
    mockGetFinalsCategories.mockResolvedValue([
      {
        season: 2024,
        statKey: "goals",
        awayValue: 10,
        homeValue: 9,
        winnerTeamId: "1",
      },
      {
        season: 2024,
        statKey: "shp",
        awayValue: 1,
        homeValue: 1,
        winnerTeamId: null,
      },
      {
        season: 2024,
        statKey: "blocks",
        awayValue: 20,
        homeValue: 18,
        winnerTeamId: "404",
      },
      {
        season: 1900,
        statKey: "goals",
        awayValue: 1,
        homeValue: 0,
        winnerTeamId: "1",
      },
    ]);

    const result = await getFinalsLeaderboardData();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      season: 2024,
      winnerTeamId: "1",
      winnerTeamName: "Colorado Avalanche",
      awayTeam: {
        teamId: "1",
        teamName: "Colorado Avalanche",
        score: expect.any(Object),
        playedGames: expect.any(Object),
        totals: expect.any(Object),
      },
      homeTeam: {
        teamId: "999",
        teamName: "999",
        score: expect.any(Object),
        playedGames: expect.any(Object),
        totals: expect.any(Object),
      },
      rates: {
        winRate: 0.567,
        deservedToWinRate: expect.any(Number),
      },
      factors: {
        awayTeam: {
          offence: 0.522,
          physical: 0.525,
          goalies: 0.51,
        },
        homeTeam: {
          offence: 0.478,
          physical: 0.475,
          goalies: 0.49,
        },
      },
    });
    expect(result[0].awayTeam).not.toHaveProperty("isWinner");
    expect(result[0].homeTeam).not.toHaveProperty("isWinner");
    expect(result[0].categories).toEqual([
      {
        statKey: "goals",
        awayValue: 10,
        homeValue: 9,
        winnerTeamId: "1",
      },
      {
        statKey: "shp",
        awayValue: 1,
        homeValue: 1,
        winnerTeamId: null,
      },
      {
        statKey: "blocks",
        awayValue: 20,
        homeValue: 18,
        winnerTeamId: "404",
      },
    ]);
    expect(
      Object.keys(result[0].awayTeam.totals).slice(
        Object.keys(result[0].awayTeam.totals).indexOf("wins"),
      ),
    ).toEqual(["wins", "gaa", "saves", "savePercent", "shutouts"]);
  });

  test("returns empty category arrays when a season has no category rows", async () => {
    mockGetFinalsMatchups.mockResolvedValue([
      {
        season: 2023,
        wonOnHomeTiebreak: false,
        winnerTeamId: "1",
      awayTeam: {
        teamId: "1",
        isWinner: true,
          score: {
            matchPoints: 8.5,
            categoriesWon: 8,
            categoriesLost: 6,
            categoriesTied: 1,
          },
          playedGames: { total: 12, skaters: 10, goalies: 2 },
          totals: {
            goals: 10,
            assists: 10,
            points: 20,
            plusMinus: 3,
            penalties: 12,
            shots: 80,
            ppp: 6,
            shp: 1,
            hits: 30,
            blocks: 20,
            wins: 1,
            gaa: 2.5,
            saves: 50,
            savePercent: 0.91,
            shutouts: 0,
          },
        },
      homeTeam: {
        teamId: "2",
        isWinner: false,
          score: {
            matchPoints: 6.5,
            categoriesWon: 6,
            categoriesLost: 8,
            categoriesTied: 1,
          },
          playedGames: { total: 12, skaters: 10, goalies: 2 },
          totals: {
            goals: 9,
            assists: 9,
            points: 18,
            plusMinus: 1,
            penalties: 10,
            shots: 75,
            ppp: 5,
            shp: 0,
            hits: 28,
            blocks: 18,
            wins: 1,
            gaa: 2.7,
            saves: 48,
            savePercent: 0.9,
            shutouts: 0,
          },
        },
      },
    ]);
    mockGetFinalsCategories.mockResolvedValue([]);

    await expect(getFinalsLeaderboardData()).resolves.toEqual([
      expect.objectContaining({
        season: 2023,
        categories: [],
        factors: expect.any(Object),
      }),
    ]);
  });
});
