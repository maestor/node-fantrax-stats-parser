import { createRequest, createResponse } from "node-mocks-http";
import app from "../app.js";
import { createIntegrationDb } from "./integration-db.js";
import { expectObjectSchema } from "./openapi-schema.js";
import { getJsonBody } from "./routes.integration.helpers.js";
import type { CareerHistory } from "../features/transactions/types.js";

type Db = Awaited<ReturnType<typeof createIntegrationDb>>["db"];
type AssetSeed = {
  from: string;
  to: string;
  name: string;
  entity?: string;
  kind?: "player" | "draft_pick" | "other";
  position?: string;
};

const request = async (url: string, headers: Record<string, string> = {}) => {
  const res = createResponse();
  await app(createRequest({ method: "GET", url, headers }) as never, res);
  return res;
};

const insertBlock = async (
  db: Db,
  index: number,
  assets: AssetSeed[],
  options: {
    date?: string;
    period?: number;
    file?: string;
    signature?: string;
  } = {},
) => {
  const block = await db.execute({
    sql: `INSERT INTO trade_source_blocks
      (season, occurred_at, source_file, source_block_index, source_period, participant_signature)
      VALUES (2024, ?, ?, ?, ?, ?)`,
    args: [
      options.date ?? "2025-01-10T12:00:00.000Z",
      options.file ?? "trades-2024-2025.csv",
      index,
      options.period ?? 10,
      options.signature ?? "2|4",
    ],
  });
  for (const [sequence, asset] of assets.entries()) {
    await db.execute({
      sql: `INSERT INTO trade_block_items
        (trade_source_block_id, sequence, from_team_id, to_team_id, asset_type,
         fantrax_entity_id, raw_name, raw_position, match_status, match_strategy,
         draft_season, draft_round, draft_original_team_id, raw_asset_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        Number(block.lastInsertRowid),
        sequence,
        asset.from,
        asset.to,
        asset.kind ?? "player",
        asset.entity ?? null,
        asset.name,
        asset.position ?? null,
        asset.entity
          ? "matched"
          : asset.kind === "draft_pick" || asset.kind === "other"
            ? "not_applicable"
            : "unresolved_missing_entity",
        "not_applicable",
        asset.kind === "draft_pick" ? 2026 : null,
        asset.kind === "draft_pick" ? 2 : null,
        asset.kind === "draft_pick" ? "2" : null,
        asset.name,
      ],
    });
  }
};

test("a career reader follows a draft into a reconstructed trade without the drafting team's setup claim", async () => {
  const context = await createIntegrationDb();
  try {
    await context.insertPlayers([
      {
        playerId: "p1",
        name: "Career Player",
        position: "F",
        teamId: "2",
        season: 2024,
        reportType: "regular",
        games: 12,
      },
      {
        playerId: "p2",
        name: "Zero Game Player",
        position: "D",
        teamId: "4",
        season: 2024,
        reportType: "regular",
      },
    ]);
    await context.insertGoalies([
      {
        goalieId: "g1",
        name: "Career Goalie",
        teamId: "4",
        season: 2024,
        reportType: "regular",
        games: 5,
      },
    ]);
    await context.db.execute(`INSERT INTO entry_draft_picks
      (season,pick_number,round,drafted_team_id,owner_team_id,player_name,fantrax_entity_id)
      VALUES (2020,15,1,'2','4','Old Name','p1')`);
    await context.db.execute(`INSERT INTO claim_events
      (season,team_id,occurred_at,source_file,source_group_index)
      VALUES (2023,'2','2023-10-10T12:00:00.000Z','claims-2023-2024.csv',0)`);
    await context.db.execute(`INSERT INTO claim_event_items
      (claim_event_id,season,team_id,occurred_at,sequence,action_type,fantrax_entity_id,raw_name,match_status,match_strategy)
      VALUES (1,2023,'2','2023-10-10T12:00:00.000Z',0,'claim','p1','Old Name','matched','exact_name_position')`);
    await insertBlock(context.db, 0, [
      { from: "2", to: "4", name: "Old Name", entity: "p1" },
      { from: "2", to: "4", name: "2026 pick", kind: "draft_pick" },
    ]);
    await insertBlock(context.db, 1, [
      { from: "4", to: "2", name: "Zero Game Player", entity: "p2" },
      { from: "4", to: "2", name: "Career Goalie", entity: "g1" },
      { from: "4", to: "2", name: "Unresolved Prospect" },
    ]);

    const history = await request("/career/history/p1");
    expect(history.statusCode).toBe(200);
    const body = getJsonBody<{
      events: Array<{ type: string; tradeId: string }>;
    }>(history);
    expect(body.events.map((event) => event.type)).toEqual(["trade", "draft"]);
    expectObjectSchema("CareerHistory", body);
    const detail = await request(
      `/transactions/trades/${body.events[0].tradeId}`,
    );
    expect(detail.statusCode).toBe(200);
    expect(getJsonBody(detail)).toEqual(
      expect.objectContaining({
        status: "reconstructed",
        blocks: [
          expect.objectContaining({
            assets: [
              expect.objectContaining({
                name: "Career Player",
                rawName: "Old Name",
                careerType: "player",
              }),
              expect.objectContaining({
                type: "draft_pick",
                draftSeason: 2026,
                draftRound: 2,
              }),
            ],
          }),
          expect.objectContaining({
            assets: [
              expect.objectContaining({ entityId: "p2", careerType: "player" }),
              expect.objectContaining({ entityId: "g1", careerType: "goalie" }),
              expect.objectContaining({
                name: "Unresolved Prospect",
                entityId: null,
                careerType: null,
              }),
            ],
          }),
        ],
      }),
    );
    expectObjectSchema("TradeDetail", getJsonBody(detail));
    const storedClaims = await context.db.execute(
      "SELECT COUNT(*) AS count FROM claim_event_items WHERE fantrax_entity_id = 'p1'",
    );
    expect(storedClaims.rows[0].count).toBe(1);
  } finally {
    await context.cleanup();
  }
});

type SetupClaimScenario = {
  name: string;
  drafts: Array<number | null>;
  goalie?: boolean;
  transactions: Array<{
    type: "claim" | "drop" | "trade";
    team?: string;
    season?: number;
    date?: string;
  }>;
  expected: string[];
};

test.each<SetupClaimScenario>([
  {
    name: "same-season roster setup",
    drafts: [2024],
    transactions: [{ type: "claim" }],
    expected: ["draft"],
  },
  {
    name: "opening-draft goalie roster setup",
    drafts: [null],
    goalie: true,
    transactions: [{ type: "claim" }],
    expected: ["draft"],
  },
  {
    name: "claim by the original pick owner instead of the drafting team",
    drafts: [2024],
    transactions: [{ type: "claim", team: "4" }],
    expected: ["claim", "draft"],
  },
  {
    name: "claim without a linked draft",
    drafts: [],
    transactions: [{ type: "claim" }],
    expected: ["claim"],
  },
  {
    name: "a later same-team claim after the setup claim",
    drafts: [2024],
    transactions: [{ type: "claim" }, { type: "claim" }],
    expected: ["claim", "draft"],
  },
  {
    name: "an intervening drop",
    drafts: [2024],
    transactions: [{ type: "drop" }, { type: "claim" }],
    expected: ["claim", "drop", "draft"],
  },
  {
    name: "an intervening claim by another team",
    drafts: [2024],
    transactions: [{ type: "claim", team: "4" }, { type: "claim" }],
    expected: ["claim", "claim", "draft"],
  },
  {
    name: "an intervening trade",
    drafts: [2024],
    transactions: [{ type: "trade" }, { type: "claim" }],
    expected: ["claim", "trade", "draft"],
  },
  {
    name: "a drop tied with the first claim",
    drafts: [2024],
    transactions: [
      { type: "claim", date: "2024-10-01T12:00:00.000Z" },
      { type: "drop", date: "2024-10-01T12:00:00.000Z" },
    ],
    expected: ["claim", "drop", "draft"],
  },
  {
    name: "a trade tied with the first claim",
    drafts: [2024],
    transactions: [
      { type: "claim", date: "2024-10-01T12:00:00.000Z" },
      { type: "trade", date: "2024-10-01T12:00:00.000Z" },
    ],
    expected: ["claim", "trade", "draft"],
  },
  {
    name: "roster setup after separate drafts of the same player",
    drafts: [2023, 2024],
    transactions: [{ type: "claim", season: 2023 }, { type: "claim" }],
    expected: ["draft", "draft"],
  },
  {
    name: "a claim before a later draft",
    drafts: [2024],
    transactions: [{ type: "claim", season: 2023 }, { type: "claim" }],
    expected: ["draft", "claim"],
  },
])("career history handles $name", async (scenario) => {
  const context = await createIntegrationDb();
  try {
    const identity = {
      name: "Drafted Player",
      teamId: "2",
      season: 2024,
      reportType: "regular" as const,
    };
    if (scenario.goalie) {
      await context.insertGoalies([{ ...identity, goalieId: "p1" }]);
    } else {
      await context.insertPlayers([
        { ...identity, playerId: "p1", position: "F" },
      ]);
    }
    for (const season of scenario.drafts) {
      await context.db.execute({
        sql:
          season === null
            ? `INSERT INTO opening_draft_picks
              (pick_number,round,drafted_team_id,owner_team_id,player_name,fantrax_entity_id)
              VALUES (15,1,'2','4','Drafted Player','p1')`
            : `INSERT INTO entry_draft_picks
              (season,pick_number,round,drafted_team_id,owner_team_id,player_name,fantrax_entity_id)
              VALUES (?,15,1,'2','4','Drafted Player','p1')`,
        args: season === null ? [] : [season],
      });
    }
    for (const [index, transaction] of scenario.transactions.entries()) {
      const season = transaction.season ?? 2024;
      const date =
        transaction.date ?? `${season}-10-0${index + 1}T12:00:00.000Z`;
      if (transaction.type === "trade") {
        await insertBlock(
          context.db,
          index,
          [{ from: "2", to: "4", name: "Drafted Player", entity: "p1" }],
          { date },
        );
        continue;
      }
      const teamId = transaction.team ?? "2";
      const event = await context.db.execute({
        sql: `INSERT INTO claim_events
          (season,team_id,occurred_at,source_file,source_group_index)
          VALUES (?, ?, ?, 'claims.csv', ?)`,
        args: [season, teamId, date, index],
      });
      await context.db.execute({
        sql: `INSERT INTO claim_event_items
          (claim_event_id,season,team_id,occurred_at,sequence,action_type,
           fantrax_entity_id,raw_name,match_status,match_strategy)
          VALUES (?, ?, ?, ?, 0, ?, 'p1', 'Drafted Player', 'matched', 'exact_name_position')`,
        args: [
          Number(event.lastInsertRowid),
          season,
          teamId,
          date,
          transaction.type,
        ],
      });
    }
    const response = await request("/career/history/p1");
    expect(response.statusCode).toBe(200);
    const body = getJsonBody<CareerHistory>(response);
    expect(body.events.map((event) => event.type)).toEqual(scenario.expected);
    expectObjectSchema("CareerHistory", body);
    expect(body.coverage.claimSeasons).toEqual(
      [
        ...new Set(
          scenario.transactions
            .filter((transaction) => transaction.type !== "trade")
            .map((transaction) => transaction.season ?? 2024),
        ),
      ].sort(),
    );
  } finally {
    await context.cleanup();
  }
});

test("history distinguishes no matching events from absent source records and includes zero-game goalies", async () => {
  const context = await createIntegrationDb();
  try {
    await context.insertGoalies([
      {
        goalieId: "g-zero",
        name: "Same Name",
        teamId: "2",
        season: 2024,
        reportType: "regular",
      },
      {
        goalieId: "g-other",
        name: "Same Name",
        teamId: "4",
        season: 2024,
        reportType: "regular",
      },
    ]);
    const empty = await request("/career/history/g-zero");
    expect(empty.statusCode).toBe(200);
    expect(getJsonBody(empty)).toEqual({
      id: "g-zero",
      events: [],
      coverage: {
        entryDraftSeasons: [],
        openingDraftPresent: false,
        claimSeasons: [],
        tradeSeasons: [],
        completeness: "unknown",
      },
    });
    expectObjectSchema("CareerHistory", getJsonBody(empty));
    await context.db.execute(`INSERT INTO opening_draft_picks
      (pick_number,round,drafted_team_id,owner_team_id,player_name,fantrax_entity_id)
      VALUES (15,1,'2','archived-team','Same Name','g-other'), (16,1,'4','4','Same Name',NULL)`);
    // A fresh URL prevents the route response cache from hiding the new stored coverage.
    const unrelated = await request("/career/history/g-zero?refresh=1");
    expect(getJsonBody(unrelated)).toEqual(
      expect.objectContaining({
        events: [],
        coverage: expect.objectContaining({ openingDraftPresent: true }),
      }),
    );
    const linked = await request("/career/history/g-other");
    expect(getJsonBody(linked)).toEqual(
      expect.objectContaining({
        events: [
          expect.objectContaining({
            type: "draft",
            draftType: "opening",
            season: null,
            date: null,
            team: { id: "2", name: "Carolina Hurricanes" },
            originalOwner: { id: "archived-team", name: "archived-team" },
          }),
        ],
      }),
    );
    expectObjectSchema("CareerHistory", getJsonBody(linked));
    expect((await request("/career/history/unknown")).statusCode).toBe(404);
  } finally {
    await context.cleanup();
  }
});

test("same-day trades stay separate, while same-time extra blocks and differing periods remain explicit", async () => {
  const context = await createIntegrationDb();
  try {
    await context.insertPlayers([
      {
        playerId: "p1",
        name: "Player",
        position: "F",
        teamId: "2",
        season: 2024,
        reportType: "regular",
      },
    ]);
    await context.db.execute(`INSERT INTO fantrax_entities
      (fantrax_id,name,position,first_seen_season,last_seen_season)
      VALUES ('prospect','Linked Prospect','F',2024,2024)`);
    let index = 0;
    for (const [date, periods] of [
      ["2025-01-10T12:00:00.000Z", [10, 10]],
      ["2025-01-10T13:00:00.000Z", [10, 11]],
      ["2025-01-10T14:00:00.000Z", [10, 10, 10, 10]],
      ["2025-01-10T15:00:00.000Z", [10]],
    ] as const) {
      for (const [offset, period] of periods.entries()) {
        await insertBlock(
          context.db,
          index++,
          [
            {
              from: offset % 2 ? "4" : "2",
              to: offset % 2 ? "2" : "4",
              entity: "p1",
              name: "Player",
            },
          ],
          { date, period },
        );
      }
    }
    // A distinct source file at the same time is not silently folded into another package.
    await insertBlock(
      context.db,
      0,
      [{ from: "2", to: "4", entity: "p1", name: "Player" }],
      { file: "separate.csv" },
    );
    await insertBlock(
      context.db,
      1,
      [
        { from: "4", to: "2", entity: "prospect", name: "Linked Prospect" },
        { from: "4", to: "2", name: "Unresolved", position: "D" },
        { from: "4", to: "2", name: "Future consideration", kind: "other" },
      ],
      { file: "separate.csv" },
    );

    const history = await request("/career/history/p1");
    expect(history.statusCode).toBe(200);
    const body = getJsonBody<{
      events: Array<{ status: string; tradeId: string; date: string }>;
    }>(history);
    expect(body.events.map((event) => event.status)).toEqual([
      "incomplete",
      "ambiguous",
      "ambiguous",
      "reconstructed",
      "reconstructed",
    ]);
    expect(new Set(body.events.map((event) => event.tradeId)).size).toBe(5);
    expectObjectSchema("CareerHistory", body);
    for (const event of body.events) {
      const detail = await request(`/transactions/trades/${event.tradeId}`);
      expect(detail.statusCode).toBe(200);
      expectObjectSchema("TradeDetail", getJsonBody(detail));
      expect(getJsonBody(detail)).toEqual(
        expect.objectContaining({ status: event.status }),
      );
      if (event.date.includes("14:00")) {
        expect(getJsonBody<{ blocks: unknown[] }>(detail).blocks).toHaveLength(
          4,
        );
      }
    }
    const originalId = body.events.find((event) =>
      event.date.includes("15:00"),
    )!.tradeId;
    await context.db.execute(
      "UPDATE trade_source_blocks SET source_block_index = source_block_index + 100",
    );
    const rebuilt = await request("/career/history/p1?refresh=1");
    expect(
      getJsonBody<{ events: Array<{ tradeId: string }> }>(rebuilt).events[0]
        .tradeId,
    ).toBe(originalId);
  } finally {
    await context.cleanup();
  }
});

test("drafts, dated claims/drops, and tied timestamps use deterministic ordering without inventing dates", async () => {
  const context = await createIntegrationDb();
  try {
    await context.insertPlayers([
      {
        playerId: "p1",
        name: "Player",
        position: "F",
        teamId: "2",
        season: 2024,
        reportType: "regular",
      },
    ]);
    await context.db.execute(`INSERT INTO entry_draft_picks
      (season,pick_number,round,drafted_team_id,owner_team_id,player_name,fantrax_entity_id)
      VALUES (2024,15,1,'2','4','Player','p1'), (2023,15,1,'4','4','Player','p1')`);
    await context.db.execute(`INSERT INTO opening_draft_picks
      (pick_number,round,drafted_team_id,owner_team_id,player_name,fantrax_entity_id)
      VALUES (20,1,'2','2','Player','p1')`);
    await context.db.execute(`INSERT INTO claim_events
      (season,team_id,occurred_at,source_file,source_group_index)
      VALUES (2024,'2','2024-11-01T12:00:00.000Z','claims-2024-2025.csv',0)`);
    await context.db.execute(`INSERT INTO claim_event_items
      (claim_event_id,season,team_id,occurred_at,sequence,action_type,fantrax_entity_id,raw_name,match_status,match_strategy)
      VALUES (1,2024,'2','2024-11-01T12:00:00.000Z',0,'drop','p1','Player','matched','exact_name_position'),
             (1,2024,'2','2024-11-01T12:00:00.000Z',1,'claim','p1','Player','matched','exact_name_position')`);
    const history = await request("/career/history/p1");
    expect(history.statusCode).toBe(200);
    const body = getJsonBody<{
      events: Array<{
        type: string;
        season: number | null;
        date: string | null;
      }>;
    }>(history);
    expect(body.events.map((event) => [event.type, event.season])).toEqual([
      ["drop", 2024],
      ["claim", 2024],
      ["draft", 2024],
      ["draft", 2023],
      ["draft", null],
    ]);
    expectObjectSchema("CareerHistory", body);
    const unchanged = await request("/career/history/p1", {
      "if-none-match": String(history.getHeader("etag")),
    });
    expect(unchanged.statusCode).toBe(304);
  } finally {
    await context.cleanup();
  }
});

test.each([
  "not-a-trade",
  Buffer.from("null").toString("base64url"),
  Buffer.from("[]").toString("base64url"),
  Buffer.from('["2024","file","date","2|4"]').toString("base64url"),
  Buffer.from('[2024,"","date","2|4"]').toString("base64url"),
  Buffer.from('[2024,"file",null,"2|4"]').toString("base64url"),
  `${Buffer.from('[2024,"file","date","2|4"]').toString("base64url")}=`,
  Buffer.from('[2024,"unknown.csv","2025-01-10T12:00:00.000Z","2|4"]').toString(
    "base64url",
  ),
])("invalid or unknown trade id returns an uncached 404: %s", async (id) => {
  const context = await createIntegrationDb();
  try {
    const res = await request(`/transactions/trades/${id}`);
    expect(res.statusCode).toBe(404);
    expect(res._getData()).toBe("Trade not found");
    expect(res.getHeader("Cache-Control")).toContain("no-store");
  } finally {
    await context.cleanup();
  }
});

test("history database errors are uncached failures and leave the career statistics endpoint usable", async () => {
  const context = await createIntegrationDb();
  try {
    await context.insertPlayers([
      {
        playerId: "p1",
        name: "Player",
        position: "F",
        teamId: "2",
        season: 2024,
        reportType: "regular",
      },
    ]);
    await context.db.execute("DROP TABLE claim_event_items");
    const failure = await request("/career/history/p1");
    expect(failure.statusCode).toBe(500);
    expect(failure.getHeader("Cache-Control")).toContain("no-store");
    expect((await request("/career/player/p1")).statusCode).toBe(200);
  } finally {
    await context.cleanup();
  }
});
