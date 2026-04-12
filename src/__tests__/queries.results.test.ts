jest.mock("../db/client", () => {
  const mockExecute = jest.fn();
  return {
    getDbClient: jest.fn(() => ({ execute: mockExecute })),
  };
});

import { getDbClient } from "../db/client.js";
import {
  getFinalsCategories,
  getFinalsMatchups,
  getPlayoffLeaderboard,
  getPlayoffSeasons,
  getRegularLeaderboard,
  getRegularSeasons,
  getTransactionLeaderboard,
  getTransactionSeasons,
} from "../db/queries.js";

const mockExecute = (getDbClient() as unknown as { execute: jest.Mock }).execute;

describe("db/queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("result and metadata queries", () => {
    describe("getPlayoffLeaderboard", () => {
      test("returns mapped leaderboard rows sorted by SQL order", async () => {
        const rows = [
          {
            team_id: "1",
            championships: 3,
            finals: 2,
            conference_finals: 2,
            second_round: 4,
            first_round: 2,
          },
          {
            team_id: "4",
            championships: 3,
            finals: 0,
            conference_finals: 4,
            second_round: 2,
            first_round: 4,
          },
        ];
        const expected = [
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
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getPlayoffLeaderboard();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("playoff_results"),
        );
        expect(result).toEqual(expected);
      });

      test("returns empty array when no playoff results exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getPlayoffLeaderboard();
        expect(result).toEqual([]);
      });
    });

    describe("getPlayoffSeasons", () => {
      test("returns per-team playoff seasons", async () => {
        const rows = [
          { team_id: "1", season: 2023, round: 2 },
          { team_id: "1", season: 2024, round: 5 },
        ];
        const expected = [
          { teamId: "1", season: 2023, round: 2 },
          { teamId: "1", season: 2024, round: 5 },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getPlayoffSeasons();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("FROM playoff_results"),
        );
        expect(result).toEqual(expected);
      });

      test("returns empty array when no playoff season rows exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getPlayoffSeasons();
        expect(result).toEqual([]);
      });
    });

    describe("getRegularLeaderboard", () => {
      test("returns mapped leaderboard rows sorted by SQL order", async () => {
        const rows = [
          {
            team_id: "1",
            seasons: 10,
            wins: 355,
            losses: 79,
            ties: 46,
            points: 756,
            div_wins: 86,
            div_losses: 24,
            div_ties: 10,
            regular_trophies: 3,
          },
          {
            team_id: "4",
            seasons: 10,
            wins: 319,
            losses: 105,
            ties: 56,
            points: 694,
            div_wins: 76,
            div_losses: 28,
            div_ties: 16,
            regular_trophies: 1,
          },
        ];
        const expected = [
          {
            teamId: "1",
            wins: 355,
            losses: 79,
            ties: 46,
            points: 756,
            divWins: 86,
            divLosses: 24,
            divTies: 10,
            regularTrophies: 3,
          },
          {
            teamId: "4",
            wins: 319,
            losses: 105,
            ties: 56,
            points: 694,
            divWins: 76,
            divLosses: 28,
            divTies: 16,
            regularTrophies: 1,
          },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getRegularLeaderboard();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("regular_results"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("is_regular_champion"),
        );
        expect(result).toEqual(expected);
      });

      test("returns empty array when no regular results exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getRegularLeaderboard();
        expect(result).toEqual([]);
      });
    });

    describe("getRegularSeasons", () => {
      test("returns mapped regular season rows", async () => {
        const rows = [
          {
            team_id: "1",
            season: 2024,
            is_regular_champion: 1,
            wins: 35,
            losses: 7,
            ties: 6,
            points: 76,
            div_wins: 8,
            div_losses: 2,
            div_ties: 2,
          },
        ];
        const expected = [
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
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getRegularSeasons();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("FROM regular_results"),
        );
        expect(result).toEqual(expected);
      });

      test("returns empty array when no regular season rows exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getRegularSeasons();
        expect(result).toEqual([]);
      });
    });

    describe("getTransactionLeaderboard", () => {
      test("returns mapped transaction leaderboard rows sorted by SQL order", async () => {
        const rows = [
          {
            team_id: "1",
            claims: 100,
            drops: 95,
            trades: 20,
            players: 140,
            goalies: 18,
          },
          {
            team_id: "4",
            claims: 99,
            drops: 80,
            trades: 20,
            players: 133,
            goalies: 16,
          },
        ];

        mockExecute.mockResolvedValue({ rows });

        const result = await getTransactionLeaderboard();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("claim_event_items"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("trade_source_blocks"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("SELECT DISTINCT"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("COUNT(DISTINCT player_id)"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("COUNT(DISTINCT goalie_id)"),
        );
        expect(result).toEqual([
          {
            teamId: "1",
            claims: 100,
            drops: 95,
            trades: 20,
            players: 140,
            goalies: 18,
          },
          {
            teamId: "4",
            claims: 99,
            drops: 80,
            trades: 20,
            players: 133,
            goalies: 16,
          },
        ]);
      });

      test("returns empty array when no transaction rows exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });

        const result = await getTransactionLeaderboard();

        expect(result).toEqual([]);
      });
    });

    describe("getTransactionSeasons", () => {
      test("returns mapped per-season transaction rows", async () => {
        const rows = [
          {
            team_id: "1",
            season: 2024,
            claims: 12,
            drops: 11,
            trades: 4,
            players: 30,
            goalies: 4,
          },
        ];

        mockExecute.mockResolvedValue({ rows });

        const result = await getTransactionSeasons();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("FROM transaction_counts"),
        );
        expect(result).toEqual([
          {
            teamId: "1",
            season: 2024,
            claims: 12,
            drops: 11,
            trades: 4,
            players: 30,
            goalies: 4,
          },
        ]);
      });

      test("returns empty array when no transaction season rows exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });

        const result = await getTransactionSeasons();

        expect(result).toEqual([]);
      });
    });

    describe("getFinalsMatchups", () => {
      test("returns mapped finals matchup rows with nested away and home teams", async () => {
        mockExecute.mockResolvedValue({
          rows: [
            {
              season: 2024,
              home_tiebreak_won: 0,
              winner_team_id: "4",
              away_team_id: "1",
              away_is_winner: 0,
              away_categories_won: 6,
              away_categories_lost: 8,
              away_categories_tied: 1,
              away_match_points: 6.5,
              away_played_games_total: 51,
              away_played_games_skaters: 50,
              away_played_games_goalies: 1,
              away_goals: 13,
              away_assists: 13,
              away_points: 26,
              away_plus_minus: 5,
              away_penalties: 14,
              away_shots: 135,
              away_ppp: 9,
              away_shp: 0,
              away_hits: 62,
              away_blocks: 34,
              away_wins: 0,
              away_saves: 17,
              away_shutouts: 0,
              away_gaa: null,
              away_save_percent: null,
              home_team_id: "4",
              home_is_winner: 1,
              home_categories_won: 8,
              home_categories_lost: 6,
              home_categories_tied: 1,
              home_match_points: 8.5,
              home_played_games_total: 52,
              home_played_games_skaters: 49,
              home_played_games_goalies: 3,
              home_goals: 8,
              home_assists: 18,
              home_points: 26,
              home_plus_minus: -8,
              home_penalties: 28,
              home_shots: 148,
              home_ppp: 9,
              home_shp: 0,
              home_hits: 73,
              home_blocks: 40,
              home_wins: 1,
              home_saves: 107,
              home_shutouts: 1,
              home_gaa: 3.23,
              home_save_percent: 0.907,
            },
          ],
        });

        const result = await getFinalsMatchups();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("FROM finals_matchups"),
        );
        expect(result).toEqual([
          {
            season: 2024,
            wonOnHomeTiebreak: false,
            winnerTeamId: "4",
            awayTeam: expect.objectContaining({
              teamId: "1",
              isWinner: false,
              totals: expect.objectContaining({
                saves: 17,
                gaa: null,
                savePercent: null,
              }),
            }),
            homeTeam: expect.objectContaining({
              teamId: "4",
              isWinner: true,
              totals: expect.objectContaining({
                gaa: 3.23,
                savePercent: 0.907,
              }),
            }),
          },
        ]);
      });
    });

    describe("getFinalsCategories", () => {
      test("returns mapped finals category rows in stat order", async () => {
        mockExecute.mockResolvedValue({
          rows: [
            {
              season: 2024,
              stat_key: "goals",
              away_value: 13,
              home_value: 8,
              winner_team_id: "1",
            },
            {
              season: 2024,
              stat_key: "savePercent",
              away_value: null,
              home_value: 0.907,
              winner_team_id: "4",
            },
          ],
        });

        const result = await getFinalsCategories();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("FROM finals_matchup_categories"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("WHEN 'savePercent' THEN"),
        );
        expect(result).toEqual([
          {
            season: 2024,
            statKey: "goals",
            awayValue: 13,
            homeValue: 8,
            winnerTeamId: "1",
          },
          {
            season: 2024,
            statKey: "savePercent",
            awayValue: null,
            homeValue: 0.907,
            winnerTeamId: "4",
          },
        ]);
      });
    });
  });
});
