import { mapAvailableSeasons } from "../mappings";

describe("mappings", () => {
  describe("mapAvailableSeasons", () => {
    test("maps season numbers to season objects", () => {
      const result = mapAvailableSeasons([2012, 2013, 2014]);

      expect(result).toEqual([
        { season: 2012, text: "2012-2013" },
        { season: 2013, text: "2013-2014" },
        { season: 2014, text: "2014-2015" },
      ]);
    });

    test("returns empty array when no seasons available", () => {
      const result = mapAvailableSeasons([]);

      expect(result).toEqual([]);
    });
  });
});
