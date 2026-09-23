import { normalizeVercelUrl } from "../shared/vercel-url.js";

describe("normalizeVercelUrl", () => {
  test("removes Vercel's internal path parameter while preserving API query parameters", () => {
    expect(normalizeVercelUrl("/api/leaderboard/categories?path=leaderboard/categories"))
      .toBe("/leaderboard/categories");
    expect(normalizeVercelUrl("/api/leaderboard/categories?path=leaderboard/categories&season=2025"))
      .toBe("/leaderboard/categories?season=2025");
  });

  test("normalizes API roots, trailing slashes, and already-normalized URLs", () => {
    expect(normalizeVercelUrl("/api?path=index")).toBe("/");
    expect(normalizeVercelUrl("/api/teams/?path=teams")).toBe("/teams");
    expect(normalizeVercelUrl("/leaderboard/categories")).toBe("/leaderboard/categories");
  });
});
