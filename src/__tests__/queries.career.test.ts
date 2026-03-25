jest.mock("../db/client", () => {
  const mockExecute = jest.fn();
  return {
    getDbClient: jest.fn(() => ({ execute: mockExecute })),
  };
});

import { getDbClient } from "../db/client.js";
import {
  getAllGoalieCareerRowsFromDb,
  getAllPlayerCareerRowsFromDb,
  getClaimTransactionHighlightRowsFromDb,
  getDropTransactionHighlightRowsFromDb,
  getGoalieCareerRowsFromDb,
  getPlayerCareerRowsFromDb,
  getReunionTransactionHighlightRowsFromDb,
  getTradeTransactionHighlightRowsFromDb,
} from "../db/queries.js";

const mockExecute = (getDbClient() as unknown as { execute: jest.Mock }).execute;

describe("db/queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("career queries", () => {
    describe("getPlayerCareerRowsFromDb", () => {
      test("returns career player rows without filtering zero-game records", async () => {
        const rows = [
          {
            player_id: "p001",
            name: "Connor McDavid",
            position: "F",
            team_id: "1",
            season: 2024,
            report_type: "regular",
            games: 0,
            goals: 0,
            assists: 0,
            points: 0,
            plus_minus: 0,
            penalties: 0,
            shots: 0,
            ppp: 0,
            shp: 0,
            hits: 0,
            blocks: 0,
          },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getPlayerCareerRowsFromDb("p001");

        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.not.stringContaining("games > 0"),
          args: ["p001"],
        });
        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining("LEFT JOIN fantrax_entities fe"),
          args: ["p001"],
        });
        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining("COALESCE(fe.name, p.name) AS name"),
          args: ["p001"],
        });
        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining("COALESCE(fe.position, p.position) AS position"),
          args: ["p001"],
        });
        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining(
            "CASE p.report_type WHEN 'regular' THEN 0 ELSE 1 END",
          ),
          args: ["p001"],
        });
        expect(result).toEqual(rows);
      });

      test("returns empty array when no career player rows exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getPlayerCareerRowsFromDb("missing");
        expect(result).toEqual([]);
      });
    });

    describe("getGoalieCareerRowsFromDb", () => {
      test("returns career goalie rows without filtering zero-game records", async () => {
        const rows = [
          {
            goalie_id: "g001",
            name: "Carey Price",
            team_id: "2",
            season: 2023,
            report_type: "playoffs",
            games: 0,
            wins: 0,
            saves: 0,
            shutouts: 0,
            goals: 0,
            assists: 0,
            points: 0,
            penalties: 0,
            ppp: 0,
            shp: 0,
            gaa: null,
            save_percent: null,
          },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getGoalieCareerRowsFromDb("g001");

        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.not.stringContaining("games > 0"),
          args: ["g001"],
        });
        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining("LEFT JOIN fantrax_entities fe"),
          args: ["g001"],
        });
        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining("COALESCE(fe.name, g.name) AS name"),
          args: ["g001"],
        });
        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining(
            "CASE g.report_type WHEN 'regular' THEN 0 ELSE 1 END",
          ),
          args: ["g001"],
        });
        expect(result).toEqual(rows);
      });

      test("returns empty array when no career goalie rows exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getGoalieCareerRowsFromDb("missing");
        expect(result).toEqual([]);
      });
    });

    describe("getAllPlayerCareerRowsFromDb", () => {
      test("returns all player career rows without filtering zero-game records", async () => {
        const rows = [
          {
            player_id: "p001",
            name: "Connor McDavid",
            position: "F",
            team_id: "1",
            season: 2024,
            report_type: "regular",
            games: 0,
            goals: 0,
            assists: 0,
            points: 0,
            plus_minus: 0,
            penalties: 0,
            shots: 0,
            ppp: 0,
            shp: 0,
            hits: 0,
            blocks: 0,
          },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getAllPlayerCareerRowsFromDb();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.not.stringContaining("games > 0"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("LEFT JOIN fantrax_entities fe"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("COALESCE(fe.name, p.name) AS name"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("ORDER BY name ASC"),
        );
        expect(result).toEqual(rows);
      });
    });

    describe("getAllGoalieCareerRowsFromDb", () => {
      test("returns all goalie career rows without filtering zero-game records", async () => {
        const rows = [
          {
            goalie_id: "g001",
            name: "Carey Price",
            team_id: "2",
            season: 2024,
            report_type: "playoffs",
            games: 0,
            wins: 0,
            saves: 0,
            shutouts: 0,
            goals: 0,
            assists: 0,
            points: 0,
            penalties: 0,
            ppp: 0,
            shp: 0,
            gaa: null,
            save_percent: null,
          },
        ];

        mockExecute.mockResolvedValue({
          rows,
        });

        const result = await getAllGoalieCareerRowsFromDb();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.not.stringContaining("games > 0"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("LEFT JOIN fantrax_entities fe"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("COALESCE(fe.name, g.name) AS name"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("ORDER BY name ASC"),
        );
        expect(result).toEqual(rows);
      });
    });

    describe("getClaimTransactionHighlightRowsFromDb", () => {
      test("returns grouped matched claim rows with canonical metadata", async () => {
        const rows = [
          {
            entity_id: "p-claim",
            name: "Claim King",
            position: "F",
            team_id: "7",
            transaction_count: 3,
          },
        ];

        mockExecute.mockResolvedValue({ rows });

        const result = await getClaimTransactionHighlightRowsFromDb();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("FROM claim_event_items cei"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("cei.action_type = 'claim'"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("LEFT JOIN fantrax_entities fe"),
        );
        expect(result).toEqual([
          {
            id: "p-claim",
            name: "Claim King",
            position: "F",
            teamId: "7",
            transactionCount: 3,
          },
        ]);
      });
    });

    describe("getDropTransactionHighlightRowsFromDb", () => {
      test("returns grouped matched drop rows", async () => {
        const rows = [
          {
            entity_id: "g-drop",
            name: "Drop Goalie",
            position: "G",
            team_id: "5",
            transaction_count: 4,
          },
        ];

        mockExecute.mockResolvedValue({ rows });

        const result = await getDropTransactionHighlightRowsFromDb();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("cei.action_type = 'drop'"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("cei.fantrax_entity_id IS NOT NULL"),
        );
        expect(result).toEqual([
          {
            id: "g-drop",
            name: "Drop Goalie",
            position: "G",
            teamId: "5",
            transactionCount: 4,
          },
        ]);
      });
    });

    describe("getTradeTransactionHighlightRowsFromDb", () => {
      test("returns traded-away rows grouped by source team", async () => {
        const rows = [
          {
            entity_id: "p-trade",
            name: "Trade Skater",
            position: "D",
            team_id: "1",
            transaction_count: 5,
          },
        ];

        mockExecute.mockResolvedValue({ rows });

        const result = await getTradeTransactionHighlightRowsFromDb();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("FROM trade_block_items tbi"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("tbi.from_team_id AS team_id"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("tbi.asset_type = 'player'"),
        );
        expect(result).toEqual([
          {
            id: "p-trade",
            name: "Trade Skater",
            position: "D",
            teamId: "1",
            transactionCount: 5,
          },
        ]);
      });
    });

    describe("getReunionTransactionHighlightRowsFromDb", () => {
      test("returns matched claim and trade-in reunion rows after the first drop", async () => {
        const rows = [
          {
            entity_id: "p-reunion",
            name: "Reunion Skater",
            position: "F",
            team_id: "7",
            reunion_date: "2024-10-09T13:19:00.000Z",
            reunion_type: "claim",
          },
          {
            entity_id: "p-reunion",
            name: "Reunion Skater",
            position: "F",
            team_id: "7",
            reunion_date: "2025-01-15T06:10:00.000Z",
            reunion_type: "trade",
          },
        ];

        mockExecute.mockResolvedValue({ rows });

        const result = await getReunionTransactionHighlightRowsFromDb();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("WITH drop_baselines AS"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("cei.action_type = 'drop'"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("cei.action_type = 'claim'"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("tbi.to_team_id AS team_id"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("tsb.occurred_at > db.first_drop_at"),
        );
        expect(result).toEqual([
          {
            id: "p-reunion",
            name: "Reunion Skater",
            position: "F",
            teamId: "7",
            date: "2024-10-09T13:19:00.000Z",
            type: "claim",
          },
          {
            id: "p-reunion",
            name: "Reunion Skater",
            position: "F",
            teamId: "7",
            date: "2025-01-15T06:10:00.000Z",
            type: "trade",
          },
        ]);
      });
    });
  });
});
