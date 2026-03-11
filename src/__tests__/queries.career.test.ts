jest.mock("../db/client", () => {
  const mockExecute = jest.fn();
  return {
    getDbClient: jest.fn(() => ({ execute: mockExecute })),
  };
});

import { getDbClient } from "../db/client";
import {
  getAllGoalieCareerRowsFromDb,
  getAllPlayerCareerRowsFromDb,
  getGoalieCareerRowsFromDb,
  getPlayerCareerRowsFromDb,
} from "../db/queries";

const mockExecute = (getDbClient() as unknown as { execute: jest.Mock }).execute;

describe("db/queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("career queries", () => {
    describe("getPlayerCareerRowsFromDb", () => {
      test("returns career player rows without filtering zero-game records", async () => {
        mockExecute.mockResolvedValue({
          rows: [
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
          ],
        });

        const result = await getPlayerCareerRowsFromDb("p001");

        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.not.stringContaining("games > 0"),
          args: ["p001"],
        });
        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining(
            "CASE report_type WHEN 'regular' THEN 0 ELSE 1 END",
          ),
          args: ["p001"],
        });
        expect(result).toEqual([
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
        ]);
      });

      test("returns empty array when no career player rows exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getPlayerCareerRowsFromDb("missing");
        expect(result).toEqual([]);
      });
    });

    describe("getGoalieCareerRowsFromDb", () => {
      test("returns career goalie rows without filtering zero-game records", async () => {
        mockExecute.mockResolvedValue({
          rows: [
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
          ],
        });

        const result = await getGoalieCareerRowsFromDb("g001");

        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.not.stringContaining("games > 0"),
          args: ["g001"],
        });
        expect(mockExecute).toHaveBeenCalledWith({
          sql: expect.stringContaining(
            "CASE report_type WHEN 'regular' THEN 0 ELSE 1 END",
          ),
          args: ["g001"],
        });
        expect(result).toEqual([
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
        ]);
      });

      test("returns empty array when no career goalie rows exist", async () => {
        mockExecute.mockResolvedValue({ rows: [] });
        const result = await getGoalieCareerRowsFromDb("missing");
        expect(result).toEqual([]);
      });
    });

    describe("getAllPlayerCareerRowsFromDb", () => {
      test("returns all player career rows without filtering zero-game records", async () => {
        mockExecute.mockResolvedValue({
          rows: [
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
          ],
        });

        const result = await getAllPlayerCareerRowsFromDb();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.not.stringContaining("games > 0"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("ORDER BY name ASC"),
        );
        expect(result).toEqual([
          expect.objectContaining({
            player_id: "p001",
            report_type: "regular",
            games: 0,
          }),
        ]);
      });
    });

    describe("getAllGoalieCareerRowsFromDb", () => {
      test("returns all goalie career rows without filtering zero-game records", async () => {
        mockExecute.mockResolvedValue({
          rows: [
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
          ],
        });

        const result = await getAllGoalieCareerRowsFromDb();

        expect(mockExecute).toHaveBeenCalledWith(
          expect.not.stringContaining("games > 0"),
        );
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining("ORDER BY name ASC"),
        );
        expect(result).toEqual([
          expect.objectContaining({
            goalie_id: "g001",
            report_type: "playoffs",
            games: 0,
          }),
        ]);
      });
    });
  });
});
