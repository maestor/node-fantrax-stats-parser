import {
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
  getTransactionLeaderboardData,
} from "../services";
import {
  getPlayoffLeaderboard,
  getPlayoffSeasons,
  getRegularLeaderboard,
  getRegularSeasons,
  getTransactionLeaderboard,
  getTransactionSeasons,
} from "../db/queries";
import { TEAMS } from "../constants";

jest.mock("../db/queries");

describe("services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("leaderboard services", () => {
    describe("getPlayoffLeaderboardData", () => {
      const mockGetPlayoffLeaderboard =
        getPlayoffLeaderboard as jest.MockedFunction<typeof getPlayoffLeaderboard>;
      const mockGetPlayoffSeasons =
        getPlayoffSeasons as jest.MockedFunction<typeof getPlayoffSeasons>;

      beforeEach(() => {
        mockGetPlayoffSeasons.mockResolvedValue([]);
      });

      test("resolves teamName from TEAMS and sets tieRank false for non-tied entries", async () => {
        mockGetPlayoffLeaderboard.mockResolvedValue([
          {
            teamId: "1",
            championships: 3,
            finals: 2,
            conferenceFinals: 2,
            secondRound: 4,
            firstRound: 2,
          },
          {
            teamId: "4",
            championships: 3,
            finals: 0,
            conferenceFinals: 4,
            secondRound: 2,
            firstRound: 4,
          },
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
          {
            teamId: "1",
            championships: 1,
            finals: 0,
            conferenceFinals: 0,
            secondRound: 0,
            firstRound: 3,
          },
          {
            teamId: "15",
            championships: 1,
            finals: 0,
            conferenceFinals: 0,
            secondRound: 0,
            firstRound: 3,
          },
        ]);

        const result = await getPlayoffLeaderboardData();

        expect(result[0].appearances).toBe(4);
        expect(result[1].appearances).toBe(4);
        expect(result[0].tieRank).toBe(false);
        expect(result[1].tieRank).toBe(true);
      });

      test("first entry is always tieRank false", async () => {
        mockGetPlayoffLeaderboard.mockResolvedValue([
          {
            teamId: "1",
            championships: 5,
            finals: 0,
            conferenceFinals: 0,
            secondRound: 0,
            firstRound: 0,
          },
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
          {
            teamId: "1",
            championships: 2,
            finals: 1,
            conferenceFinals: 1,
            secondRound: 2,
            firstRound: 3,
          },
        ]);

        const result = await getPlayoffLeaderboardData();

        expect(result).toHaveLength(TEAMS.length);
        const missing = result.filter((entry) => entry.teamId !== "1");
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
          {
            teamId: "999",
            championships: 1,
            finals: 0,
            conferenceFinals: 0,
            secondRound: 0,
            firstRound: 0,
          },
        ]);

        const result = await getPlayoffLeaderboardData();

        expect(result[0].teamName).toBe("999");
      });

      test("adds season breakdown with notQualified defaults within latest playoff season", async () => {
        mockGetPlayoffLeaderboard.mockResolvedValue([
          {
            teamId: "1",
            championships: 1,
            finals: 0,
            conferenceFinals: 0,
            secondRound: 0,
            firstRound: 0,
          },
        ]);
        mockGetPlayoffSeasons.mockResolvedValue([
          { teamId: "1", season: 2012, round: 1 },
          { teamId: "1", season: 2013, round: 5 },
        ]);

        const result = await getPlayoffLeaderboardData();
        const colorado = result.find((entry) => entry.teamId === "1");

        expect(colorado).toBeDefined();
        expect(colorado?.seasons[0]).toEqual({
          season: 2012,
          round: 1,
          key: "firstRound",
        });
        expect(colorado?.seasons[1]).toEqual({
          season: 2013,
          round: 5,
          key: "championship",
        });
        expect(colorado?.seasons).toHaveLength(2);
      });

      test("uses team firstSeason for playoff season breakdown", async () => {
        mockGetPlayoffLeaderboard.mockResolvedValue([
          {
            teamId: "32",
            championships: 0,
            finals: 0,
            conferenceFinals: 0,
            secondRound: 0,
            firstRound: 1,
          },
        ]);
        mockGetPlayoffSeasons.mockResolvedValue([
          { teamId: "32", season: 2018, round: 1 },
        ]);

        const result = await getPlayoffLeaderboardData();
        const vegas = result.find((entry) => entry.teamId === "32");

        expect(vegas).toBeDefined();
        expect(vegas?.seasons[0].season).toBe(2017);
        expect(vegas?.seasons[0].key).toBe("notQualified");
        expect(vegas?.seasons[1]).toEqual({
          season: 2018,
          round: 1,
          key: "firstRound",
        });
      });

      test("maps playoff round keys for final, conferenceFinal and secondRound", async () => {
        mockGetPlayoffLeaderboard.mockResolvedValue([
          {
            teamId: "1",
            championships: 0,
            finals: 1,
            conferenceFinals: 1,
            secondRound: 1,
            firstRound: 0,
          },
        ]);
        mockGetPlayoffSeasons.mockResolvedValue([
          { teamId: "1", season: 2012, round: 4 },
          { teamId: "1", season: 2013, round: 3 },
          { teamId: "1", season: 2014, round: 2 },
        ]);

        const result = await getPlayoffLeaderboardData();
        const colorado = result.find((entry) => entry.teamId === "1");

        expect(colorado).toBeDefined();
        expect(colorado?.seasons[0]).toEqual({
          season: 2012,
          round: 4,
          key: "final",
        });
        expect(colorado?.seasons[1]).toEqual({
          season: 2013,
          round: 3,
          key: "conferenceFinal",
        });
        expect(colorado?.seasons[2]).toEqual({
          season: 2014,
          round: 2,
          key: "secondRound",
        });
      });
    });

    describe("getRegularLeaderboardData", () => {
      const mockGetRegularLeaderboard =
        getRegularLeaderboard as jest.MockedFunction<typeof getRegularLeaderboard>;
      const mockGetRegularSeasons =
        getRegularSeasons as jest.MockedFunction<typeof getRegularSeasons>;

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

        expect(result[0].winPercent).toBe(
          Math.round((355 / (355 + 79 + 46)) * 1000) / 1000,
        );
      });

      test("calculates divWinPercent correctly (3 decimal places)", async () => {
        mockGetRegularLeaderboard.mockResolvedValue([baseRow]);

        const result = await getRegularLeaderboardData();

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

        await expect(getRegularLeaderboardData()).resolves.toEqual([]);
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

    describe("getTransactionLeaderboardData", () => {
      const mockGetTransactionLeaderboard =
        getTransactionLeaderboard as jest.MockedFunction<
          typeof getTransactionLeaderboard
        >;
      const mockGetTransactionSeasons =
        getTransactionSeasons as jest.MockedFunction<
          typeof getTransactionSeasons
        >;

      beforeEach(() => {
        mockGetTransactionSeasons.mockResolvedValue([]);
      });

      test("resolves teamName from TEAMS and sets tieRank false for first entry", async () => {
        mockGetTransactionLeaderboard.mockResolvedValue([
          {
            teamId: "1",
            claims: 50,
            drops: 48,
            trades: 12,
          },
        ]);

        const result = await getTransactionLeaderboardData();

        expect(result[0]).toMatchObject({
          teamId: "1",
          teamName: "Colorado Avalanche",
          claims: 50,
          drops: 48,
          trades: 12,
          seasons: [],
          tieRank: false,
        });
      });

      test("sets tieRank true when claims, drops, and trades match previous entry", async () => {
        mockGetTransactionLeaderboard.mockResolvedValue([
          {
            teamId: "1",
            claims: 40,
            drops: 39,
            trades: 11,
          },
          {
            teamId: "4",
            claims: 40,
            drops: 39,
            trades: 11,
          },
        ]);

        const result = await getTransactionLeaderboardData();

        expect(result[0].tieRank).toBe(false);
        expect(result[1].tieRank).toBe(true);
      });

      test("falls back to teamId when team is not found in TEAMS", async () => {
        mockGetTransactionLeaderboard.mockResolvedValue([
          {
            teamId: "999",
            claims: 3,
            drops: 2,
            trades: 1,
          },
        ]);

        const result = await getTransactionLeaderboardData();

        expect(result[0].teamName).toBe("999");
      });

      test("adds zero rows for teams missing from transaction data", async () => {
        mockGetTransactionLeaderboard.mockResolvedValue([
          {
            teamId: "1",
            claims: 50,
            drops: 48,
            trades: 12,
          },
        ]);

        const result = await getTransactionLeaderboardData();
        const missingTeam = TEAMS.find((entry) => entry.id === "7");
        const missingRow = result.find((entry) => entry.teamId === "7");

        expect(result).toHaveLength(TEAMS.length);
        expect(missingRow).toEqual(
          expect.objectContaining({
            teamId: "7",
            teamName: missingTeam?.presentName,
            claims: 0,
            drops: 0,
            trades: 0,
            seasons: [],
          }),
        );
      });

      test("returns all TEAMS with zero values when no transaction data exists", async () => {
        mockGetTransactionLeaderboard.mockResolvedValue([]);

        const result = await getTransactionLeaderboardData();

        expect(result).toHaveLength(TEAMS.length);
        expect(result[0]).toMatchObject({
          claims: 0,
          drops: 0,
          trades: 0,
          seasons: [],
          tieRank: false,
        });
        expect(result[1].tieRank).toBe(true);
      });

      test("adds per-season transaction breakdown for each team", async () => {
        mockGetTransactionLeaderboard.mockResolvedValue([
          {
            teamId: "1",
            claims: 9,
            drops: 8,
            trades: 3,
          },
        ]);
        mockGetTransactionSeasons.mockResolvedValue([
          {
            teamId: "1",
            season: 2024,
            claims: 4,
            drops: 3,
            trades: 1,
          },
          {
            teamId: "1",
            season: 2025,
            claims: 5,
            drops: 5,
            trades: 2,
          },
        ]);

        const result = await getTransactionLeaderboardData();

        expect(result[0].seasons).toEqual([
          {
            season: 2024,
            claims: 4,
            drops: 3,
            trades: 1,
          },
          {
            season: 2025,
            claims: 5,
            drops: 5,
            trades: 2,
          },
        ]);
      });
    });
  });
});
