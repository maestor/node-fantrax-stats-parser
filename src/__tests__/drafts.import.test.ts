import fs from "fs/promises";
import os from "os";
import path from "path";

import { createIntegrationDb } from "./integration-db.js";
import { importDraftPicksToDb } from "../features/drafts/import.js";
import type { EntryDraftPick, OpeningDraftPick } from "../features/drafts/parser.js";

const createTempDraftDir = async (): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ffhl-drafts-"));

  return {
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
};

const writeDraftFile = async (
  dir: string,
  fileName: string,
  payload: unknown,
): Promise<void> => {
  await fs.writeFile(
    path.join(dir, fileName),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
};

const createEntryPick = (overrides: Partial<EntryDraftPick> = {}): EntryDraftPick => ({
  season: 2025,
  round: 1,
  pickNumber: 1,
  playerName: "Draft Player",
  draftedTeam: {
    abbreviation: "BUF",
    teamId: "21",
    teamName: "Buffalo Sabres",
  },
  originalOwnerTeam: {
    abbreviation: "FLA",
    teamId: "17",
    teamName: "Florida Panthers",
  },
  ...overrides,
});

const createOpeningPick = (
  overrides: Partial<OpeningDraftPick> = {},
): OpeningDraftPick => ({
  round: 1,
  pickNumber: 1,
  playerName: "Opening Player",
  draftedTeam: {
    abbreviation: "Anaheim Ducks",
    teamId: "12",
    teamName: "Anaheim Ducks",
  },
  originalOwnerTeam: {
    abbreviation: "Anaheim Ducks",
    teamId: "12",
    teamName: "Anaheim Ducks",
  },
  ...overrides,
});

const createEntryEntityMapping = (
  overrides: Partial<{
    id: number;
    season: number;
    pickNumber: number;
    draftedTeamId: string;
    fantraxEntityId: string;
    fantraxEntityName: string;
  }> = {},
) => ({
  id: 1,
  season: 2025,
  pickNumber: 1,
  draftedTeamId: "21",
  fantraxEntityId: "ftx-entry-1",
  fantraxEntityName: "Canonical Entry Player",
  ...overrides,
});

const createOpeningEntityMapping = (
  overrides: Partial<{
    id: number;
    pickNumber: number;
    draftedTeamId: string;
    fantraxEntityId: string;
    fantraxEntityName: string;
  }> = {},
) => ({
  id: 1,
  pickNumber: 1,
  draftedTeamId: "12",
  fantraxEntityId: "ftx-opening-1",
  fantraxEntityName: "Canonical Opening Player",
  ...overrides,
});

describe("draft DB import", () => {
  test("imports entry and opening draft picks into the database", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2024.json", [
        createEntryPick({
          season: 2024,
          pickNumber: 1,
          playerName: "Macklin Celebrini",
        }),
        createEntryPick({
          season: 2024,
          pickNumber: 2,
          round: 2,
          playerName: null,
          draftedTeam: {
            abbreviation: "UTA",
            teamId: "31",
            teamName: "Utah Mammoth",
          },
          originalOwnerTeam: {
            abbreviation: "ARI",
            teamId: "31",
            teamName: "Utah Mammoth",
          },
        }),
      ]);
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
          playerName: "Michael Misa",
        }),
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [
        createOpeningPick({
          pickNumber: 1,
          playerName: "Jevgeni Malkin",
        }),
        createOpeningPick({
          pickNumber: 22,
          round: 2,
          playerName: "Carey Price",
          draftedTeam: {
            abbreviation: "Nashville Predators",
            teamId: "10",
            teamName: "Nashville Predators",
          },
          originalOwnerTeam: {
            abbreviation: "Boston Bruins",
            teamId: "18",
            teamName: "Boston Bruins",
          },
        }),
      ]);

      const summary = await importDraftPicksToDb({
        db: dbContext.db,
        draftsDir: draftDir.dir,
        importedAt: "2026-03-27T09:30:00.000Z",
      });

      expect(summary).toEqual({
        draftsDir: path.resolve(draftDir.dir),
        entryFileCount: 2,
        entrySeasons: [2024, 2025],
        entryPickCount: 3,
        openingPickCount: 2,
        dryRun: false,
      });

      const entryRows = await dbContext.db.execute(
        `SELECT season, pick_number, round, drafted_team_id, owner_team_id, player_name,
                fantrax_entity_id
         FROM entry_draft_picks
         ORDER BY season ASC, pick_number ASC`,
      );
      expect(entryRows.rows).toEqual([
        {
          season: 2024,
          pick_number: 1,
          round: 1,
          drafted_team_id: "21",
          owner_team_id: "17",
          player_name: "Macklin Celebrini",
          fantrax_entity_id: null,
        },
        {
          season: 2024,
          pick_number: 2,
          round: 2,
          drafted_team_id: "31",
          owner_team_id: "31",
          player_name: null,
          fantrax_entity_id: null,
        },
        {
          season: 2025,
          pick_number: 1,
          round: 1,
          drafted_team_id: "21",
          owner_team_id: "17",
          player_name: "Michael Misa",
          fantrax_entity_id: null,
        },
      ]);

      const openingRows = await dbContext.db.execute(
        `SELECT pick_number, round, drafted_team_id, owner_team_id, player_name,
                fantrax_entity_id
         FROM opening_draft_picks
         ORDER BY pick_number ASC`,
      );
      expect(openingRows.rows).toEqual([
        {
          pick_number: 1,
          round: 1,
          drafted_team_id: "12",
          owner_team_id: "12",
          player_name: "Jevgeni Malkin",
          fantrax_entity_id: null,
        },
        {
          pick_number: 22,
          round: 2,
          drafted_team_id: "10",
          owner_team_id: "18",
          player_name: "Carey Price",
          fantrax_entity_id: null,
        },
      ]);

      const metadata = await dbContext.db.execute({
        sql: "SELECT value FROM import_metadata WHERE key = ?",
        args: ["last_modified"],
      });
      expect(metadata.rows).toEqual([{ value: "2026-03-27T09:30:00.000Z" }]);
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("applies mapped entity ids and canonical names using draft-table natural keys", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
          playerName: "Entry Alias",
        }),
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [
        createOpeningPick({
          pickNumber: 1,
          playerName: "Opening Alias",
        }),
      ]);
      await writeDraftFile(draftDir.dir, "entities-entry-draft.json", [
        createEntryEntityMapping(),
      ]);
      await writeDraftFile(draftDir.dir, "entities-opening-draft.json", [
        createOpeningEntityMapping(),
      ]);

      await importDraftPicksToDb({
        db: dbContext.db,
        draftsDir: draftDir.dir,
        importedAt: "2026-03-28T10:15:00.000Z",
      });

      const entryRows = await dbContext.db.execute(
        `SELECT season, pick_number, player_name, fantrax_entity_id
         FROM entry_draft_picks
         ORDER BY season ASC, pick_number ASC`,
      );
      expect(entryRows.rows).toEqual([
        {
          season: 2025,
          pick_number: 1,
          player_name: "Canonical Entry Player",
          fantrax_entity_id: "ftx-entry-1",
        },
      ]);

      const openingRows = await dbContext.db.execute(
        `SELECT pick_number, player_name, fantrax_entity_id
         FROM opening_draft_picks
         ORDER BY pick_number ASC`,
      );
      expect(openingRows.rows).toEqual([
        {
          pick_number: 1,
          player_name: "Canonical Opening Player",
          fantrax_entity_id: "ftx-opening-1",
        },
      ]);
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("skips mappings when drafted team ids do not match the draft rows", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
          playerName: "Entry Alias",
        }),
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [
        createOpeningPick({
          pickNumber: 1,
          playerName: "Opening Alias",
        }),
      ]);
      await writeDraftFile(draftDir.dir, "entities-entry-draft.json", [
        createEntryEntityMapping({
          draftedTeamId: "24",
        }),
      ]);
      await writeDraftFile(draftDir.dir, "entities-opening-draft.json", [
        createOpeningEntityMapping({
          draftedTeamId: "8",
        }),
      ]);

      await importDraftPicksToDb({
        db: dbContext.db,
        draftsDir: draftDir.dir,
      });

      const entryRows = await dbContext.db.execute(
        `SELECT player_name, fantrax_entity_id
         FROM entry_draft_picks
         ORDER BY season ASC, pick_number ASC`,
      );
      expect(entryRows.rows).toEqual([
        {
          player_name: "Entry Alias",
          fantrax_entity_id: null,
        },
      ]);

      const openingRows = await dbContext.db.execute(
        `SELECT player_name, fantrax_entity_id
         FROM opening_draft_picks
         ORDER BY pick_number ASC`,
      );
      expect(openingRows.rows).toEqual([
        {
          player_name: "Opening Alias",
          fantrax_entity_id: null,
        },
      ]);
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("imports a single entry season without touching other seasons or opening draft rows", async () => {
    const dbContext = await createIntegrationDb();
    const firstDraftDir = await createTempDraftDir();
    const secondDraftDir = await createTempDraftDir();

    try {
      await writeDraftFile(firstDraftDir.dir, "entry-draft-2024.json", [
        createEntryPick({
          season: 2024,
          pickNumber: 1,
          playerName: "Old 2024 Pick",
        }),
      ]);
      await writeDraftFile(firstDraftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
          playerName: "Old 2025 Pick",
        }),
      ]);
      await writeDraftFile(firstDraftDir.dir, "opening-draft.json", [
        createOpeningPick({
          pickNumber: 1,
          playerName: "Old Opening Pick",
        }),
      ]);

      await importDraftPicksToDb({
        db: dbContext.db,
        draftsDir: firstDraftDir.dir,
        importedAt: "2026-03-27T09:30:00.000Z",
      });

      await writeDraftFile(secondDraftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
          playerName: "New 2025 Pick",
        }),
        createEntryPick({
          season: 2025,
          pickNumber: 2,
          round: 2,
          playerName: "Second 2025 Pick",
        }),
      ]);
      await importDraftPicksToDb({
        db: dbContext.db,
        draftsDir: secondDraftDir.dir,
        season: 2025,
        importedAt: "2026-03-27T10:00:00.000Z",
      });

      const entryRows = await dbContext.db.execute(
        `SELECT season, pick_number, player_name
         FROM entry_draft_picks
         ORDER BY season ASC, pick_number ASC`,
      );
      expect(entryRows.rows).toEqual([
        {
          season: 2024,
          pick_number: 1,
          player_name: "Old 2024 Pick",
        },
        {
          season: 2025,
          pick_number: 1,
          player_name: "New 2025 Pick",
        },
        {
          season: 2025,
          pick_number: 2,
          player_name: "Second 2025 Pick",
        },
      ]);

      const openingRows = await dbContext.db.execute(
        `SELECT pick_number, player_name
         FROM opening_draft_picks
         ORDER BY pick_number ASC`,
      );
      expect(openingRows.rows).toEqual([
        {
          pick_number: 1,
          player_name: "Old Opening Pick",
        },
      ]);
    } finally {
      await secondDraftDir.cleanup();
      await firstDraftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("imports only opening draft rows without touching entry draft seasons", async () => {
    const dbContext = await createIntegrationDb();
    const firstDraftDir = await createTempDraftDir();
    const secondDraftDir = await createTempDraftDir();

    try {
      await writeDraftFile(firstDraftDir.dir, "entry-draft-2024.json", [
        createEntryPick({
          season: 2024,
          pickNumber: 1,
          playerName: "Old 2024 Pick",
        }),
      ]);
      await writeDraftFile(firstDraftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
          playerName: "Old 2025 Pick",
        }),
      ]);
      await writeDraftFile(firstDraftDir.dir, "opening-draft.json", [
        createOpeningPick({
          pickNumber: 1,
          playerName: "Old Opening Pick",
        }),
      ]);

      await importDraftPicksToDb({
        db: dbContext.db,
        draftsDir: firstDraftDir.dir,
        importedAt: "2026-03-27T09:30:00.000Z",
      });

      await writeDraftFile(secondDraftDir.dir, "opening-draft.json", [
        createOpeningPick({
          pickNumber: 44,
          round: 3,
          playerName: "New Opening Pick",
          draftedTeam: {
            abbreviation: "Calgary Flames",
            teamId: "3",
            teamName: "Calgary Flames",
          },
          originalOwnerTeam: {
            abbreviation: "Calgary Flames",
            teamId: "3",
            teamName: "Calgary Flames",
          },
        }),
      ]);

      await importDraftPicksToDb({
        db: dbContext.db,
        draftsDir: secondDraftDir.dir,
        openingOnly: true,
        importedAt: "2026-03-27T10:00:00.000Z",
      });

      const entryRows = await dbContext.db.execute(
        `SELECT season, pick_number, player_name
         FROM entry_draft_picks
         ORDER BY season ASC, pick_number ASC`,
      );
      expect(entryRows.rows).toEqual([
        {
          season: 2024,
          pick_number: 1,
          player_name: "Old 2024 Pick",
        },
        {
          season: 2025,
          pick_number: 1,
          player_name: "Old 2025 Pick",
        },
      ]);

      const openingRows = await dbContext.db.execute(
        `SELECT pick_number, player_name
         FROM opening_draft_picks
         ORDER BY pick_number ASC`,
      );
      expect(openingRows.rows).toEqual([
        {
          pick_number: 44,
          player_name: "New Opening Pick",
        },
      ]);
    } finally {
      await secondDraftDir.cleanup();
      await firstDraftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("supports dry-run mode without modifying the database", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
        }),
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [
        createOpeningPick({
          pickNumber: 1,
        }),
      ]);

      const summary = await importDraftPicksToDb({
        db: dbContext.db,
        draftsDir: draftDir.dir,
        dryRun: true,
      });

      expect(summary.dryRun).toBe(true);

      const entryCount = await dbContext.db.execute(
        "SELECT COUNT(*) AS count FROM entry_draft_picks",
      );
      expect(entryCount.rows).toEqual([{ count: 0 }]);

      const openingCount = await dbContext.db.execute(
        "SELECT COUNT(*) AS count FROM opening_draft_picks",
      );
      expect(openingCount.rows).toEqual([{ count: 0 }]);
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("uses the default draft directory and generated import timestamp when flags are omitted", async () => {
    const dbContext = await createIntegrationDb();
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ffhl-draft-defaults-"));
    const previousCwd = process.cwd();
    const defaultDraftDir = path.join(tempRoot, "src", "playwright", ".fantrax", "drafts");

    try {
      await fs.mkdir(defaultDraftDir, { recursive: true });
      await writeDraftFile(defaultDraftDir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
        }),
      ]);
      await writeDraftFile(defaultDraftDir, "opening-draft.json", [
        createOpeningPick({
          pickNumber: 1,
        }),
      ]);

      process.chdir(tempRoot);

      const summary = await importDraftPicksToDb({
        db: dbContext.db,
      });

      expect(summary.draftsDir).toBe(await fs.realpath(defaultDraftDir));
      expect(summary.entrySeasons).toEqual([2025]);

      const metadata = await dbContext.db.execute({
        sql: "SELECT value FROM import_metadata WHERE key = ?",
        args: ["last_modified"],
      });
      expect(metadata.rows).toHaveLength(1);
      expect((metadata.rows[0] as unknown as { value: string }).value).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
      );
    } finally {
      process.chdir(previousCwd);
      await fs.rm(tempRoot, { recursive: true, force: true });
      await dbContext.cleanup();
    }
  });

  test("throws when no entry draft files exist", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "opening-draft.json", [
        createOpeningPick({
          pickNumber: 1,
        }),
      ]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(`No entry-draft JSON files found in ${path.resolve(draftDir.dir)}`);
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when opening draft file is missing", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
        }),
      ]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(`Could not find opening-draft.json in ${path.resolve(draftDir.dir)}`);
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when openingOnly is requested but opening draft file is missing", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
        }),
      ]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
          openingOnly: true,
        }),
      ).rejects.toThrow(`Could not find opening-draft.json in ${path.resolve(draftDir.dir)}`);
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when both season and openingOnly are requested together", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
          season: 2025,
          openingOnly: true,
        }),
      ).rejects.toThrow("Use either season or openingOnly, not both.");
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when a requested entry draft season file is missing", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2024.json", [
        createEntryPick({
          season: 2024,
        }),
      ]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
          season: 2025,
        }),
      ).rejects.toThrow(
        `Could not find entry-draft-2025.json in ${path.resolve(draftDir.dir)}`,
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an entry draft file contains mixed seasons", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2024,
          pickNumber: 1,
        }),
        createEntryPick({
          season: 2025,
          pickNumber: 2,
        }),
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [
        createOpeningPick(),
      ]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        `Entry draft file must contain exactly one season: ${path.resolve(
          draftDir.dir,
          "entry-draft-2025.json",
        )}`,
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an entry draft row has an unsupported team id", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        {
          ...createEntryPick(),
          draftedTeam: {
            abbreviation: "BUF",
            teamId: "999",
            teamName: "Unknown Team",
          },
        },
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [
        createOpeningPick(),
      ]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        "Entry draft entry-draft-2025.json row 1.draftedTeam.teamId is missing or unsupported.",
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an entry draft row is not an object", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", ["bad-row"]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow("Entry draft entry-draft-2025.json row 1 must be an object.");
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an entry draft row has a non-object drafted team", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        {
          ...createEntryPick(),
          draftedTeam: "21",
        },
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        "Entry draft entry-draft-2025.json row 1.draftedTeam must be an object with a valid teamId.",
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an entry draft row has a non-positive round", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          round: 0,
        }),
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        "Entry draft entry-draft-2025.json row 1.round must be a positive integer.",
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an entry draft file is empty", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", []);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        `Entry draft file must contain a non-empty array: ${path.resolve(
          draftDir.dir,
          "entry-draft-2025.json",
        )}`,
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an opening draft row is missing a required player name", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick(),
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [
        {
          ...createOpeningPick(),
          playerName: "",
        },
      ]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        "Opening draft opening-draft.json row 1.playerName must be a non-empty string.",
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an entry entity mapping file is not an array", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [createEntryPick()]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);
      await writeDraftFile(draftDir.dir, "entities-entry-draft.json", {
        bad: "payload",
      });

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        `Draft entity mapping file must contain an array: ${path.resolve(
          draftDir.dir,
          "entities-entry-draft.json",
        )}`,
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an opening entity mapping file is not an array", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [createEntryPick()]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);
      await writeDraftFile(draftDir.dir, "entities-opening-draft.json", {
        bad: "payload",
      });

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        `Draft entity mapping file must contain an array: ${path.resolve(
          draftDir.dir,
          "entities-opening-draft.json",
        )}`,
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an entry entity mapping row is not an object", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [createEntryPick()]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);
      await writeDraftFile(draftDir.dir, "entities-entry-draft.json", ["bad-row"]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        "Draft entity mapping entities-entry-draft.json row 1 must be an object.",
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an opening entity mapping row is not an object", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [createEntryPick()]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);
      await writeDraftFile(draftDir.dir, "entities-opening-draft.json", ["bad-row"]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        "Draft entity mapping entities-opening-draft.json row 1 must be an object.",
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an opening draft file is empty", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [createEntryPick()]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", []);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        `Opening draft file must contain a non-empty array: ${path.resolve(
          draftDir.dir,
          "opening-draft.json",
        )}`,
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when an opening draft row is not an object", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [createEntryPick()]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", ["bad-row"]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow("Opening draft opening-draft.json row 1 must be an object.");
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when multiple entry files resolve to the same season", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2024.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 1,
        }),
      ]);
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [
        createEntryPick({
          season: 2025,
          pickNumber: 2,
        }),
      ]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow("Duplicate entry draft season in import set: 2025");
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when entry entity mappings duplicate a season and pick number", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [createEntryPick()]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);
      await writeDraftFile(draftDir.dir, "entities-entry-draft.json", [
        createEntryEntityMapping({
          id: 1,
        }),
        createEntryEntityMapping({
          id: 2,
        }),
      ]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow(
        "Duplicate entry draft entity mapping for season 2025, pick 1.",
      );
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("throws when opening entity mappings duplicate a pick number", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [createEntryPick()]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);
      await writeDraftFile(draftDir.dir, "entities-opening-draft.json", [
        createOpeningEntityMapping({
          id: 1,
        }),
        createOpeningEntityMapping({
          id: 2,
        }),
      ]);

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toThrow("Duplicate opening draft entity mapping for pick 1.");
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });

  test("rethrows mapping file read errors other than missing files", async () => {
    const dbContext = await createIntegrationDb();
    const draftDir = await createTempDraftDir();

    try {
      await writeDraftFile(draftDir.dir, "entry-draft-2025.json", [createEntryPick()]);
      await writeDraftFile(draftDir.dir, "opening-draft.json", [createOpeningPick()]);
      await fs.mkdir(path.join(draftDir.dir, "entities-entry-draft.json"));

      await expect(
        importDraftPicksToDb({
          db: dbContext.db,
          draftsDir: draftDir.dir,
        }),
      ).rejects.toMatchObject({
        code: "EISDIR",
      });
    } finally {
      await draftDir.cleanup();
      await dbContext.cleanup();
    }
  });
});
