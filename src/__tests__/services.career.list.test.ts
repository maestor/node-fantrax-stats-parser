import {
  getCareerGoaliesData,
  getCareerHighlightsData,
  getCareerPlayersData,
} from "../services";
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

    describe("getCareerHighlightsData", () => {
      const mockGetAllPlayerCareerRowsFromDb =
        getAllPlayerCareerRowsFromDb as jest.MockedFunction<
          typeof getAllPlayerCareerRowsFromDb
        >;
      const mockGetAllGoalieCareerRowsFromDb =
        getAllGoalieCareerRowsFromDb as jest.MockedFunction<
          typeof getAllGoalieCareerRowsFromDb
        >;

      test("builds most-teams-played highlights with mixed skater and goalie entries", async () => {
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "shared",
            name: "Shared Name",
            position: "D",
            team_id: "31",
            season: 2021,
            games: 1,
          }),
          createPlayerCareerRow({
            player_id: "shared",
            name: "Shared Name",
            position: "D",
            team_id: "2",
            season: 2022,
            games: 1,
          }),
          createPlayerCareerRow({
            player_id: "shared",
            name: "Shared Name",
            position: "D",
            team_id: "19",
            season: 2023,
            games: 1,
          }),
          createPlayerCareerRow({
            player_id: "shared",
            name: "Shared Name",
            position: "D",
            team_id: "1",
            season: 2024,
            games: 1,
          }),
          createPlayerCareerRow({
            player_id: "filtered",
            name: "Filtered Skater",
            position: "F",
            team_id: "1",
            season: 2024,
            games: 1,
          }),
          createPlayerCareerRow({
            player_id: "filtered",
            name: "Filtered Skater",
            position: "F",
            team_id: "2",
            season: 2023,
            games: 1,
          }),
        ]);
        mockGetAllGoalieCareerRowsFromDb.mockResolvedValue([
          createGoalieCareerRow({
            goalie_id: "g-top",
            name: "Top Goalie",
            team_id: "7",
            season: 2020,
            games: 1,
          }),
          createGoalieCareerRow({
            goalie_id: "g-top",
            name: "Top Goalie",
            team_id: "6",
            season: 2021,
            games: 1,
          }),
          createGoalieCareerRow({
            goalie_id: "g-top",
            name: "Top Goalie",
            team_id: "5",
            season: 2022,
            games: 1,
          }),
          createGoalieCareerRow({
            goalie_id: "g-top",
            name: "Top Goalie",
            team_id: "4",
            season: 2023,
            report_type: "playoffs",
            games: 1,
          }),
          createGoalieCareerRow({
            goalie_id: "g-top",
            name: "Top Goalie",
            team_id: "3",
            season: 2024,
            games: 1,
          }),
          createGoalieCareerRow({
            goalie_id: "shared",
            name: "Shared Name",
            team_id: "31",
            season: 2021,
            games: 1,
          }),
          createGoalieCareerRow({
            goalie_id: "shared",
            name: "Shared Name",
            team_id: "2",
            season: 2022,
            games: 1,
          }),
          createGoalieCareerRow({
            goalie_id: "shared",
            name: "Shared Name",
            team_id: "19",
            season: 2023,
            games: 1,
          }),
          createGoalieCareerRow({
            goalie_id: "shared",
            name: "Shared Name",
            team_id: "1",
            season: 2024,
            games: 1,
          }),
        ]);

        const result = await getCareerHighlightsData("most-teams-played");

        expect(result).toEqual([
          {
            id: "g-top",
            name: "Top Goalie",
            position: "G",
            teamCount: 5,
            teams: [
              { id: "7", name: "Edmonton Oilers" },
              { id: "6", name: "Detroit Red Wings" },
              { id: "5", name: "Montreal Canadiens" },
              { id: "4", name: "Vancouver Canucks" },
              { id: "3", name: "Calgary Flames" },
            ],
          },
          {
            id: "shared",
            name: "Shared Name",
            position: "D",
            teamCount: 4,
            teams: [
              { id: "31", name: "Utah Mammoth" },
              { id: "2", name: "Carolina Hurricanes" },
              { id: "19", name: "Toronto Maple Leafs" },
              { id: "1", name: "Colorado Avalanche" },
            ],
          },
          {
            id: "shared",
            name: "Shared Name",
            position: "G",
            teamCount: 4,
            teams: [
              { id: "31", name: "Utah Mammoth" },
              { id: "2", name: "Carolina Hurricanes" },
              { id: "19", name: "Toronto Maple Leafs" },
              { id: "1", name: "Colorado Avalanche" },
            ],
          },
        ]);
      });

      test("counts zero-game rows for most-teams-owned highlights", async () => {
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "p-owned",
            name: "Owned Skater",
            position: "F",
            team_id: "4",
            season: 2020,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p-owned",
            name: "Owned Skater",
            position: "F",
            team_id: "3",
            season: 2021,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p-owned",
            name: "Owned Skater",
            position: "F",
            team_id: "2",
            season: 2022,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p-owned",
            name: "Owned Skater",
            position: "F",
            team_id: "19",
            season: 2023,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p-owned",
            name: "Owned Skater",
            position: "F",
            team_id: "1",
            season: 2024,
            games: 1,
          }),
        ]);
        mockGetAllGoalieCareerRowsFromDb.mockResolvedValue([]);

        const result = await getCareerHighlightsData("most-teams-owned");

        expect(result).toEqual([
          {
            id: "p-owned",
            name: "Owned Skater",
            position: "F",
            teamCount: 5,
            teams: [
              { id: "4", name: "Vancouver Canucks" },
              { id: "3", name: "Calgary Flames" },
              { id: "2", name: "Carolina Hurricanes" },
              { id: "19", name: "Toronto Maple Leafs" },
              { id: "1", name: "Colorado Avalanche" },
            ],
          },
        ]);
      });

      test("sorts most-teams-owned highlight ties by name then id and orders teams by earliest season then team name", async () => {
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "p-alpha",
            name: "Alpha",
            position: "F",
            team_id: "4",
            season: 2022,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p-alpha",
            name: "Alpha",
            position: "F",
            team_id: "3",
            season: 2023,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p-alpha",
            name: "Alpha",
            position: "F",
            team_id: "1",
            season: 2024,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p-alpha",
            name: "Alpha",
            position: "F",
            team_id: "2",
            season: 2024,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p-alpha",
            name: "Alpha",
            position: "F",
            team_id: "19",
            season: 2022,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p001",
            name: "Beta",
            position: "F",
            team_id: "4",
            season: 2022,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p001",
            name: "Beta",
            position: "F",
            team_id: "3",
            season: 2023,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p001",
            name: "Beta",
            position: "F",
            team_id: "1",
            season: 2024,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p001",
            name: "Beta",
            position: "F",
            team_id: "2",
            season: 2024,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p001",
            name: "Beta",
            position: "F",
            team_id: "19",
            season: 2024,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p001",
            name: "Beta",
            position: "F",
            team_id: "19",
            season: 2022,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p001",
            name: "Beta",
            position: "F",
            team_id: "19",
            season: 2025,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p002",
            name: "Beta",
            position: "F",
            team_id: "4",
            season: 2022,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p002",
            name: "Beta",
            position: "F",
            team_id: "3",
            season: 2023,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p002",
            name: "Beta",
            position: "F",
            team_id: "1",
            season: 2024,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p002",
            name: "Beta",
            position: "F",
            team_id: "2",
            season: 2024,
            games: 0,
          }),
          createPlayerCareerRow({
            player_id: "p002",
            name: "Beta",
            position: "F",
            team_id: "19",
            season: 2022,
            games: 0,
          }),
        ]);
        mockGetAllGoalieCareerRowsFromDb.mockResolvedValue([]);

        const result = await getCareerHighlightsData("most-teams-owned");

        expect(result).toEqual([
          {
            id: "p-alpha",
            name: "Alpha",
            position: "F",
            teamCount: 5,
            teams: [
              { id: "19", name: "Toronto Maple Leafs" },
              { id: "4", name: "Vancouver Canucks" },
              { id: "3", name: "Calgary Flames" },
              { id: "2", name: "Carolina Hurricanes" },
              { id: "1", name: "Colorado Avalanche" },
            ],
          },
          {
            id: "p001",
            name: "Beta",
            position: "F",
            teamCount: 5,
            teams: [
              { id: "19", name: "Toronto Maple Leafs" },
              { id: "4", name: "Vancouver Canucks" },
              { id: "3", name: "Calgary Flames" },
              { id: "2", name: "Carolina Hurricanes" },
              { id: "1", name: "Colorado Avalanche" },
            ],
          },
          {
            id: "p002",
            name: "Beta",
            position: "F",
            teamCount: 5,
            teams: [
              { id: "19", name: "Toronto Maple Leafs" },
              { id: "4", name: "Vancouver Canucks" },
              { id: "3", name: "Calgary Flames" },
              { id: "2", name: "Carolina Hurricanes" },
              { id: "1", name: "Colorado Avalanche" },
            ],
          },
        ]);
      });

      test("builds same-team-seasons-played highlights with tied top teams", async () => {
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          ...Array.from({ length: 8 }, (_, index) =>
            createPlayerCareerRow({
              player_id: "shared",
              name: "Shared Same Team",
              position: "D",
              team_id: "1",
              season: 2017 + index,
              games: 1,
            }),
          ),
          ...Array.from({ length: 8 }, (_, index) =>
            createPlayerCareerRow({
              player_id: "p-tie",
              name: "Tie Skater",
              position: "D",
              team_id: "7",
              season: 2017 + index,
              report_type: index % 2 === 0 ? "regular" : "playoffs",
              games: 1,
            }),
          ),
          ...Array.from({ length: 8 }, (_, index) =>
            createPlayerCareerRow({
              player_id: "p-tie",
              name: "Tie Skater",
              position: "D",
              team_id: "19",
              season: 2017 + index,
              report_type: index % 2 === 0 ? "playoffs" : "regular",
              games: 1,
            }),
          ),
          createPlayerCareerRow({
            player_id: "p-tie",
            name: "Tie Skater",
            position: "D",
            team_id: "19",
            season: 2024,
            report_type: "regular",
            games: 1,
          }),
        ]);
        mockGetAllGoalieCareerRowsFromDb.mockResolvedValue([
          ...Array.from({ length: 8 }, (_, index) =>
            createGoalieCareerRow({
              goalie_id: "shared",
              name: "Shared Same Team",
              team_id: "1",
              season: 2017 + index,
              games: 1,
            }),
          ),
        ]);

        const result = await getCareerHighlightsData(
          "same-team-seasons-played",
        );

        expect(result).toEqual([
          {
            id: "shared",
            name: "Shared Same Team",
            position: "D",
            seasonCount: 8,
            team: { id: "1", name: "Colorado Avalanche" },
          },
          {
            id: "shared",
            name: "Shared Same Team",
            position: "G",
            seasonCount: 8,
            team: { id: "1", name: "Colorado Avalanche" },
          },
          {
            id: "p-tie",
            name: "Tie Skater",
            position: "D",
            seasonCount: 8,
            team: { id: "7", name: "Edmonton Oilers" },
          },
          {
            id: "p-tie",
            name: "Tie Skater",
            position: "D",
            seasonCount: 8,
            team: { id: "19", name: "Toronto Maple Leafs" },
          },
        ]);
      });

      test("counts zero-game seasons for same-team-seasons-owned and keeps under-threshold rows out", async () => {
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          ...Array.from({ length: 10 }, (_, index) =>
            createPlayerCareerRow({
              player_id: "p-owned-seasons",
              name: "Owned Seasons Skater",
              position: "F",
              team_id: "8",
              season: 2015 + index,
              games: 0,
            }),
          ),
          ...Array.from({ length: 9 }, (_, index) =>
            createPlayerCareerRow({
              player_id: "p-short",
              name: "Short Stay",
              position: "F",
              team_id: "9",
              season: 2016 + index,
              games: 0,
            }),
          ),
        ]);
        mockGetAllGoalieCareerRowsFromDb.mockResolvedValue([]);

        const result = await getCareerHighlightsData("same-team-seasons-owned");

        expect(result).toEqual([
          {
            id: "p-owned-seasons",
            name: "Owned Seasons Skater",
            position: "F",
            seasonCount: 10,
            team: { id: "8", name: "San Jose Sharks" },
          },
        ]);
      });

      test("sorts same-team highlight ties by id when name and team are otherwise equal", async () => {
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          ...Array.from({ length: 10 }, (_, index) =>
            createPlayerCareerRow({
              player_id: "p002",
              name: "Same Name",
              position: "F",
              team_id: "1",
              season: 2015 + index,
              games: 0,
            }),
          ),
          ...Array.from({ length: 10 }, (_, index) =>
            createPlayerCareerRow({
              player_id: "p001",
              name: "Same Name",
              position: "F",
              team_id: "1",
              season: 2015 + index,
              games: 0,
            }),
          ),
        ]);
        mockGetAllGoalieCareerRowsFromDb.mockResolvedValue([]);

        const result = await getCareerHighlightsData("same-team-seasons-owned");

        expect(result).toEqual([
          {
            id: "p001",
            name: "Same Name",
            position: "F",
            seasonCount: 10,
            team: { id: "1", name: "Colorado Avalanche" },
          },
          {
            id: "p002",
            name: "Same Name",
            position: "F",
            seasonCount: 10,
            team: { id: "1", name: "Colorado Avalanche" },
          },
        ]);
      });

      test("throws when a player highlight row is missing position", async () => {
        mockGetAllPlayerCareerRowsFromDb.mockResolvedValue([
          createPlayerCareerRow({
            player_id: "p-broken",
            name: "Broken Highlight Skater",
            position: null,
            team_id: "1",
            games: 1,
          }),
        ]);
        mockGetAllGoalieCareerRowsFromDb.mockResolvedValue([]);

        await expect(
          getCareerHighlightsData("most-teams-played"),
        ).rejects.toThrow("Player position missing");
      });
    });
  });
});
