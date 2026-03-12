import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  buildClaimEvents,
  buildTradeImportData,
  createTransactionEntityResolver,
  importTransactionsToDb,
  parseDraftPickAsset,
  parseTransactionDateToIso,
  resolveTransactionTeamId,
} from "../../scripts/transaction-import-lib";
import { createIntegrationDb } from "./integration-db";

const getCount = async (
  db: Awaited<ReturnType<typeof createIntegrationDb>>["db"],
  sql: string,
): Promise<number> => {
  const result = await db.execute(sql);
  return Number(
    (result.rows[0] as unknown as { count: number | string | bigint }).count,
  );
};

const writeCsv = async (
  dir: string,
  fileName: string,
  lines: readonly string[],
): Promise<void> => {
  await fs.writeFile(path.join(dir, fileName), lines.join("\n"), "utf8");
};

describe("transaction import helpers", () => {
  test("parses transaction dates, draft picks, and fantasy team aliases", () => {
    expect(parseTransactionDateToIso("Thu Mar 5, 2026, 12:38PM")).toBe(
      "2026-03-05T16:38:00.000Z",
    );
    expect(
      parseDraftPickAsset("2026 Draft Pick, Round 3 (Buffalo Sabres)"),
    ).toEqual({
      draftSeason: 2026,
      draftRound: 3,
      draftOriginalTeamId: "21",
    });
    expect(parseDraftPickAsset("Future Considerations")).toBeNull();
    expect(resolveTransactionTeamId("Arizona Coyotes")).toBe("31");
    expect(resolveTransactionTeamId("Unknown Team")).toBeNull();
  });

  test("resolves entities by exact match, team context, ambiguity, and multi-position inputs", async () => {
    const context = await createIntegrationDb();

    try {
      await context.insertPlayers([
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          playerId: "p-exact",
          name: "Exact Match",
          position: "F",
        },
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          playerId: "p-apostrophe",
          name: "Cal OReilly",
          position: "F",
        },
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          playerId: "p-jack-a",
          name: "Jack Hughes",
          position: "F",
        },
        {
          teamId: "19",
          season: 2025,
          reportType: "regular",
          playerId: "p-jack-b",
          name: "Jack Hughes",
          position: "F",
        },
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          playerId: "p-flex",
          name: "Flex Defender",
          position: "D",
        },
        {
          teamId: "1",
          season: 2020,
          reportType: "regular",
          playerId: "p-viel-legacy",
          name: "Jeffrey Viel",
          position: "F",
        },
        {
          teamId: "1",
          season: 2020,
          reportType: "regular",
          playerId: "p-viel-current",
          name: "Jeffrey Viel",
          position: "F",
        },
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          playerId: "p-viel-current",
          name: "Jeffrey Viel",
          position: "F",
        },
      ]);
      await context.insertGoalies([
        {
          teamId: "2",
          season: 2025,
          reportType: "regular",
          goalieId: "g-amb-a",
          name: "Goalie Clash",
        },
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          goalieId: "g-amb-b",
          name: "Goalie Clash",
        },
      ]);

      const resolver = createTransactionEntityResolver(context.db);

      await expect(
        resolver.resolveEntity({
          name: "Exact Match",
          rawPosition: "F",
          season: 2025,
          teamIds: ["7"],
        }),
      ).resolves.toEqual({
        fantraxEntityId: "p-exact",
        matchStatus: "matched",
        matchStrategy: "exact_name_position",
      });

      await expect(
        resolver.resolveEntity({
          name: "Cal O'Reilly",
          rawPosition: "F",
          season: 2025,
          teamIds: ["7"],
        }),
      ).resolves.toEqual({
        fantraxEntityId: "p-apostrophe",
        matchStatus: "matched",
        matchStrategy: "exact_name_position",
      });

      await expect(
        resolver.resolveEntity({
          name: "Jack Hughes",
          rawPosition: "F",
          season: 2025,
          teamIds: ["7"],
        }),
      ).resolves.toEqual({
        fantraxEntityId: "p-jack-a",
        matchStatus: "matched",
        matchStrategy: "season_team_context",
      });

      await expect(
        resolver.resolveEntity({
          name: "Jack Hughes",
          rawPosition: "F",
          season: 2025,
          teamIds: ["7", "19"],
        }),
      ).resolves.toEqual({
        fantraxEntityId: null,
        matchStatus: "unresolved_ambiguous_entity",
        matchStrategy: "season_team_context",
      });

      await expect(
        resolver.resolveEntity({
          name: "Jeffrey Viel",
          rawPosition: "F",
          season: 2020,
          teamIds: ["1"],
        }),
      ).resolves.toEqual({
        fantraxEntityId: "p-viel-current",
        matchStatus: "matched",
        matchStrategy: "season_team_context",
      });

      await expect(
        resolver.resolveEntity({
          name: "Jeffrey Viel",
          rawPosition: "F",
          season: 2025,
          teamIds: ["6"],
        }),
      ).resolves.toEqual({
        fantraxEntityId: "p-viel-current",
        matchStatus: "matched",
        matchStrategy: "season_team_context",
      });

      await expect(
        resolver.resolveEntity({
          name: "Missing Player",
          rawPosition: "F",
          season: 2025,
          teamIds: ["7"],
        }),
      ).resolves.toEqual({
        fantraxEntityId: null,
        matchStatus: "unresolved_missing_entity",
        matchStrategy: "exact_name_position",
      });

      await expect(
        resolver.resolveEntity({
          name: "Flex Defender",
          rawPosition: "F,D",
          season: 2025,
          teamIds: ["7"],
        }),
      ).resolves.toEqual({
        fantraxEntityId: "p-flex",
        matchStatus: "matched",
        matchStrategy: "exact_name_position",
      });

      await expect(
        resolver.resolveEntity({
          name: "Missing Position",
          rawPosition: null,
          season: 2025,
          teamIds: ["7"],
        }),
      ).resolves.toEqual({
        fantraxEntityId: null,
        matchStatus: "unresolved_missing_entity",
        matchStrategy: "exact_name_position",
      });
    } finally {
      await context.cleanup();
    }
  });

  test("builds claim events, preserves source group indexes, and ignores lineup-only groups", async () => {
    const context = await createIntegrationDb();

    try {
      await context.insertPlayers([
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          playerId: "p-claim",
          name: "Claim Target",
          position: "F",
        },
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          playerId: "p-drop",
          name: "Drop Target",
          position: "D",
        },
      ]);

      const resolver = createTransactionEntityResolver(context.db);
      const result = await buildClaimEvents({
        season: 2025,
        sourceFile: "claims-2025-2026.csv",
        resolver,
        rows: [
          {
            Player: "Claim Target",
            Position: "F",
            Type: "Claim",
            Team: "Edmonton Oilers",
            "Date (EDT)": "Thu Mar 5, 2026, 12:38PM",
            Period: "150",
          },
          {
            Player: "Drop Target",
            Position: "D",
            Type: "Drop",
            Team: "Edmonton Oilers",
            "Date (EDT)": "Thu Mar 5, 2026, 12:38PM",
            Period: "150",
          },
          {
            Player: "Bench Guy",
            Position: "F",
            Type: "Lineup Change",
            Team: "Edmonton Oilers",
            "Date (EDT)": "Thu Mar 5, 2026, 12:38PM",
            Period: "150",
          },
          {
            Player: "Lineup Only",
            Position: "F",
            Type: "Lineup Change",
            Team: "Edmonton Oilers",
            "Date (EDT)": "Wed Mar 4, 2026, 12:38PM",
            Period: "149",
          },
          {
            Player: "Missing Claim",
            Position: "F",
            Type: "Claim",
            Team: "Toronto Maple Leafs",
            "Date (EDT)": "Tue Mar 3, 2026, 12:38PM",
            Period: "148",
          },
        ],
      });

      expect(result.ignoredLineupChanges).toBe(2);
      expect(result.events).toHaveLength(2);
      expect(result.events[0]).toMatchObject({
        teamId: "7",
        sourceGroupIndex: 0,
      });
      expect(result.events[0].items).toEqual([
        expect.objectContaining({
          sequence: 0,
          actionType: "claim",
          fantraxEntityId: "p-claim",
          matchStatus: "matched",
        }),
        expect.objectContaining({
          sequence: 1,
          actionType: "drop",
          fantraxEntityId: "p-drop",
          matchStatus: "matched",
        }),
      ]);
      expect(result.events[1]).toMatchObject({
        teamId: "19",
        sourceGroupIndex: 2,
      });
      expect(result.events[1].items[0]).toMatchObject({
        rawName: "Missing Claim",
        fantraxEntityId: null,
        matchStatus: "unresolved_missing_entity",
      });
    } finally {
      await context.cleanup();
    }
  });

  test("builds trade blocks, converts drop rows, and ignores commissioner fixes", async () => {
    const context = await createIntegrationDb();

    try {
      await context.insertPlayers([
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          playerId: "p-send",
          name: "Send Skater",
          position: "F",
        },
        {
          teamId: "16",
          season: 2025,
          reportType: "regular",
          playerId: "p-return",
          name: "Return Skater",
          position: "D",
        },
      ]);
      await context.insertGoalies([
        {
          teamId: "16",
          season: 2025,
          reportType: "regular",
          goalieId: "g-drop",
          name: "Forced Drop",
        },
      ]);

      const resolver = createTransactionEntityResolver(context.db);
      const result = await buildTradeImportData({
        season: 2025,
        sourceFile: "trades-2025-2026.csv",
        resolver,
        rows: [
          {
            Player: "Send Skater",
            Position: "F",
            From: "Edmonton Oilers",
            To: "Tampa Bay Lightning",
            "Date (EDT)": "Thu Mar 5, 2026, 12:38PM",
            Period: "150",
          },
          {
            Player: "2026 Draft Pick, Round 3 (Buffalo Sabres)",
            Position: "",
            From: "Edmonton Oilers",
            To: "Tampa Bay Lightning",
            "Date (EDT)": "Thu Mar 5, 2026, 12:38PM",
            Period: "150",
          },
          {
            Player: "Return Skater",
            Position: "D",
            From: "Tampa Bay Lightning",
            To: "Edmonton Oilers",
            "Date (EDT)": "Thu Mar 5, 2026, 12:38PM",
            Period: "151",
          },
          {
            Player: "Future Considerations",
            Position: "",
            From: "Tampa Bay Lightning",
            To: "Edmonton Oilers",
            "Date (EDT)": "Thu Mar 5, 2026, 12:38PM",
            Period: "151",
          },
          {
            Player: "Forced Drop",
            Position: "G",
            From: "Tampa Bay Lightning",
            To: "(Drop)",
            "Date (EDT)": "Thu Mar 5, 2026, 12:38PM",
            Period: "151",
          },
          {
            Player: "Commissioner Fix",
            Position: "F",
            From: "Calgary Flames",
            To: "Vegas Golden Knights",
            "Date (EDT)": "Wed Mar 4, 2026, 12:38PM",
            Period: "149",
          },
        ],
      });

      expect(result.ignoredCommissionerBlocks).toBe(1);
      expect(result.dropEvents).toHaveLength(1);
      expect(result.dropEvents[0]).toMatchObject({
        teamId: "16",
      });
      expect(result.dropEvents[0].items[0]).toMatchObject({
        actionType: "drop",
        fantraxEntityId: "g-drop",
      });

      expect(result.tradeBlocks).toHaveLength(2);
      expect(result.tradeBlocks.map((block) => block.sourcePeriod)).toEqual([
        150,
        151,
      ]);
      expect(result.tradeBlocks[0].participantSignature).toBe("16|7");
      expect(result.tradeBlocks[0].items).toEqual([
        expect.objectContaining({
          assetType: "player",
          fantraxEntityId: "p-send",
          matchStatus: "matched",
        }),
        expect.objectContaining({
          assetType: "draft_pick",
          draftSeason: 2026,
          draftRound: 3,
          draftOriginalTeamId: "21",
          matchStatus: "not_applicable",
        }),
      ]);
      expect(result.tradeBlocks[1].items).toEqual([
        expect.objectContaining({
          assetType: "player",
          fantraxEntityId: "p-return",
          matchStatus: "matched",
        }),
        expect.objectContaining({
          assetType: "other",
          fantraxEntityId: null,
          matchStatus: "not_applicable",
        }),
      ]);
    } finally {
      await context.cleanup();
    }
  });

  test("imports transactions into the database and replaces one season without touching others", async () => {
    const context = await createIntegrationDb();
    const csvDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffhl-transactions-"));

    try {
      await context.insertPlayers([
        {
          teamId: "7",
          season: 2024,
          reportType: "regular",
          playerId: "p-2024",
          name: "Season 2024 Claim",
          position: "F",
        },
        {
          teamId: "7",
          season: 2025,
          reportType: "regular",
          playerId: "p-2025",
          name: "Season 2025 Claim",
          position: "F",
        },
        {
          teamId: "16",
          season: 2025,
          reportType: "regular",
          playerId: "p-2025-trade",
          name: "Trade Return",
          position: "D",
        },
      ]);
      await context.insertGoalies([
        {
          teamId: "16",
          season: 2025,
          reportType: "regular",
          goalieId: "g-2025-drop",
          name: "Trade Drop Goalie",
        },
      ]);

      await writeCsv(csvDir, "claims-2024-2025.csv", [
        `"Player","Team","Position","Type","Team","Date (EDT)","Period"`,
        `"Season 2024 Claim","EDM","F","Claim","Edmonton Oilers","Mon Mar 3, 2025, 12:00PM","100"`,
      ]);
      await writeCsv(csvDir, "claims-2025-2026.csv", [
        `"Player","Team","Position","Type","Team","Date (EDT)","Period"`,
        `"Season 2025 Claim","EDM","F","Claim","Edmonton Oilers","Thu Mar 5, 2026, 12:38PM","150"`,
      ]);
      await writeCsv(csvDir, "trades-2025-2026.csv", [
        `"Player","Team","Position","From","To","Date (EDT)","Period"`,
        `"Season 2025 Claim","EDM","F","Edmonton Oilers","Tampa Bay Lightning","Thu Mar 5, 2026, 12:38PM","150"`,
        `"Trade Return","TBL","D","Tampa Bay Lightning","Edmonton Oilers","Thu Mar 5, 2026, 12:38PM","151"`,
        `"Trade Drop Goalie","TBL","G","Tampa Bay Lightning","(Drop)","Thu Mar 5, 2026, 12:38PM","151"`,
      ]);

      const firstSummary = await importTransactionsToDb({
        db: context.db,
        csvDir,
      });

      expect(firstSummary).toMatchObject({
        processedFiles: 3,
        importedSeasons: [2024, 2025],
        claimEvents: 3,
        claimItems: 3,
        tradeBlocks: 2,
        tradeItems: 2,
      });
      expect(await getCount(context.db, "SELECT COUNT(*) AS count FROM claim_events")).toBe(3);
      expect(
        await getCount(context.db, "SELECT COUNT(*) AS count FROM claim_event_items"),
      ).toBe(3);
      expect(
        await getCount(context.db, "SELECT COUNT(*) AS count FROM trade_source_blocks"),
      ).toBe(2);
      expect(
        await getCount(context.db, "SELECT COUNT(*) AS count FROM trade_block_items"),
      ).toBe(2);

      const claimItemRows = await context.db.execute(
        `SELECT season, team_id, occurred_at, action_type
         FROM claim_event_items
         ORDER BY season ASC, occurred_at ASC, action_type ASC`,
      );
      expect(claimItemRows.rows).toEqual([
        {
          season: 2024,
          team_id: "7",
          occurred_at: "2025-03-03T16:00:00.000Z",
          action_type: "claim",
        },
        {
          season: 2025,
          team_id: "7",
          occurred_at: "2026-03-05T16:38:00.000Z",
          action_type: "claim",
        },
        {
          season: 2025,
          team_id: "16",
          occurred_at: "2026-03-05T16:38:00.000Z",
          action_type: "drop",
        },
      ]);

      await writeCsv(csvDir, "claims-2025-2026.csv", [
        `"Player","Team","Position","Type","Team","Date (EDT)","Period"`,
        `"Season 2025 Claim","EDM","F","Drop","Edmonton Oilers","Thu Mar 6, 2026, 12:38PM","151"`,
      ]);

      const secondSummary = await importTransactionsToDb({
        db: context.db,
        csvDir,
        seasons: [2025],
      });

      expect(secondSummary.importedSeasons).toEqual([2025]);
      expect(await getCount(context.db, "SELECT COUNT(*) AS count FROM claim_events")).toBe(3);
      expect(
        await getCount(
          context.db,
          `SELECT COUNT(*) AS count FROM claim_events WHERE season = 2024`,
        ),
      ).toBe(1);
      expect(
        await getCount(
          context.db,
          `SELECT COUNT(*) AS count FROM claim_events WHERE season = 2025`,
        ),
      ).toBe(2);
      expect(
        await getCount(
          context.db,
          `SELECT COUNT(*) AS count FROM trade_source_blocks WHERE season = 2025`,
        ),
      ).toBe(2);

      const lastModified = await context.db.execute({
        sql: "SELECT value FROM import_metadata WHERE key = ?",
        args: ["last_modified"],
      });
      expect(lastModified.rows).toHaveLength(1);
    } finally {
      await context.cleanup();
      await fs.rm(csvDir, { recursive: true, force: true });
    }
  });
});
