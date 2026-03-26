import path from "path";

import {
  buildEntryDraftOutputPath,
  buildOpeningDraftOutputPath,
  parseEntryDraftHtml,
  parseOpeningDraftHtml,
} from "../features/drafts/parser.js";

const buildJsonLdScript = (payload: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;

const buildThreadHtml = (args: { headline: string; articleBody: string }): string =>
  `<!DOCTYPE html><html><head>${buildJsonLdScript({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: args.headline,
    articleBody: args.articleBody,
  })}</head><body></body></html>`;

describe("entry draft parser", () => {
  test("parses first-post draft rows, ignores non-pick lines, and resolves Utah aliases", () => {
    const html = `<!DOCTYPE html><html><head>
<script type="application/ld+json"></script>
<script type="application/ld+json">{not valid json}</script>
${buildJsonLdScript([
  "skip-me",
  null,
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    headline: "Ignored breadcrumb",
  },
  {
    "@context": "https://schema.org",
    "@type": ["DiscussionForumPosting"],
    headline: "Entry draft 2025 - varatut pelaajat",
    articleBody: `Round 1
1. BUF - Michael Misa
2. UTA (PHX) - Caleb Desnoyers

33. NJD (ARI) - Alexei Medvedev`,
  },
])}
</head><body></body></html>`;

    const parsed = parseEntryDraftHtml(html);

    expect(parsed.season).toBe(2025);
    expect(parsed.picks).toEqual([
      {
        season: 2025,
        round: 1,
        pickNumber: 1,
        playerName: "Michael Misa",
        draftedTeam: {
          abbreviation: "BUF",
          teamId: "21",
          teamName: "Buffalo Sabres",
        },
        originalOwnerTeam: {
          abbreviation: "BUF",
          teamId: "21",
          teamName: "Buffalo Sabres",
        },
      },
      {
        season: 2025,
        round: 1,
        pickNumber: 2,
        playerName: "Caleb Desnoyers",
        draftedTeam: {
          abbreviation: "UTA",
          teamId: "31",
          teamName: "Utah Mammoth",
        },
        originalOwnerTeam: {
          abbreviation: "PHX",
          teamId: "31",
          teamName: "Utah Mammoth",
        },
      },
      {
        season: 2025,
        round: 2,
        pickNumber: 33,
        playerName: "Alexei Medvedev",
        draftedTeam: {
          abbreviation: "NJD",
          teamId: "24",
          teamName: "New Jersey Devils",
        },
        originalOwnerTeam: {
          abbreviation: "ARI",
          teamId: "31",
          teamName: "Utah Mammoth",
        },
      },
    ]);
  });

  test("ignores non-team reward-note parentheses while still resolving traded picks", () => {
    const parsed = parseEntryDraftHtml(
      buildThreadHtml({
        headline: "Entry draft 2021 - varatut pelaajat",
        articleBody: `33. PHI (mestari) - Simon Robertsson

99. STL (MTL) (divisioonavoittaja) - Ethan Cardwell
100. CBJ (COL) (divisioonavoittaja) - Jake Chiasson

164. PHI - Lucas Forsell`,
      }),
    );

    expect(parsed.season).toBe(2021);
    expect(parsed.picks).toEqual([
      {
        season: 2021,
        round: 1,
        pickNumber: 33,
        playerName: "Simon Robertsson",
        draftedTeam: {
          abbreviation: "PHI",
          teamId: "22",
          teamName: "Philadelphia Flyers",
        },
        originalOwnerTeam: {
          abbreviation: "PHI",
          teamId: "22",
          teamName: "Philadelphia Flyers",
        },
      },
      {
        season: 2021,
        round: 2,
        pickNumber: 99,
        playerName: "Ethan Cardwell",
        draftedTeam: {
          abbreviation: "STL",
          teamId: "15",
          teamName: "St. Louis Blues",
        },
        originalOwnerTeam: {
          abbreviation: "MTL",
          teamId: "5",
          teamName: "Montreal Canadiens",
        },
      },
      {
        season: 2021,
        round: 2,
        pickNumber: 100,
        playerName: "Jake Chiasson",
        draftedTeam: {
          abbreviation: "CBJ",
          teamId: "27",
          teamName: "Columbus Blue Jackets",
        },
        originalOwnerTeam: {
          abbreviation: "COL",
          teamId: "1",
          teamName: "Colorado Avalanche",
        },
      },
      {
        season: 2021,
        round: 3,
        pickNumber: 164,
        playerName: "Lucas Forsell",
        draftedTeam: {
          abbreviation: "PHI",
          teamId: "22",
          teamName: "Philadelphia Flyers",
        },
        originalOwnerTeam: {
          abbreviation: "PHI",
          teamId: "22",
          teamName: "Philadelphia Flyers",
        },
      },
    ]);
  });

  test("skips empty and non-team uppercase parenthetical notes before finding a team abbreviation", () => {
    const parsed = parseEntryDraftHtml(
      buildThreadHtml({
        headline: "Entry draft 2021 - varatut pelaajat",
        articleBody: "1. BUF () (MVP) (PHX) - Michael Misa",
      }),
    );

    expect(parsed.picks).toEqual([
      {
        season: 2021,
        round: 1,
        pickNumber: 1,
        playerName: "Michael Misa",
        draftedTeam: {
          abbreviation: "BUF",
          teamId: "21",
          teamName: "Buffalo Sabres",
        },
        originalOwnerTeam: {
          abbreviation: "PHX",
          teamId: "31",
          teamName: "Utah Mammoth",
        },
      },
    ]);
  });

  test("maps 2013 SKIPATTU rows to null player names", () => {
    const parsed = parseEntryDraftHtml(
      buildThreadHtml({
        headline: "Entry draft 2013 - varatut pelaajat",
        articleBody: `129. WPG (VAN) - SKIPATTU
130. WPG (DAL) - SKIPATTU
131. BUF (WPG) - Patrik Bartosak`,
      }),
    );

    expect(parsed.picks).toEqual([
      {
        season: 2013,
        round: 1,
        pickNumber: 129,
        playerName: null,
        draftedTeam: {
          abbreviation: "WPG",
          teamId: "30",
          teamName: "Winnipeg Jets",
        },
        originalOwnerTeam: {
          abbreviation: "VAN",
          teamId: "4",
          teamName: "Vancouver Canucks",
        },
      },
      {
        season: 2013,
        round: 1,
        pickNumber: 130,
        playerName: null,
        draftedTeam: {
          abbreviation: "WPG",
          teamId: "30",
          teamName: "Winnipeg Jets",
        },
        originalOwnerTeam: {
          abbreviation: "DAL",
          teamId: "29",
          teamName: "Dallas Stars",
        },
      },
      {
        season: 2013,
        round: 1,
        pickNumber: 131,
        playerName: "Patrik Bartosak",
        draftedTeam: {
          abbreviation: "BUF",
          teamId: "21",
          teamName: "Buffalo Sabres",
        },
        originalOwnerTeam: {
          abbreviation: "WPG",
          teamId: "30",
          teamName: "Winnipeg Jets",
        },
      },
    ]);
  });

  test("parses opening draft rows with full team names and via chains", () => {
    const parsed = parseOpeningDraftHtml(
      buildThreadHtml({
        headline: "Varatut pelaajat järjestyksessä",
        articleBody: `Kierros 1

1. Anaheim Ducks - Jevgeni Malkin
22. Nashville Predators (via Boston Bruins) - Carey Price
26. Detroit Red Wings (via Nashville Predators) - Jimmy Howard
30. Calgary Flames - Cam Ward
31. Phoenix Coyotes - Zdeno Chara

Kierros 2

35. Boston Bruins (via Nashville Predators) - Braden Holtby
70. Edmonton Oilers (via Winnipeg Jets via Colorado Avalanche) - Martin St. Louis`,
      }),
    );

    expect(parsed.picks).toEqual([
      {
        round: 1,
        pickNumber: 1,
        playerName: "Jevgeni Malkin",
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
      },
      {
        round: 1,
        pickNumber: 22,
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
      },
      {
        round: 1,
        pickNumber: 26,
        playerName: "Jimmy Howard",
        draftedTeam: {
          abbreviation: "Detroit Red Wings",
          teamId: "6",
          teamName: "Detroit Red Wings",
        },
        originalOwnerTeam: {
          abbreviation: "Nashville Predators",
          teamId: "10",
          teamName: "Nashville Predators",
        },
      },
      {
        round: 1,
        pickNumber: 30,
        playerName: "Cam Ward",
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
      },
      {
        round: 1,
        pickNumber: 31,
        playerName: "Zdeno Chara",
        draftedTeam: {
          abbreviation: "Phoenix Coyotes",
          teamId: "31",
          teamName: "Utah Mammoth",
        },
        originalOwnerTeam: {
          abbreviation: "Phoenix Coyotes",
          teamId: "31",
          teamName: "Utah Mammoth",
        },
      },
      {
        round: 2,
        pickNumber: 35,
        playerName: "Braden Holtby",
        draftedTeam: {
          abbreviation: "Boston Bruins",
          teamId: "18",
          teamName: "Boston Bruins",
        },
        originalOwnerTeam: {
          abbreviation: "Nashville Predators",
          teamId: "10",
          teamName: "Nashville Predators",
        },
      },
      {
        round: 2,
        pickNumber: 70,
        playerName: "Martin St. Louis",
        draftedTeam: {
          abbreviation: "Edmonton Oilers",
          teamId: "7",
          teamName: "Edmonton Oilers",
        },
        originalOwnerTeam: {
          abbreviation: "Colorado Avalanche",
          teamId: "1",
          teamName: "Colorado Avalanche",
        },
      },
    ]);
  });

  test("falls back to the drafted team when a via segment does not contain a team name", () => {
    const parsed = parseOpeningDraftHtml(
      buildThreadHtml({
        headline: "Varatut pelaajat järjestyksessä",
        articleBody: "1. Anaheim Ducks (via) - Jevgeni Malkin",
      }),
    );

    expect(parsed.picks).toEqual([
      {
        round: 1,
        pickNumber: 1,
        playerName: "Jevgeni Malkin",
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
      },
    ]);
  });

  test("builds the default entry draft file naming convention", () => {
    expect(
      buildEntryDraftOutputPath({
        outDir: "tmp/drafts",
        season: 2025,
      }),
    ).toBe(path.resolve("tmp/drafts", "entry-draft-2025.json"));
  });

  test("builds the default opening draft file naming convention", () => {
    expect(
      buildOpeningDraftOutputPath({
        outDir: "tmp/drafts",
      }),
    ).toBe(path.resolve("tmp/drafts", "opening-draft.json"));
  });

  test("throws when structured draft data cannot be found in the html", () => {
    expect(() =>
      parseEntryDraftHtml(
        "<html><head><script type=\"application/ld+json\">{\"@type\":\"BreadcrumbList\"}</script></head></html>",
      ),
    ).toThrow(
      "Could not extract entry-draft title/body from the forum thread HTML.",
    );
  });

  test("throws when the draft title does not include a season", () => {
    expect(() =>
      parseEntryDraftHtml(
        buildThreadHtml({
          headline: "Entry draft - varatut pelaajat",
          articleBody: "1. BUF - Michael Misa",
        }),
      ),
    ).toThrow("Could not determine draft season from title: Entry draft - varatut pelaajat");
  });

  test("throws when the first-post body is empty", () => {
    expect(() =>
      parseEntryDraftHtml(
        buildThreadHtml({
          headline: "Entry draft 2025 - varatut pelaajat",
          articleBody: "   ",
        }),
      ),
    ).toThrow("Draft first-post body was empty.");
  });

  test("throws when the first post contains no pick rows", () => {
    expect(() =>
      parseEntryDraftHtml(
        buildThreadHtml({
          headline: "Entry draft 2025 - varatut pelaajat",
          articleBody: "Round 1 begins now",
        }),
      ),
    ).toThrow("Could not find any draft pick rows in the first-post body.");
  });

  test("throws when the opening draft contains an unknown full team name", () => {
    expect(() =>
      parseOpeningDraftHtml(
        buildThreadHtml({
          headline: "Varatut pelaajat järjestyksessä",
          articleBody: "1. Unknown Team - Player Person",
        }),
      ),
    ).toThrow("Unsupported team name in opening draft: Unknown Team");
  });

  test("throws when the opening draft first-post body is empty", () => {
    expect(() =>
      parseOpeningDraftHtml(
        buildThreadHtml({
          headline: "Varatut pelaajat järjestyksessä",
          articleBody: "   ",
        }),
      ),
    ).toThrow("Opening draft first-post body was empty.");
  });

  test("throws when the opening draft contains no pick rows", () => {
    expect(() =>
      parseOpeningDraftHtml(
        buildThreadHtml({
          headline: "Varatut pelaajat järjestyksessä",
          articleBody: "Kierros 1 alkaa nyt",
        }),
      ),
    ).toThrow("Could not find any opening-draft pick rows in the first-post body.");
  });

  test("throws when an opening draft pick row is missing the player name", () => {
    expect(() =>
      parseOpeningDraftHtml(
        buildThreadHtml({
          headline: "Varatut pelaajat järjestyksessä",
          articleBody: "1. Anaheim Ducks -    ",
        }),
      ),
    ).toThrow(
      "Opening draft pick row was missing a player name: 1. Anaheim Ducks -    ",
    );
  });

  test("throws when a draft pick row is missing the player name", () => {
    expect(() =>
      parseEntryDraftHtml(
        buildThreadHtml({
          headline: "Entry draft 2025 - varatut pelaajat",
          articleBody: "1. BUF -    ",
        }),
      ),
    ).toThrow("Draft pick row was missing a player name: 1. BUF -    ");
  });

  test("throws when a draft pick row contains an unknown team abbreviation", () => {
    expect(() =>
      parseEntryDraftHtml(
        buildThreadHtml({
          headline: "Entry draft 2025 - varatut pelaajat",
          articleBody: "1. XXX - Mystery Player",
        }),
      ),
    ).toThrow("Unsupported team abbreviation in entry draft: XXX");
  });
});
