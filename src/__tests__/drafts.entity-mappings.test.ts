import {
  generateEntryDraftEntityMappings,
  normalizeDraftEntityName,
} from "../features/drafts/entity-mappings.js";
import type { EntryDraftPick } from "../features/drafts/parser.js";

const createPick = (overrides: Partial<EntryDraftPick> = {}): EntryDraftPick => ({
  season: 2026,
  round: 1,
  pickNumber: 1,
  playerName: "Gavin McKenna",
  draftedTeam: {
    abbreviation: "VGK",
    teamId: "32",
    teamName: "Vegas Golden Knights",
  },
  originalOwnerTeam: {
    abbreviation: "VGK",
    teamId: "32",
    teamName: "Vegas Golden Knights",
  },
  ...overrides,
});

describe("draft entity mapping generation", () => {
  test("normalizes accents, apostrophes, and repeated spaces", () => {
    expect(normalizeDraftEntityName("  Viggo   Björck  ")).toBe("Viggo Bjorck");
    expect(normalizeDraftEntityName("O'Connor")).toBe("OConnor");
    expect(normalizeDraftEntityName("O’Connor")).toBe("OConnor");
  });

  test("matches a single exact normalized name", () => {
    const report = generateEntryDraftEntityMappings({
      picks: [createPick({ playerName: "Viggo Björck" })],
      entities: [
        {
          fantraxId: "ftx-1",
          name: "Viggo Bjorck",
          lastSeenSeason: 2026,
        },
      ],
    });

    expect(report.matchedCount).toBe(1);
    expect(report.generatedMappings).toEqual([
      {
        id: 1,
        season: 2026,
        pickNumber: 1,
        draftedTeamId: "32",
        fantraxEntityId: "ftx-1",
        fantraxEntityName: "Viggo Bjorck",
      },
    ]);
    expect(report.results[0]?.status).toBe("matched_exact_name");
  });

  test("uses the latest last-seen season when multiple names match", () => {
    const report = generateEntryDraftEntityMappings({
      picks: [createPick({ playerName: "Jack Smith" })],
      entities: [
        {
          fantraxId: "ftx-old",
          name: "Jack Smith",
          lastSeenSeason: 2023,
        },
        {
          fantraxId: "ftx-new",
          name: "Jack Smith",
          lastSeenSeason: 2026,
        },
      ],
    });

    expect(report.matchedCount).toBe(1);
    expect(report.generatedMappings[0]?.fantraxEntityId).toBe("ftx-new");
    expect(report.results[0]?.status).toBe("matched_latest_last_seen");
  });

  test("marks tied candidates as ambiguous", () => {
    const report = generateEntryDraftEntityMappings({
      picks: [createPick({ playerName: "Alex Lee" })],
      entities: [
        {
          fantraxId: "ftx-1",
          name: "Alex Lee",
          lastSeenSeason: 2026,
        },
        {
          fantraxId: "ftx-2",
          name: "Alex Lee",
          lastSeenSeason: 2026,
        },
      ],
    });

    expect(report.ambiguousCount).toBe(1);
    expect(report.generatedMappings).toEqual([]);
    expect(report.results[0]?.status).toBe("unresolved_ambiguous_entity");
  });

  test("marks missing entities as unresolved and ignores blank candidate names", () => {
    const report = generateEntryDraftEntityMappings({
      picks: [createPick({ playerName: "No Match Prospect" })],
      entities: [
        {
          fantraxId: "ftx-blank",
          name: "   ",
          lastSeenSeason: 2026,
        },
      ],
    });

    expect(report.unresolvedCount).toBe(1);
    expect(report.generatedMappings).toEqual([]);
    expect(report.results[0]).toEqual(
      expect.objectContaining({
        status: "unresolved_missing_entity",
        fantraxEntityId: null,
        candidateNames: [],
      }),
    );
  });

  test("skips placeholder rows with null player names", () => {
    const report = generateEntryDraftEntityMappings({
      picks: [createPick({ playerName: null })],
      entities: [],
    });

    expect(report.skippedCount).toBe(1);
    expect(report.generatedMappings).toEqual([]);
    expect(report.results[0]?.status).toBe("skipped_null_player");
  });
});
