import fs from "fs";
import path from "path";
import {
  EXPANSION_DRAFT_SOURCES,
  parseExpansionDraftHtml,
} from "../features/drafts/expansion-parser.js";

const html = (team: string) =>
  fs.readFileSync(
    path.join(
      process.cwd(),
      "src/__tests__/fixtures/expansion-drafts",
      `${team}.html`,
    ),
    "utf8",
  );

test("the operator extracts all 30 Vegas selections, source teams, and optional positions from the public first post", () => {
  const draft = parseExpansionDraftHtml(
    html("vegas"),
    EXPANSION_DRAFT_SOURCES[0],
  );
  expect(draft.season).toBe(2017);
  expect(draft.teamId).toBe("32");
  expect(draft.picks).toHaveLength(30);
  expect(draft.picks[9]).toEqual({
    selectionNumber: 10,
    sourceTeamId: "30",
    playerName: "Chris Martenet",
    position: "F",
  });
  expect(draft.picks[18]).toEqual({
    selectionNumber: 19,
    sourceTeamId: "5",
    playerName: "Alex Edler",
    position: "D",
  });
  expect(draft.picks[28]).toEqual({
    selectionNumber: 29,
    sourceTeamId: "4",
    playerName: "Gabriel Dumont",
    position: null,
  });
});

test("the operator extracts both Seattle baskets as one list and ignores later posts", () => {
  const draft = parseExpansionDraftHtml(
    `${html("seattle")}<div class="bbWrapper">TOR FW Unrelated reply</div>`,
    EXPANSION_DRAFT_SOURCES[1],
  );
  expect(draft.season).toBe(2021);
  expect(draft.picks).toHaveLength(30);
  expect(draft.picks[0]).toEqual({
    selectionNumber: 1,
    sourceTeamId: "19",
    playerName: "Pavel Zacha",
    position: "F",
  });
  expect(draft.picks[29]).toEqual({
    selectionNumber: 30,
    sourceTeamId: "14",
    playerName: "Artyom Zagidulin",
    position: "G",
  });
});

test.each([
  [
    "unrecognized selection",
    html("vegas").replace("ARI    Dmitry Korobov    d", "Invalid selection"),
  ],
  ["no first post", "<html>Login required</html>"],
  ["an unfinished first post", '<div class="bbWrapper">TOR Player'],
  ["missing selections", '<div class="bbWrapper">TOR Player, F</div>'],
  [
    "unknown source team",
    html("vegas").replace("WIN    Chris", "XYZ    Chris"),
  ],
  [
    "duplicate source team",
    html("vegas").replace("WIN    Chris", "TOR    Chris"),
  ],
])(
  "the operator is warned about %s instead of silently losing selections",
  (_label, input) => {
    expect(() =>
      parseExpansionDraftHtml(input, EXPANSION_DRAFT_SOURCES[0]),
    ).toThrow();
  },
);
