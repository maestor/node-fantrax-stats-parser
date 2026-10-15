import { createRequest, createResponse } from "node-mocks-http";
import app from "../app.js";
import type {
  EntryDraftTeamGroup,
  OpeningDraftTeamGroup,
  ExpansionDraftGroup,
} from "../features/drafts/service.js";
import { createIntegrationDb } from "./integration-db.js";
import { expectArraySchema, expectObjectSchema } from "./openapi-schema.js";
import { getJsonBody } from "./routes.integration.helpers.js";

const request = async (url: string) => {
  const response = createResponse();
  await app(createRequest({ method: "GET", url }) as never, response);
  return response;
};

test("readers can find and open history-only skaters and goalies without inventing statistical seasons", async () => {
  const context = await createIntegrationDb();
  try {
    await context.db.execute(`INSERT INTO fantrax_entities
      (fantrax_id,name,position,first_seen_season,last_seen_season) VALUES
      ('02npi','Alex Mallet','F',2012,2012), ('04dut','Juuso Hietanen','D',2017,2017),
      ('prospect-g','Prospect Goalie','G',2026,2026), ('unknown-position','Unknown',NULL,2026,2026)`);
    await context.insertPlayers([
      {
        playerId: "zero",
        name: "Zero Games",
        position: "D",
        teamId: "1",
        season: 2024,
        reportType: "regular",
      },
    ]);
    for (const [kind, id, name, position] of [
      ["player", "02npi", "Alex Mallet", "F"],
      ["player", "04dut", "Juuso Hietanen", "D"],
      ["goalie", "prospect-g", "Prospect Goalie", "G"],
    ]) {
      const profile = await request(`/career/${kind}/${id}`);
      expect(profile.statusCode).toBe(200);
      expect(getJsonBody(profile)).toEqual({ id, name, position });
      expectObjectSchema(
        kind === "player" ? "CareerPlayerProfile" : "CareerGoalieProfile",
        getJsonBody(profile),
      );
      const history = await request(`/career/history/${id}`);
      expect(history.statusCode).toBe(200);
      expectObjectSchema("CareerHistory", getJsonBody(history));
    }
    for (const [list, id] of [
      ["players", "02npi"],
      ["goalies", "prospect-g"],
    ]) {
      const response = await request(`/career/${list}`);
      const body = getJsonBody<Array<Record<string, unknown>>>(response);
      expect(response.statusCode).toBe(200);
      expectArraySchema(
        list === "players" ? "CareerPlayerListItem" : "CareerGoalieListItem",
        body,
      );
      expect(body.find((row) => row.id === id)).toEqual(
        expect.objectContaining({
          firstSeason: null,
          lastSeason: null,
          seasonsOwned: 0,
          teamsOwned: 0,
          seasonsPlayedRegular: 0,
          seasonsPlayedPlayoffs: 0,
          teamsPlayedRegular: 0,
          teamsPlayedPlayoffs: 0,
          regularGames: 0,
          playoffGames: 0,
        }),
      );
      expect(body.some((row) => row.id === "unknown-position")).toBe(false);
      expect(body.filter((row) => row.id === "zero")).toHaveLength(
        list === "players" ? 1 : 0,
      );
    }
    const zero = await request("/career/player/zero");
    expectObjectSchema("CareerPlayer", getJsonBody(zero));
    for (const path of [
      "/career/player/prospect-g",
      "/career/goalie/02npi",
      "/career/player/missing",
      "/career/goalie/missing",
      "/career/player/unknown-position",
      "/career/history/missing",
    ]) {
      expect((await request(path)).statusCode).toBe(404);
    }
    expect(
      (await context.db.execute("SELECT count(*) AS count FROM players"))
        .rows[0].count,
    ).toBe(1);
  } finally {
    await context.cleanup();
  }
});

test("linked draft selections and trade assets open history-only identities while played flags remain false", async () => {
  const context = await createIntegrationDb();
  try {
    await context.db.execute(`INSERT INTO fantrax_entities
      (fantrax_id,name,position,first_seen_season,last_seen_season) VALUES
      ('prospect','Prospect','F',2026,2026), ('goalie','Goalie','G',2026,2026)`);
    await context.db.execute(`INSERT INTO entry_draft_picks
      (season,pick_number,round,drafted_team_id,owner_team_id,player_name,fantrax_entity_id)
      VALUES (2026,1,1,'1','1','Prospect','prospect')`);
    await context.db.execute(`INSERT INTO opening_draft_picks
      (pick_number,round,drafted_team_id,owner_team_id,player_name,fantrax_entity_id)
      VALUES (1,1,'1','1','Goalie','goalie')`);
    await context.db.execute(`INSERT INTO expansion_draft_picks
      (season,selection_number,expansion_team_id,source_team_id,raw_player_name,player_name,position,fantrax_entity_id,source_url)
      VALUES (2021,1,'33','1','Prospect','Prospect','F','prospect','https://example.com')`);
    await context.db.execute(`INSERT INTO trade_source_blocks
      (season,occurred_at,source_file,source_block_index,source_period,participant_signature)
      VALUES (2026,'2026-07-01T12:00:00.000Z','trades.csv',0,1,'1|2')`);
    await context.db.execute(`INSERT INTO trade_block_items
      (trade_source_block_id,sequence,from_team_id,to_team_id,asset_type,fantrax_entity_id,raw_name,raw_position,match_status,match_strategy,raw_asset_text)
      VALUES (1,0,'1','2','player','prospect','Prospect','F','matched','exact_name_position','Prospect'),
      (1,1,'2','1','player','goalie','Goalie','G','matched','exact_name_position','Goalie')`);
    const entry = getJsonBody<EntryDraftTeamGroup[]>(
      await request("/draft/entry"),
    );
    expect(entry[0].seasons[0].picks[0]).toMatchObject({
      careerProfile: { id: "prospect", type: "player" },
      playedInLeague: false,
      playedForDraftingTeam: false,
    });
    const opening = getJsonBody<OpeningDraftTeamGroup[]>(
      await request("/draft/original"),
    );
    expect(opening[0].picks[0].careerProfile).toEqual({
      id: "goalie",
      type: "goalie",
    });
    const expansion = getJsonBody<ExpansionDraftGroup[]>(
      await request("/draft/expansion"),
    );
    expect(expansion[0].picks[0].careerProfile).toEqual({
      id: "prospect",
      type: "player",
    });
    const history = await request("/career/history/prospect");
    expect(history.statusCode).toBe(200);
    const body = getJsonBody<{
      events: Array<{ type: string; tradeId?: string }>;
    }>(history);
    expect(body.events.map((event) => event.type)).toEqual([
      "trade",
      "draft",
      "expansion",
    ]);
    const trade = await request(
      `/transactions/trades/${body.events[0].tradeId}`,
    );
    expectObjectSchema("TradeDetail", getJsonBody(trade));
    const assets = getJsonBody<{
      blocks: Array<{ assets: Array<{ careerType: string }> }>;
    }>(trade).blocks[0].assets;
    expect(assets.map((asset) => asset.careerType)).toEqual([
      "player",
      "goalie",
    ]);
  } finally {
    await context.cleanup();
  }
});
