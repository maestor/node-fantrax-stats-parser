import {
  buildFinalsScoringContext,
  calculateWeightedEdgeRate,
  calculateWinRate,
  FINALS_DESERVED_TO_WIN_WEIGHTS,
} from "../features/finals/scoring.js";
import type {
  FinalsMatchupDbEntry,
  FinalsModelWeights,
  FinalsTeamData,
} from "../features/finals/types.js";

const createTeam = (
  teamId: string,
  overrides: Partial<FinalsTeamData> = {},
): FinalsTeamData => {
  const base: FinalsTeamData = {
    teamId,
    isWinner: false,
    score: {
      matchPoints: 7.5,
      categoriesWon: 7,
      categoriesLost: 7,
      categoriesTied: 1,
    },
    playedGames: {
      total: 12,
      skaters: 10,
      goalies: 2,
    },
    totals: {
      goals: 10,
      assists: 10,
      points: 20,
      plusMinus: 2,
      penalties: 12,
      shots: 80,
      ppp: 6,
      shp: 1,
      hits: 30,
      blocks: 20,
      wins: 1,
      saves: 50,
      shutouts: 0,
      gaa: 2.5,
      savePercent: 0.91,
    },
  };

  return {
    ...base,
    ...overrides,
    score: {
      ...base.score,
      ...overrides.score,
    },
    playedGames: {
      ...base.playedGames,
      ...overrides.playedGames,
    },
    totals: {
      ...base.totals,
      ...overrides.totals,
    },
  };
};

const createMatchup = (
  overrides: {
    season?: number;
    wonOnHomeTiebreak?: boolean;
    winnerTeamId?: string;
    awayTeam?: Partial<FinalsTeamData>;
    homeTeam?: Partial<FinalsTeamData>;
  } = {},
): FinalsMatchupDbEntry => {
  const {
    awayTeam: awayOverrides,
    homeTeam: homeOverrides,
    season = 2024,
    wonOnHomeTiebreak = false,
    winnerTeamId = "1",
  } = overrides;

  return {
    season,
    wonOnHomeTiebreak,
    winnerTeamId,
    awayTeam: createTeam("1", {
      isWinner: true,
      score: {
        matchPoints: 8.5,
        categoriesWon: 8,
        categoriesLost: 6,
        categoriesTied: 1,
      },
      ...awayOverrides,
    }),
    homeTeam: createTeam("2", homeOverrides),
  };
};

describe("finals scoring", () => {
  test("builds a minimum plus-minus scale when no matchups are available", () => {
    expect(buildFinalsScoringContext([])).toEqual({
      plusMinusRateScale: 0.05,
    });
  });

  test("calculates winRate from match points and falls back to 50 with no categories", () => {
    expect(calculateWinRate(createMatchup())).toBe(56.7);

    expect(
      calculateWinRate(
        createMatchup({
          awayTeam: {
            score: {
              matchPoints: 0,
              categoriesWon: 0,
              categoriesLost: 0,
              categoriesTied: 0,
            },
          },
        }),
      ),
    ).toBe(50);
  });

  test("returns 50 when the finalists are identical", () => {
    const matchup = createMatchup({
      awayTeam: {
        score: {
          matchPoints: 7.5,
          categoriesWon: 7,
          categoriesLost: 7,
          categoriesTied: 1,
        },
      },
      homeTeam: {
        score: {
          matchPoints: 7.5,
          categoriesWon: 7,
          categoriesLost: 7,
          categoriesTied: 1,
        },
      },
    });

    expect(
      calculateWeightedEdgeRate(
        matchup,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([matchup]),
      ),
    ).toBe(50);
  });

  test("returns neutral when both finalists have zero skater exposure", () => {
    const matchup = createMatchup({
      awayTeam: {
        playedGames: { total: 2, skaters: 0, goalies: 2 },
        totals: {
          goals: 0,
          assists: 0,
          points: 0,
          plusMinus: 0,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          wins: 1,
          saves: 50,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0.91,
        },
      },
      homeTeam: {
        playedGames: { total: 2, skaters: 0, goalies: 2 },
        totals: {
          goals: 0,
          assists: 0,
          points: 0,
          plusMinus: 0,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          wins: 1,
          saves: 50,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0.91,
        },
      },
    });

    expect(
      calculateWeightedEdgeRate(
        matchup,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([matchup]),
      ),
    ).toBe(50);
  });

  test("favors better per-game pace even when the raw total is lower", () => {
    const matchup = createMatchup({
      awayTeam: {
        playedGames: { total: 6, skaters: 4, goalies: 2 },
        totals: {
          goals: 4,
          assists: 4,
          points: 8,
          plusMinus: 2,
          penalties: 4,
          shots: 24,
          ppp: 2,
          shp: 0,
          hits: 12,
          blocks: 8,
          wins: 1,
          saves: 50,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0.91,
        },
      },
      homeTeam: {
        playedGames: { total: 12, skaters: 10, goalies: 2 },
        totals: {
          goals: 5,
          assists: 5,
          points: 10,
          plusMinus: 2,
          penalties: 10,
          shots: 50,
          ppp: 3,
          shp: 0,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 50,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0.91,
        },
      },
    });

    expect(
      calculateWeightedEdgeRate(
        matchup,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([matchup]),
      ),
    ).toBeGreaterThan(50);
  });

  test("downweights plus-minus, SHP, and shutouts in the deserved rate", () => {
    const allOneWeights = Object.fromEntries(
      Object.keys(FINALS_DESERVED_TO_WIN_WEIGHTS).map((key) => [key, 1]),
    ) as FinalsModelWeights;
    const matchup = createMatchup({
      awayTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: -10,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 0,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 50,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0.91,
        },
      },
      homeTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 10,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 3,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 50,
          shutouts: 2,
          gaa: 2.5,
          savePercent: 0.91,
        },
      },
    });
    const context = buildFinalsScoringContext([matchup]);

    expect(
      calculateWeightedEdgeRate(matchup, FINALS_DESERVED_TO_WIN_WEIGHTS, context),
    ).toBeGreaterThan(calculateWeightedEdgeRate(matchup, allOneWeights, context));
  });

  test("respects goalie-rate qualification, null rate values, and zero-weight fallbacks", () => {
    const qualifiedWinner = createMatchup({
      winnerTeamId: "2",
      awayTeam: {
        isWinner: false,
        score: {
          matchPoints: 6.5,
          categoriesWon: 6,
          categoriesLost: 8,
          categoriesTied: 1,
        },
        playedGames: { total: 11, skaters: 10, goalies: 1 },
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 30,
          shutouts: 0,
          gaa: null,
          savePercent: null,
        },
      },
      homeTeam: {
        isWinner: true,
        score: {
          matchPoints: 8.5,
          categoriesWon: 8,
          categoriesLost: 6,
          categoriesTied: 1,
        },
      },
    });
    const disqualifiedWinner = createMatchup({
      awayTeam: {
        playedGames: { total: 11, skaters: 10, goalies: 1 },
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 30,
          shutouts: 0,
          gaa: null,
          savePercent: null,
        },
      },
    });
    const bothUnqualified = createMatchup({
      awayTeam: {
        playedGames: { total: 11, skaters: 10, goalies: 1 },
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 30,
          shutouts: 0,
          gaa: null,
          savePercent: null,
        },
      },
      homeTeam: {
        playedGames: { total: 11, skaters: 10, goalies: 1 },
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 30,
          shutouts: 0,
          gaa: null,
          savePercent: null,
        },
      },
    });
    const nullRatesDespiteQualification = createMatchup({
      awayTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 50,
          shutouts: 0,
          gaa: null,
          savePercent: null,
        },
      },
      homeTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 50,
          shutouts: 0,
          gaa: null,
          savePercent: null,
        },
      },
    });
    const zeroWeightRate = calculateWeightedEdgeRate(
      createMatchup(),
      {
        goals: 0,
        assists: 0,
        points: 0,
        plusMinus: 0,
        penalties: 0,
        shots: 0,
        ppp: 0,
        shp: 0,
        hits: 0,
        blocks: 0,
        wins: 0,
        saves: 0,
        shutouts: 0,
        gaa: 0,
        savePercent: 0,
      },
      buildFinalsScoringContext([]),
    );

    expect(
      calculateWeightedEdgeRate(
        qualifiedWinner,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([qualifiedWinner]),
      ),
    ).toBeGreaterThan(50);
    expect(
      calculateWeightedEdgeRate(
        disqualifiedWinner,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([disqualifiedWinner]),
      ),
    ).toBeLessThan(50);
    expect(
      calculateWeightedEdgeRate(
        bothUnqualified,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([bothUnqualified]),
      ),
    ).toBe(50);
    expect(
      calculateWeightedEdgeRate(
        nullRatesDespiteQualification,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([nullRatesDespiteQualification]),
      ),
    ).toBe(50);
    expect(zeroWeightRate).toBe(50);
  });

  test("handles zero-shot save percentage comparisons without blowing up", () => {
    const matchup = createMatchup({
      awayTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 0,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0.1,
        },
      },
      homeTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 0,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0,
        },
      },
    });

    expect(
      calculateWeightedEdgeRate(
        matchup,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([matchup]),
      ),
    ).toBeGreaterThan(50);
  });

  test("treats tied zero-shot save percentage cases as neutral and can penalize the winner", () => {
    const tiedZeroShotMatchup = createMatchup({
      awayTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 0,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0,
        },
      },
      homeTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 0,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0,
        },
      },
    });
    const loserBetterZeroShotMatchup = createMatchup({
      awayTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 0,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0,
        },
      },
      homeTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 1,
          saves: 0,
          shutouts: 0,
          gaa: 2.5,
          savePercent: 0.1,
        },
      },
    });

    expect(
      calculateWeightedEdgeRate(
        tiedZeroShotMatchup,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([tiedZeroShotMatchup]),
      ),
    ).toBe(50);
    expect(
      calculateWeightedEdgeRate(
        loserBetterZeroShotMatchup,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([loserBetterZeroShotMatchup]),
      ),
    ).toBeLessThan(50);
  });

  test("treats identical perfect qualified goalie rates as neutral", () => {
    const matchup = createMatchup({
      awayTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 2,
          saves: 20,
          shutouts: 2,
          gaa: 0,
          savePercent: 1,
        },
      },
      homeTeam: {
        totals: {
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 2,
          penalties: 12,
          shots: 80,
          ppp: 6,
          shp: 1,
          hits: 30,
          blocks: 20,
          wins: 2,
          saves: 20,
          shutouts: 2,
          gaa: 0,
          savePercent: 1,
        },
      },
    });

    expect(
      calculateWeightedEdgeRate(
        matchup,
        FINALS_DESERVED_TO_WIN_WEIGHTS,
        buildFinalsScoringContext([matchup]),
      ),
    ).toBe(50);
  });
});
