import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { jest } from "@jest/globals";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  importTransactionsToDb,
  backfillTransactionEntities,
} from "../../scripts/transaction-import-lib.js";
import { createFantraxTransactionEntityLookup } from "../../scripts/fantrax-transaction-entities.js";
import { createIntegrationDb } from "./integration-db.js";

const headers =
  '"Player","Team","Position","Type","Team","Date (EDT)","Period"';
const sourceRow = (
  id: string,
  name: string,
  position: string,
  team: string,
) => ({
  executed: true,
  deleted: false,
  scorer: { scorerId: id, name, posShortNames: position },
  cells: [{ key: "team", content: team }],
});

async function setup() {
  const context = await createIntegrationDb();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ffhl-entity-recovery-"));
  await fs.writeFile(
    path.join(dir, "fantrax-leagues.json"),
    JSON.stringify({ seasons: [{ year: 2026, leagueId: "league-2026" }] }),
  );
  await fs.writeFile(
    path.join(dir, "fantrax-auth.json"),
    JSON.stringify({
      cookies: [
        {
          name: "session",
          value: "fixture",
          domain: ".fantrax.com",
          path: "/",
          expires: -1,
        },
        {
          name: "other",
          value: "private",
          domain: "example.com",
          path: "/",
          expires: -1,
        },
      ],
    }),
  );
  await fs.writeFile(
    path.join(dir, "claims-2026-2027.csv"),
    [
      headers,
      '"Hugo Pettersson","(N/A)","F","Claim","Colorado Avalanche","Wed Jun 24, 2026, 1:41PM","1"',
      '"Hugo Pettersson","(N/A)","F","Drop","Colorado Avalanche","Sat Jun 27, 2026, 4:24PM","1"',
    ].join("\n"),
  );
  const fetchSpy = jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      expect(String(input)).toBe(
        "https://www.fantrax.com/fxpa/req?leagueId=league-2026",
      );
      expect(new Headers(init?.headers).get("cookie")).toBe("session=fixture");
      expect(init?.redirect).toBe("error");
      const { data } = JSON.parse(String(init?.body)).msgs[0];
      return Response.json({
        responses: [
          {
            data: {
              paginatedResultSet: {
                totalNumPages: 1,
                pageNumber: data.pageNumber,
              },
              table: {
                rows:
                  data.view === "CLAIM_DROP"
                    ? [
                        sourceRow(
                          "074qj",
                          "Hugo Pettersson",
                          "F",
                          "Colorado Avalanche",
                        ),
                      ]
                    : [],
              },
            },
          },
        ],
      });
    });
  return {
    ...context,
    dir,
    fetchSpy,
    lookup: createFantraxTransactionEntityLookup({ artifactDir: dir }),
    cleanup: async () => {
      fetchSpy.mockRestore();
      await context.cleanup();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

describe("transaction-only identity recovery", () => {
  test.each([false, true])(
    "recovers the provider ID and preserves stats (dry run: %s)",
    async (dryRun) => {
      const c = await setup();
      try {
        await c.insertPlayers([
          {
            teamId: "1",
            season: 2026,
            reportType: "regular",
            playerId: "existing",
            name: "Existing Player",
            position: "F",
            games: 3,
            points: 7,
          },
        ]);
        const before = await c.db.execute("SELECT * FROM players");
        const summary = await importTransactionsToDb({
          db: c.db,
          csvDir: c.dir,
          findMissingEntity: c.lookup,
          dryRun,
        });
        expect(summary).toMatchObject({
          claimItems: 2,
          unresolvedClaimItems: 0,
          recoveredEntities: 1,
        });
        expect((await c.db.execute("SELECT * FROM players")).rows).toEqual(
          before.rows,
        );
        expect((await c.db.execute("SELECT * FROM goalies")).rows).toEqual([]);
        expect(
          (
            await c.db.execute(
              "SELECT fantrax_entity_id FROM claim_event_items",
            )
          ).rows,
        ).toEqual(
          dryRun
            ? []
            : [{ fantrax_entity_id: "074qj" }, { fantrax_entity_id: "074qj" }],
        );
        expect(
          (
            await c.db.execute(
              "SELECT fantrax_id, name FROM fantrax_entities WHERE fantrax_id = '074qj'",
            )
          ).rows,
        ).toEqual(
          dryRun ? [] : [{ fantrax_id: "074qj", name: "Hugo Pettersson" }],
        );
        if (!dryRun) {
          c.fetchSpy.mockClear();
          await importTransactionsToDb({
            db: c.db,
            csvDir: c.dir,
            findMissingEntity: c.lookup,
          });
          expect(c.fetchSpy).not.toHaveBeenCalled();
        }
      } finally {
        await c.cleanup();
      }
    },
  );

  test("backfills links in place, supports dry runs, and is idempotent", async () => {
    const c = await setup();
    try {
      await importTransactionsToDb({ db: c.db, csvDir: c.dir });
      const before = (await c.db.execute("SELECT * FROM claim_event_items"))
        .rows;
      const events = (await c.db.execute("SELECT * FROM claim_events")).rows;
      expect(
        await backfillTransactionEntities({
          db: c.db,
          findMissingEntity: c.lookup,
          dryRun: true,
        }),
      ).toMatchObject({
        resolvedItems: 2,
        recoveredEntities: 1,
        unresolvedItems: 0,
      });
      expect(
        (await c.db.execute("SELECT * FROM claim_event_items")).rows,
      ).toEqual(before);
      expect(
        (await c.db.execute("SELECT * FROM fantrax_entities")).rows,
      ).toEqual([]);
      expect(
        await backfillTransactionEntities({
          db: c.db,
          findMissingEntity: c.lookup,
        }),
      ).toMatchObject({ resolvedItems: 2, recoveredEntities: 1 });
      expect((await c.db.execute("SELECT * FROM claim_events")).rows).toEqual(
        events,
      );
      expect(
        (await c.db.execute("SELECT * FROM claim_event_items")).rows,
      ).toEqual(
        before.map((row) => ({
          ...row,
          fantrax_entity_id: "074qj",
          match_status: "matched",
          match_strategy: "exact_name_position",
        })),
      );
      expect(
        await backfillTransactionEntities({
          db: c.db,
          findMissingEntity: c.lookup,
        }),
      ).toMatchObject({ resolvedItems: 0, recoveredEntities: 0 });
      expect((await c.db.execute("SELECT * FROM players")).rows).toEqual([]);
    } finally {
      await c.cleanup();
    }
  });

  test("a failed provider lookup preserves the previously imported history", async () => {
    const c = await setup();
    try {
      await importTransactionsToDb({ db: c.db, csvDir: c.dir });
      const before = (await c.db.execute("SELECT * FROM claim_event_items"))
        .rows;
      c.fetchSpy.mockResolvedValue(
        new Response("Unauthorized", { status: 401 }),
      );
      await expect(
        importTransactionsToDb({
          db: c.db,
          csvDir: c.dir,
          findMissingEntity: c.lookup,
        }),
      ).rejects.toThrow(/session|login/i);
      expect(
        (await c.db.execute("SELECT * FROM claim_event_items")).rows,
      ).toEqual(before);
    } finally {
      await c.cleanup();
    }
  });
});

describe("provider transaction evidence", () => {
  test("reads later pages and trades, and refuses ambiguous, deleted or other-team identities", async () => {
    const c = await setup();
    try {
      c.fetchSpy.mockImplementation(async (_input, init) => {
        const { data } = JSON.parse(String(init?.body)).msgs[0];
        const rows =
          data.view === "TRADE"
            ? [
                {
                  ...sourceRow(
                    "trade-only",
                    "Trade Only",
                    "D",
                    "Colorado Avalanche",
                  ),
                  cells: [
                    { key: "from", content: "Colorado Avalanche" },
                    { key: "to", content: "Edmonton Oilers" },
                  ],
                },
              ]
            : data.pageNumber === 1
              ? [
                  sourceRow(
                    "wrong-team",
                    "Hugo Pettersson",
                    "F",
                    "Edmonton Oilers",
                  ),
                  {
                    ...sourceRow(
                      "deleted",
                      "Hugo Pettersson",
                      "F",
                      "Colorado Avalanche",
                    ),
                    deleted: true,
                  },
                  {
                    ...sourceRow(
                      "pending",
                      "Hugo Pettersson",
                      "F",
                      "Colorado Avalanche",
                    ),
                    executed: false,
                  },
                  {
                    ...sourceRow(
                      "draft-pick",
                      "Draft Pick",
                      "",
                      "Colorado Avalanche",
                    ),
                    scorer: {},
                  },
                ]
              : [
                  sourceRow(
                    "074qj",
                    "Hugo Pettersson",
                    "F",
                    "Colorado Avalanche",
                  ),
                  sourceRow("clash-a", "Same Name", "F", "Colorado Avalanche"),
                  sourceRow("clash-b", "Same Name", "F", "Colorado Avalanche"),
                ];
        return Response.json({
          responses: [
            {
              data: {
                paginatedResultSet: {
                  pageNumber: data.pageNumber,
                  totalNumPages: data.view === "TRADE" ? 1 : 2,
                },
                table: { rows },
              },
            },
          ],
        });
      });
      const summary = await importTransactionsToDb({
        db: c.db,
        csvDir: c.dir,
        findMissingEntity: c.lookup,
      });
      expect(summary).toMatchObject({
        unresolvedClaimItems: 0,
        recoveredEntities: 1,
      });
      expect(
        await c.lookup({
          name: "Trade Only",
          rawPosition: "F,D",
          season: 2026,
          teamIds: ["7"],
        }),
      ).toMatchObject({ fantraxId: "trade-only", position: "D" });
      expect(
        await c.lookup({
          name: "Same Name",
          rawPosition: "F",
          season: 2026,
          teamIds: ["1"],
        }),
      ).toEqual({ ambiguous: true });
      expect(
        await c.lookup({
          name: "Absent",
          rawPosition: "F",
          season: 2026,
          teamIds: ["1"],
        }),
      ).toBeNull();
      expect(c.fetchSpy).toHaveBeenCalledTimes(3);
    } finally {
      await c.cleanup();
    }
  });

  test.each([
    { pageError: { code: "LOGIN" } },
    { responses: [{ data: { table: { rows: [] } } }] },
    {
      responses: [
        {
          data: {
            table: { rows: [] },
            paginatedResultSet: { pageNumber: 0, totalNumPages: 1 },
          },
        },
      ],
    },
  ])(
    "rejects incomplete history without persisting identities",
    async (payload) => {
      const c = await setup();
      try {
        c.fetchSpy.mockResolvedValue(Response.json(payload));
        await expect(
          importTransactionsToDb({
            db: c.db,
            csvDir: c.dir,
            findMissingEntity: c.lookup,
          }),
        ).rejects.toThrow("incomplete transaction history");
        expect(
          (await c.db.execute("SELECT * FROM fantrax_entities")).rows,
        ).toEqual([]);
        expect((await c.db.execute("SELECT * FROM claim_events")).rows).toEqual(
          [],
        );
      } finally {
        await c.cleanup();
      }
    },
  );

  test("backfills only the selected season and includes unresolved trade players", async () => {
    const c = await setup();
    try {
      await fs.writeFile(
        path.join(c.dir, "trades-2026-2027.csv"),
        [
          '"Player","Team","Position","From","To","Date (EDT)","Period"',
          '"Hugo Pettersson","(N/A)","F","Colorado Avalanche","Edmonton Oilers","Mon Jun 29, 2026, 12:37PM","1"',
          '"Other Player","TOR","D","Edmonton Oilers","Colorado Avalanche","Mon Jun 29, 2026, 12:37PM","1"',
        ].join("\n"),
      );
      await importTransactionsToDb({ db: c.db, csvDir: c.dir });
      const trades = (await c.db.execute("SELECT * FROM trade_block_items"))
        .rows;
      expect(
        await backfillTransactionEntities({
          db: c.db,
          findMissingEntity: c.lookup,
          seasons: [2025],
        }),
      ).toMatchObject({ examinedItems: 0, recoveredEntities: 0 });
      expect(c.fetchSpy).not.toHaveBeenCalled();
      expect(
        await backfillTransactionEntities({
          db: c.db,
          findMissingEntity: c.lookup,
          seasons: [2026],
        }),
      ).toMatchObject({
        examinedItems: 4,
        resolvedItems: 3,
        unresolvedItems: 1,
        recoveredEntities: 1,
      });
      expect(
        (await c.db.execute("SELECT * FROM trade_block_items")).rows,
      ).toEqual(
        trades.map((row) =>
          row.raw_name === "Hugo Pettersson"
            ? { ...row, fantrax_entity_id: "074qj", match_status: "matched" }
            : row,
        ),
      );
      expect((await c.db.execute("SELECT * FROM players")).rows).toEqual([]);
      expect((await c.db.execute("SELECT * FROM goalies")).rows).toEqual([]);
    } finally {
      await c.cleanup();
    }
  });
});

test("keeps newly recovered namesakes distinct across fantasy teams", async () => {
  const c = await setup();
  try {
    await fs.appendFile(
      path.join(c.dir, "claims-2026-2027.csv"),
      '\n"Hugo Pettersson","(N/A)","F","Claim","Edmonton Oilers","Sun Jun 28, 2026, 1:41PM","1"',
    );
    c.fetchSpy.mockImplementation(async (_input, init) => {
      const { data } = JSON.parse(String(init?.body)).msgs[0];
      return Response.json({
        responses: [
          {
            data: {
              paginatedResultSet: {
                totalNumPages: 1,
                pageNumber: data.pageNumber,
              },
              table: {
                rows:
                  data.view === "CLAIM_DROP"
                    ? [
                        sourceRow(
                          "074qj",
                          "Hugo Pettersson",
                          "F",
                          "Colorado Avalanche",
                        ),
                        sourceRow(
                          "05uxb",
                          "Hugo Pettersson",
                          "F",
                          "Edmonton Oilers",
                        ),
                      ]
                    : [],
              },
            },
          },
        ],
      });
    });
    expect(
      await importTransactionsToDb({
        db: c.db,
        csvDir: c.dir,
        findMissingEntity: c.lookup,
      }),
    ).toMatchObject({ recoveredEntities: 2, unresolvedClaimItems: 0 });
    expect(
      (
        await c.db.execute(
          "SELECT team_id, fantrax_entity_id FROM claim_event_items ORDER BY occurred_at",
        )
      ).rows,
    ).toEqual([
      { team_id: "1", fantrax_entity_id: "074qj" },
      { team_id: "1", fantrax_entity_id: "074qj" },
      { team_id: "7", fantrax_entity_id: "05uxb" },
    ]);
  } finally {
    await c.cleanup();
  }
});

test("the backfill CLI wires provider recovery and refreshes only transaction snapshots", async () => {
  const c = await setup();
  try {
    await importTransactionsToDb({ db: c.db, csvDir: c.dir });
    const artifactDir = path.join(c.dir, "src/playwright/.fantrax");
    await fs.mkdir(artifactDir, { recursive: true });
    for (const file of ["fantrax-leagues.json", "fantrax-auth.json"])
      await fs.copyFile(path.join(c.dir, file), path.join(artifactDir, file));
    await fs.symlink(
      path.resolve("node_modules"),
      path.join(c.dir, "node_modules"),
    );
    await fs.symlink(path.resolve("scripts"), path.join(c.dir, "scripts"));
    await fs.writeFile(
      path.join(c.dir, "package.json"),
      JSON.stringify({
        scripts: {
          "snapshot:generate":
            "node --import tsx scripts/generate-snapshots.ts",
        },
      }),
    );
    const preload = path.join(c.dir, "provider-fixture.mjs");
    await fs.writeFile(
      preload,
      `globalThis.fetch = async (_url, init) => {
      const {data}=JSON.parse(init.body).msgs[0];
      return Response.json({responses:[{data:{paginatedResultSet:{pageNumber:data.pageNumber,totalNumPages:1},table:{rows:data.view==='CLAIM_DROP'?[${JSON.stringify(sourceRow("074qj", "Hugo Pettersson", "F", "Colorado Avalanche"))}]:[]}}}]});
    };`,
    );
    const run = promisify(execFile);
    const args = [
      "--import",
      preload,
      "--import",
      path.resolve("node_modules/tsx/dist/loader.mjs"),
      path.resolve("scripts/db-import-transactions.ts"),
      "--backfill-entities",
    ];
    const options = {
      cwd: c.dir,
      env: {
        ...process.env,
        USE_REMOTE_DB: "true",
        TURSO_AUTH_TOKEN: "",
        USE_R2_SNAPSHOTS: "false",
        NODE_OPTIONS: "",
      },
      timeout: 20000,
    };
    const preview = await run(
      process.execPath,
      [...args, "--dry-run"],
      options,
    );
    expect(preview.stdout).toContain("examined=2, resolved=2, unresolved=0");
    expect((await c.db.execute("SELECT * FROM fantrax_entities")).rows).toEqual(
      [],
    );
    expect(await fs.readdir(c.snapshotDir)).toEqual([]);
    const applied = await run(process.execPath, args, options);
    expect(applied.stdout).toContain("examined=2, resolved=2, unresolved=0");
    expect(
      (await c.db.execute("SELECT fantrax_entity_id FROM claim_event_items"))
        .rows,
    ).toEqual([{ fantrax_entity_id: "074qj" }, { fantrax_entity_id: "074qj" }]);
    const manifest = JSON.parse(
      await fs.readFile(path.join(c.snapshotDir, "manifest.json"), "utf8"),
    );
    expect(
      manifest.snapshots.map((entry: { key: string }) => entry.key).sort(),
    ).toEqual([
      "career/highlights/most-claims",
      "career/highlights/most-drops",
      "career/highlights/most-trades",
      "career/highlights/reunion-king",
      "leaderboard/transactions",
    ]);
    const repeated = await run(process.execPath, args, options);
    expect(repeated.stdout).toContain("examined=0, resolved=0, unresolved=0");
  } finally {
    await c.cleanup();
  }
}, 30000);

test("provider recovery preserves an existing canonical name when its ID is already registered", async () => {
  const c = await setup();
  try {
    await c.insertPlayers([
      {
        teamId: "1",
        season: 2026,
        reportType: "regular",
        playerId: "074qj",
        name: "Canonical Name",
        position: "F",
      },
    ]);
    const before = (await c.db.execute("SELECT * FROM fantrax_entities")).rows;
    expect(
      await importTransactionsToDb({
        db: c.db,
        csvDir: c.dir,
        findMissingEntity: c.lookup,
      }),
    ).toMatchObject({ unresolvedClaimItems: 0 });
    expect((await c.db.execute("SELECT * FROM fantrax_entities")).rows).toEqual(
      before,
    );
  } finally {
    await c.cleanup();
  }
});

test("uses a recovered registry identity for an older unresolved name without overriding ambiguous provider evidence", async () => {
  const c = await setup();
  try {
    await fs.appendFile(
      path.join(c.dir, "claims-2026-2027.csv"),
      '\n"Hugo Pettersson","(N/A)","F","Claim","Edmonton Oilers","Sun Jun 28, 2026, 1:41PM","1"',
    );
    await importTransactionsToDb({ db: c.db, csvDir: c.dir });
    const lookup = async (args: { teamIds: readonly string[] }) =>
      args.teamIds.includes("1")
        ? {
            fantraxId: "074qj",
            name: "Hugo Pettersson",
            position: "F" as const,
            firstSeenSeason: 2026,
            lastSeenSeason: 2026,
          }
        : null;
    expect(
      await backfillTransactionEntities({
        db: c.db,
        findMissingEntity: lookup,
        dryRun: true,
      }),
    ).toMatchObject({ resolvedItems: 3, recoveredEntities: 1 });
    const ambiguousLookup = async (args: { teamIds: readonly string[] }) =>
      args.teamIds.includes("1") ? lookup(args) : { ambiguous: true as const };
    expect(
      await backfillTransactionEntities({
        db: c.db,
        findMissingEntity: ambiguousLookup,
        dryRun: true,
      }),
    ).toMatchObject({ resolvedItems: 2, unresolvedItems: 1 });
    expect((await c.db.execute("SELECT * FROM fantrax_entities")).rows).toEqual(
      [],
    );
  } finally {
    await c.cleanup();
  }
});

test("one backfill also repairs earlier rows after a later season supplies the identity", async () => {
  const c = await setup();
  try {
    await fs.writeFile(
      path.join(c.dir, "claims-2025-2026.csv"),
      [
        headers,
        '"Hugo Pettersson","(N/A)","F","Claim","Colorado Avalanche","Wed Jun 24, 2025, 1:41PM","1"',
      ].join("\n"),
    );
    await importTransactionsToDb({ db: c.db, csvDir: c.dir });
    const lookup = async (args: { season: number }) =>
      args.season === 2025
        ? null
        : {
            fantraxId: "074qj",
            name: "Hugo Pettersson",
            position: "F" as const,
            firstSeenSeason: 2026,
            lastSeenSeason: 2026,
          };
    expect(
      await backfillTransactionEntities({
        db: c.db,
        findMissingEntity: lookup,
      }),
    ).toMatchObject({
      examinedItems: 3,
      resolvedItems: 3,
      unresolvedItems: 0,
      recoveredEntities: 1,
    });
    expect(
      (
        await c.db.execute(
          "SELECT first_seen_season, last_seen_season FROM fantrax_entities",
        )
      ).rows,
    ).toEqual([{ first_seen_season: 2025, last_seen_season: 2026 }]);
    expect(
      await backfillTransactionEntities({
        db: c.db,
        findMissingEntity: lookup,
      }),
    ).toMatchObject({ examinedItems: 0, recoveredEntities: 0 });
  } finally {
    await c.cleanup();
  }
});

test("reads shared team cells for transaction continuations, including across pages", async () => {
  const c = await setup();
  try {
    c.fetchSpy.mockImplementation(async (_input, init) => {
      const { data } = JSON.parse(String(init?.body)).msgs[0];
      const rows =
        data.view === "TRADE"
          ? []
          : data.pageNumber === 1
            ? [
                {
                  executed: true,
                  txSetId: "group-a",
                  scorer: {},
                  cells: [
                    { key: "team", content: "Colorado Avalanche", rowspan: 2 },
                  ],
                },
              ]
            : [
                {
                  ...sourceRow(
                    "074qj",
                    "Hugo Pettersson",
                    "F",
                    "Colorado Avalanche",
                  ),
                  txSetId: "group-a",
                  cells: [{ key: "week", content: "1" }],
                },
                {
                  ...sourceRow("00412", "Mike Sauer", "D", "Vancouver Canucks"),
                  txSetId: "different-group",
                  cells: [{ key: "week", content: "1" }],
                },
              ];
      return Response.json({
        responses: [
          {
            data: {
              paginatedResultSet: {
                pageNumber: data.pageNumber,
                totalNumPages: data.view === "TRADE" ? 1 : 2,
              },
              table: { rows },
            },
          },
        ],
      });
    });
    expect(
      await c.lookup({
        name: "Hugo Pettersson",
        rawPosition: "F",
        season: 2026,
        teamIds: ["1"],
      }),
    ).toMatchObject({ fantraxId: "074qj" });
    expect(
      await c.lookup({
        name: "Mike Sauer",
        rawPosition: "D",
        season: 2026,
        teamIds: ["1"],
      }),
    ).toBeNull();
  } finally {
    await c.cleanup();
  }
});

test("links a grouped drop to the existing ID when historical positions differ", async () => {
  const c = await setup();
  try {
    await c.insertPlayers([
      {
        teamId: "18",
        season: 2012,
        reportType: "regular",
        playerId: "02j3s",
        name: "Matt Mangene",
        position: "D",
      },
    ]);
    await fs.writeFile(
      path.join(c.dir, "claims-2026-2027.csv"),
      [
        headers,
        '"Matt Mangene","PHI","F","Drop","Boston Bruins","Fri Jun 14, 2026, 11:23AM","1"',
      ].join("\n"),
    );
    await importTransactionsToDb({ db: c.db, csvDir: c.dir });
    const entities = (await c.db.execute("SELECT * FROM fantrax_entities"))
      .rows;
    const players = (await c.db.execute("SELECT * FROM players")).rows;
    c.fetchSpy.mockImplementation(async (_input, init) => {
      const { data } = JSON.parse(String(init?.body)).msgs[0];
      return Response.json({
        responses: [
          {
            data: {
              paginatedResultSet: {
                pageNumber: data.pageNumber,
                totalNumPages: 1,
              },
              table: {
                rows:
                  data.view === "TRADE"
                    ? []
                    : [
                        {
                          executed: true,
                          txSetId: "mangene-drop",
                          scorer: {},
                          cells: [
                            {
                              key: "team",
                              content: "Boston Bruins",
                              rowspan: 2,
                            },
                          ],
                        },
                        {
                          ...sourceRow(
                            "02j3s",
                            "Matt Mangene",
                            "F",
                            "Boston Bruins",
                          ),
                          txSetId: "mangene-drop",
                          cells: [{ key: "week", content: "1" }],
                        },
                      ],
              },
            },
          },
        ],
      });
    });
    expect(
      await backfillTransactionEntities({
        db: c.db,
        findMissingEntity: c.lookup,
      }),
    ).toMatchObject({ resolvedItems: 1, unresolvedItems: 0 });
    expect(
      (
        await c.db.execute(
          "SELECT raw_position,fantrax_entity_id FROM claim_event_items",
        )
      ).rows,
    ).toEqual([{ raw_position: "F", fantrax_entity_id: "02j3s" }]);
    expect((await c.db.execute("SELECT * FROM fantrax_entities")).rows).toEqual(
      entities,
    );
    expect((await c.db.execute("SELECT * FROM players")).rows).toEqual(players);
  } finally {
    await c.cleanup();
  }
});
