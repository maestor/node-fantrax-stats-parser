import fs from "fs";
import path from "path";
import {
  EXPANSION_DRAFT_SOURCES,
  parseExpansionDraftHtml,
  type ExpansionDraft,
} from "../features/drafts/expansion-parser.js";
import { importExpansionDraftsToDb } from "../features/drafts/expansion-import.js";
import type { ExpansionDraftGroup } from "../features/drafts/service.js";
import type { CareerHistory } from "../features/transactions/types.js";
import { expectArraySchema, expectObjectSchema } from "./openapi-schema.js";
import { createRequest, createResponse } from "node-mocks-http";
import app from "../app.js";
import { createIntegrationDb } from "./integration-db.js";
import { getJsonBody } from "./routes.integration.helpers.js";

const request = async (url: string) => {
  const res = createResponse();
  await app(createRequest({ method: "GET", url }) as never, res);
  return res;
};

test("an expansion draft reader sees an empty list before selections have been imported", async () => {
  const context = await createIntegrationDb();
  try {
    const res = await request("/draft/expansion");
    expect(res.statusCode).toBe(200);
    expect(getJsonBody(res)).toEqual([]);
  } finally {
    await context.cleanup();
  }
});

test("the operator imports both public drafts and readers see source teams, career links, and undated expansion history", async () => {
  const context = await createIntegrationDb();
  try {
    const drafts = await loadDrafts();
    await seedEntities(context, drafts);
    await context.insertPlayers([
      {
        playerId: "vegas-12",
        name: "Nicholas Shore",
        position: "F",
        teamId: "32",
        season: 2017,
        reportType: "regular",
        games: 0,
      },
      {
        playerId: "seattle-1",
        name: "Pavel Zacha",
        position: "F",
        teamId: "28",
        season: 2021,
        reportType: "regular",
        games: 50,
      },
    ]);
    await context.insertGoalies([
      {
        goalieId: "seattle-19",
        name: "Tristan Jarry",
        teamId: "28",
        season: 2021,
        reportType: "regular",
        games: 0,
      },
    ]);
    const dryRun = await importExpansionDraftsToDb({
      db: context.db,
      drafts,
      dryRun: true,
    });
    expect(dryRun.matchedCount).toBe(60);
    expect(
      (
        await context.db.execute(
          "SELECT COUNT(*) AS count FROM expansion_draft_picks",
        )
      ).rows[0].count,
    ).toBe(0);
    const summary = await importExpansionDraftsToDb({ db: context.db, drafts });
    expect(summary.matchedCount).toBe(60);
    const res = await request("/draft/expansion");
    expect(res.statusCode).toBe(200);
    const groups = getJsonBody<ExpansionDraftGroup[]>(res);
    expectArraySchema("ExpansionDraftGroup", groups);
    expect(
      groups.map((group) => [
        group.season,
        group.team.name,
        group.picks.length,
      ]),
    ).toEqual([
      [2021, "Seattle Kraken", 30],
      [2017, "Vegas Golden Knights", 30],
    ]);
    expect(groups[0].picks.map((pick) => pick.position)).toEqual([
      ...Array(18).fill("F"),
      ...Array(9).fill("D"),
      ...Array(3).fill("G"),
    ]);
    expect(
      groups[0].picks.find((pick) => pick.draftedPlayer === "Pavel Zacha"),
    ).toEqual(
      expect.objectContaining({
        sourceTeam: { id: "19", name: "Toronto Maple Leafs" },
        careerProfile: { id: "seattle-1", type: "player" },
      }),
    );
    expect(
      groups[0].picks.find((pick) => pick.draftedPlayer === "Tristan Jarry")
        ?.careerProfile,
    ).toEqual({ id: "seattle-19", type: "goalie" });
    expect(
      groups[1].picks.find((pick) => pick.draftedPlayer === "Juuso Hietanen")
        ?.careerProfile,
    ).toEqual({ id: "vegas-2", type: "player" });
    expect(
      groups[1].picks.find((pick) => pick.draftedPlayer === "Chris Martenet")
        ?.position,
    ).toBe("D");
    expect(
      groups[1].picks.find((pick) => pick.draftedPlayer === "Nicholas Shore")
        ?.careerProfile,
    ).toEqual({ id: "vegas-12", type: "player" });
    await context.db
      .execute(`INSERT INTO claim_events (season,team_id,occurred_at,source_file,source_group_index)
      VALUES (2021,'28','2021-07-20T12:00:00Z','claims.csv',0), (2021,'28','2021-12-20T12:00:00Z','claims.csv',1)`);
    await context.db
      .execute(`INSERT INTO claim_event_items (claim_event_id,season,team_id,occurred_at,sequence,action_type,fantrax_entity_id,raw_name,match_status,match_strategy)
      VALUES (1,2021,'28','2021-07-20T12:00:00Z',0,'claim','seattle-1','Pavel Zacha','matched','exact_name_position'),
      (2,2021,'28','2021-12-20T12:00:00Z',0,'drop','seattle-1','Pavel Zacha','matched','exact_name_position')`);
    const history = getJsonBody<CareerHistory>(
      await request("/career/history/seattle-1"),
    );
    expectObjectSchema("CareerHistory", history);
    expect(history.events).toEqual([
      expect.objectContaining({ type: "drop", season: 2021 }),
      {
        id: "expansion-2021-28-19",
        type: "expansion",
        season: 2021,
        date: null,
        fromTeam: { id: "19", name: "Toronto Maple Leafs" },
        team: { id: "28", name: "Seattle Kraken" },
      },
    ]);
    expect(history.coverage.expansionDraftSeasons).toEqual([2017, 2021]);
    expect(
      (
        await context.db.execute(
          "SELECT COUNT(*) AS count FROM claim_event_items",
        )
      ).rows[0].count,
    ).toBe(2);
    const identityHistory = await request("/career/history/vegas-2");
    expect(identityHistory.statusCode).toBe(200);
    expectObjectSchema("CareerHistory", getJsonBody(identityHistory));
    await importExpansionDraftsToDb({ db: context.db, drafts: [drafts[0]] });
    expect(
      (
        await context.db.execute(
          "SELECT COUNT(*) AS count FROM expansion_draft_picks",
        )
      ).rows[0].count,
    ).toBe(60);
  } finally {
    await context.cleanup();
  }
});

const loadDrafts = async () =>
  EXPANSION_DRAFT_SOURCES.map((source, index) =>
    parseExpansionDraftHtml(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "src/__tests__/fixtures/expansion-drafts",
          `${index === 0 ? "vegas" : "seattle"}.html`,
        ),
        "utf8",
      ),
      source,
    ),
  );

const seedEntities = async (
  context: Awaited<ReturnType<typeof createIntegrationDb>>,
  drafts: ExpansionDraft[],
) => {
  const names: Record<string, string> = {
    "CJ Motte": "C.J. Motte",
    "Nick Shore": "Nicholas Shore",
    "Alex Edler": "Alexander Edler",
    "Harri Säteri": "Harri Sateri",
  };
  for (const draft of drafts) {
    for (const pick of draft.picks) {
      const position =
        pick.playerName === "Chris Martenet" ||
        pick.playerName === "Connor Carrick"
          ? "D"
          : (pick.position ?? "F");
      await context.db.execute({
        sql: "INSERT INTO fantrax_entities (fantrax_id,name,position,first_seen_season,last_seen_season) VALUES (?,?,?,?,?)",
        args: [
          `${draft.teamId === "32" ? "vegas" : "seattle"}-${pick.selectionNumber}`,
          names[pick.playerName] ?? pick.playerName,
          position,
          draft.season - 1,
          draft.season,
        ],
      });
    }
  }
};

test("unresolved names remain visible, while dry runs and failed replacements preserve imported history", async () => {
  const context = await createIntegrationDb();
  try {
    const drafts = await loadDrafts();
    await seedEntities(context, drafts);
    await importExpansionDraftsToDb({
      db: context.db,
      drafts,
      importedAt: "2026-10-15T12:00:00Z",
    });
    await context.db.execute(
      "DELETE FROM fantrax_entities WHERE name = 'Tyler Bird'",
    );
    await context.db.execute(
      "INSERT INTO fantrax_entities (fantrax_id,name,position,first_seen_season,last_seen_season) VALUES ('duplicate','Colton Sissons','F',2012,2026)",
    );
    await context.db.execute(
      "UPDATE fantrax_entities SET position = NULL WHERE name = 'Harri Sateri'",
    );
    const summary = await importExpansionDraftsToDb({
      db: context.db,
      drafts,
      dryRun: true,
    });
    expect(summary.unresolved).toEqual([
      {
        season: 2017,
        playerName: "Tyler Bird",
        entityId: null,
        status: "unresolved_missing_entity",
      },
      {
        season: 2017,
        playerName: "Colton Sissons",
        entityId: null,
        status: "unresolved_ambiguous_entity",
      },
    ]);
    expect(
      (
        await context.db.execute(
          "SELECT value FROM import_metadata WHERE key='last_modified'",
        )
      ).rows[0].value,
    ).toBe("2026-10-15T12:00:00Z");
    await importExpansionDraftsToDb({ db: context.db, drafts });
    const groups = getJsonBody<ExpansionDraftGroup[]>(
      await request("/draft/expansion"),
    );
    expect(
      groups[1].picks.find((pick) => pick.draftedPlayer === "Tyler Bird")
        ?.careerProfile,
    ).toBeNull();
    const badDraft = {
      ...drafts[0],
      picks: [...drafts[0].picks, drafts[0].picks[0]],
    };
    await expect(
      importExpansionDraftsToDb({ db: context.db, drafts: [badDraft] }),
    ).rejects.toThrow();
    expect(
      (
        await context.db.execute(
          "SELECT COUNT(*) AS count FROM expansion_draft_picks",
        )
      ).rows[0].count,
    ).toBe(60);
    await context.db.execute(
      "DELETE FROM fantrax_entities WHERE name = 'Gabriel Dumont'",
    );
    await expect(
      importExpansionDraftsToDb({ db: context.db, drafts }),
    ).rejects.toThrow("Cannot determine expansion position for Gabriel Dumont");
    expect(
      (
        await context.db.execute(
          "SELECT COUNT(*) AS count FROM expansion_draft_picks",
        )
      ).rows[0].count,
    ).toBe(60);
    await context.db.execute("DROP TABLE expansion_draft_picks");
    const failed = await request("/draft/expansion?refresh=1");
    expect(failed.statusCode).toBe(500);
    expect(failed.getHeader("Cache-Control")).toContain("no-store");
  } finally {
    await context.cleanup();
  }
});

test("expansion selections precede other undated drafts within the same season without fabricating a date", async () => {
  const context = await createIntegrationDb();
  try {
    await context.insertPlayers([
      {
        playerId: "p1",
        name: "Expansion Rookie",
        position: "F",
        teamId: "28",
        season: 2021,
        reportType: "regular",
      },
    ]);
    await context.db
      .execute(`INSERT INTO entry_draft_picks (season,pick_number,round,drafted_team_id,owner_team_id,player_name,fantrax_entity_id)
      VALUES (2021,1,1,'19','19','Expansion Rookie','p1')`);
    await context.db
      .execute(`INSERT INTO expansion_draft_picks (season,selection_number,expansion_team_id,source_team_id,raw_player_name,player_name,position,fantrax_entity_id,source_url)
      VALUES (2021,1,'28','19','Expansion Rookie','Expansion Rookie','F','p1','forum')`);
    const history = getJsonBody<CareerHistory>(
      await request("/career/history/p1"),
    );
    expect(history.events.map((event) => [event.type, event.date])).toEqual([
      ["draft", null],
      ["expansion", null],
    ]);
  } finally {
    await context.cleanup();
  }
});
