import { getCareerGoaliesData, getCareerPlayersData } from "../services";
import {
  getAllGoalieCareerRowsFromDb,
  getAllPlayerCareerRowsFromDb,
} from "../db/queries";
import {
  createGoalieCareerRow,
  createPlayerCareerRow,
} from "./services.career.fixtures";

jest.mock("../db/queries");

describe("services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("career list services", () => {
    describe("getCareerPlayersData", () => {
      const mockGetAllPlayerCareerRowsFromDb =
        getAllPlayerCareerRowsFromDb as jest.MockedFunction<
          typeof getAllPlayerCareerRowsFromDb
        >;

      test("builds player career list items with owned and played counts", async () => {
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "p002",
            name: "Alpha Skater",
            position: "D",
            team_id: "2",
            games: 1,
            assists: 1,
            points: 1,
            shots: 1,
          }),
          createPlayerCareerRow({
            name: "Beta Skater",
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
            name: "Beta Skater",
            report_type: "playoffs",
          }),
          createPlayerCareerRow({
            name: "Beta Skater",
            team_id: "99",
            season: 2023,
          }),
          createPlayerCareerRow({
            name: "Beta Skater",
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
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "p002",
            name: "Broken Skater",
            position: null,
            team_id: "2",
            games: 1,
            assists: 1,
            points: 1,
            shots: 1,
          }),
        ]);

        await expect(getCareerPlayersData()).rejects.toThrow(
          "Player position missing",
        );
      });

      test("sorts player list ties by id when names match", async () => {
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "p002",
            name: "Same Name",
            games: 1,
            assists: 1,
            points: 1,
            shots: 1,
          }),
          createPlayerCareerRow({
            name: "Same Name",
            player_id: "p001",
            position: "D",
            team_id: "2",
            games: 1,
            assists: 1,
            points: 1,
            shots: 1,
          }),
        ]);

        const result = await getCareerPlayersData();

        expect(result.map((item) => item.id)).toEqual(["p001", "p002"]);
      });
    });

    describe("getCareerGoaliesData", () => {
      const mockGetAllGoalieCareerRowsFromDb =
        getAllGoalieCareerRowsFromDb as jest.MockedFunction<
          typeof getAllGoalieCareerRowsFromDb
        >;

      test("builds goalie career list items with owned and played counts", async () => {
        mockGetAllGoalieCareerRowsFromDb.mockResolvedValue([
          createGoalieCareerRow({
            goalie_id: "g002",
            name: "Alpha Goalie",
            games: 10,
            wins: 6,
            saves: 250,
            shutouts: 1,
            gaa: 2.3,
            save_percent: 0.92,
          }),
          createGoalieCareerRow({
            name: "Beta Goalie",
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
            name: "Beta Goalie",
            team_id: "77",
            season: 2023,
            report_type: "playoffs",
          }),
          createGoalieCareerRow({
            name: "Beta Goalie",
            season: 2022,
            report_type: "playoffs",
            games: 8,
            wins: 5,
            saves: 210,
            shutouts: 1,
            assists: 1,
            points: 1,
            gaa: 2.1,
            save_percent: 0.926,
          }),
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
  });
});
