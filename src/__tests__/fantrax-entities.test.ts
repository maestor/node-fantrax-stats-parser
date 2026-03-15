import {
  buildFantraxEntityUpsertStatements,
  collectFantraxEntitiesFromStats,
} from "../features/fantrax/entities";
import { createGoalie, createPlayer } from "./fixtures";

describe("fantrax entity helpers", () => {
  describe("collectFantraxEntitiesFromStats", () => {
    test("collects unique player and goalie identities and skips missing ids", () => {
      const entities = collectFantraxEntitiesFromStats({
        players: [
          {
            ...createPlayer({
              id: "p001",
              name: "Skater One",
              position: "F",
            }),
            season: 2025,
          },
          {
            ...createPlayer({
              id: "",
              name: "Missing Id",
              position: "D",
            }),
            season: 2025,
          },
        ],
        goalies: [
          {
            ...createGoalie({
              id: "g001",
              name: "Goalie One",
            }),
            season: 2025,
          },
          {
            ...createGoalie({
              id: "",
              name: "Missing Goalie Id",
            }),
            season: 2025,
          },
        ],
      });

      expect(entities).toEqual([
        {
          fantraxId: "g001",
          name: "Goalie One",
          position: "G",
          firstSeenSeason: 2025,
          lastSeenSeason: 2025,
        },
        {
          fantraxId: "p001",
          name: "Skater One",
          position: "F",
          firstSeenSeason: 2025,
          lastSeenSeason: 2025,
        },
      ]);
    });

    test("keeps the latest season as canonical while widening seen-season bounds", () => {
      const entities = collectFantraxEntitiesFromStats({
        players: [
          {
            ...createPlayer({
              id: "p001",
              name: "Older Typo",
              position: "D",
            }),
            season: 2014,
          },
          {
            ...createPlayer({
              id: "p001",
              name: "Latest Name",
              position: "F",
            }),
            season: 2025,
          },
        ],
        goalies: [],
      });

      expect(entities).toEqual([
        {
          fantraxId: "p001",
          name: "Latest Name",
          position: "F",
          firstSeenSeason: 2014,
          lastSeenSeason: 2025,
        },
      ]);
    });

    test("fills a missing latest-season position from older known data", () => {
      const entities = collectFantraxEntitiesFromStats({
        players: [
          {
            ...createPlayer({
              id: "p002",
              name: "Position Pending",
            }),
            season: 2025,
          },
          {
            ...createPlayer({
              id: "p002",
              name: "Position Pending",
              position: "D",
            }),
            season: 2024,
          },
        ],
        goalies: [],
      });

      expect(entities).toEqual([
        {
          fantraxId: "p002",
          name: "Position Pending",
          position: "D",
          firstSeenSeason: 2024,
          lastSeenSeason: 2025,
        },
      ]);
    });

    test("promotes a newer season to canonical data while preserving known position", () => {
      const entities = collectFantraxEntitiesFromStats({
        players: [
          {
            ...createPlayer({
              id: "p003",
              name: "Older Name",
              position: "F",
            }),
            season: 2023,
          },
          {
            ...createPlayer({
              id: "p003",
              name: "Corrected Latest Name",
            }),
            season: 2025,
          },
        ],
        goalies: [],
      });

      expect(entities).toEqual([
        {
          fantraxId: "p003",
          name: "Corrected Latest Name",
          position: "F",
          firstSeenSeason: 2023,
          lastSeenSeason: 2025,
        },
      ]);
    });

    test("keeps position null when no season has a known position", () => {
      const entities = collectFantraxEntitiesFromStats({
        players: [
          {
            ...createPlayer({
              id: "p004",
              name: "Still Unknown",
            }),
            season: 2025,
          },
          {
            ...createPlayer({
              id: "p004",
              name: "Still Unknown",
            }),
            season: 2024,
          },
        ],
        goalies: [],
      });

      expect(entities).toEqual([
        {
          fantraxId: "p004",
          name: "Still Unknown",
          position: null,
          firstSeenSeason: 2024,
          lastSeenSeason: 2025,
        },
      ]);
    });

    test("keeps canonical position null when a newer season still has no known position", () => {
      const entities = collectFantraxEntitiesFromStats({
        players: [
          {
            ...createPlayer({
              id: "p005",
              name: "Unknown Forever",
            }),
            season: 2024,
          },
          {
            ...createPlayer({
              id: "p005",
              name: "Unknown Forever",
            }),
            season: 2025,
          },
        ],
        goalies: [],
      });

      expect(entities).toEqual([
        {
          fantraxId: "p005",
          name: "Unknown Forever",
          position: null,
          firstSeenSeason: 2024,
          lastSeenSeason: 2025,
        },
      ]);
    });
  });

  describe("buildFantraxEntityUpsertStatements", () => {
    test("builds one upsert statement per entity", () => {
      const statements = buildFantraxEntityUpsertStatements([
        {
          fantraxId: "p001",
          name: "Skater One",
          position: "F",
          firstSeenSeason: 2012,
          lastSeenSeason: 2025,
        },
      ]);

      expect(statements).toEqual([
        {
          sql: expect.stringContaining(
            "ON CONFLICT(fantrax_id) DO UPDATE SET",
          ),
          args: ["p001", "Skater One", "F", 2012, 2025],
        },
      ]);
      const [statement] = statements;
      if (typeof statement === "string") {
        throw new Error("Expected object-style upsert statement.");
      }
      expect(String(statement.sql)).toContain("first_seen_season");
      expect(String(statement.sql)).toContain("last_seen_season");
    });
  });
});
