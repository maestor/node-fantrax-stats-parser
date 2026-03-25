jest.mock("../db/client", () => {
  const mockExecute = jest.fn();
  return {
    getDbClient: jest.fn(() => ({ execute: mockExecute })),
  };
});

import { getDbClient } from "../db/client.js";
import {
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
  });
});
