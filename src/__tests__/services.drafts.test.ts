import {
  getEntryDraftPicksFromDb,
  getOpeningDraftPicksFromDb,
} from "../db/queries.js";
import {
  getEntryDraftData,
  getOriginalDraftData,
} from "../features/drafts/service.js";

jest.mock("../db/queries");

describe("draft services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getOriginalDraftData", () => {
    test("groups opening draft picks by drafted team and sorts teams and picks", async () => {
      (getOpeningDraftPicksFromDb as jest.Mock).mockResolvedValue([
        {
          round: 1,
          pickNumber: 12,
          draftedTeamId: "19",
          originalOwnerTeamId: "1",
          draftedPlayer: "Player C",
        },
        {
          round: 1,
          pickNumber: 2,
          draftedTeamId: "12",
          originalOwnerTeamId: "10",
          draftedPlayer: "Player B",
        },
        {
          round: 1,
          pickNumber: 1,
          draftedTeamId: "12",
          originalOwnerTeamId: "12",
          draftedPlayer: "Player A",
        },
        {
          round: 1,
          pickNumber: 4,
          draftedTeamId: "19",
          originalOwnerTeamId: "19",
          draftedPlayer: "Player D",
        },
      ]);

      const result = await getOriginalDraftData();

      expect(result).toEqual([
        {
          team: { id: "12", name: "Anaheim Ducks" },
          picks: [
            {
              round: 1,
              pickNumber: 1,
              draftedPlayer: "Player A",
              originalOwner: { id: "12", name: "Anaheim Ducks" },
            },
            {
              round: 1,
              pickNumber: 2,
              draftedPlayer: "Player B",
              originalOwner: { id: "10", name: "Nashville Predators" },
            },
          ],
        },
        {
          team: { id: "19", name: "Toronto Maple Leafs" },
          picks: [
            {
              round: 1,
              pickNumber: 4,
              draftedPlayer: "Player D",
              originalOwner: { id: "19", name: "Toronto Maple Leafs" },
            },
            {
              round: 1,
              pickNumber: 12,
              draftedPlayer: "Player C",
              originalOwner: { id: "1", name: "Colorado Avalanche" },
            },
          ],
        },
      ]);
    });

    test("falls back to raw team ids when a team mapping is missing", async () => {
      (getOpeningDraftPicksFromDb as jest.Mock).mockResolvedValue([
        {
          round: 3,
          pickNumber: 99,
          draftedTeamId: "999",
          originalOwnerTeamId: "998",
          draftedPlayer: "Mystery Player",
        },
      ]);

      await expect(getOriginalDraftData()).resolves.toEqual([
        {
          team: { id: "999", name: "999" },
          picks: [
            {
              round: 3,
              pickNumber: 99,
              draftedPlayer: "Mystery Player",
              originalOwner: { id: "998", name: "998" },
            },
          ],
        },
      ]);
    });
  });

  describe("getEntryDraftData", () => {
    test("groups entry draft picks by drafted team and seasons", async () => {
      (getEntryDraftPicksFromDb as jest.Mock).mockResolvedValue([
        {
          season: 2025,
          round: 1,
          pickNumber: 1,
          draftedTeamId: "19",
          originalOwnerTeamId: "19",
          draftedPlayer: "Player A",
        },
        {
          season: 2024,
          round: 2,
          pickNumber: 33,
          draftedTeamId: "19",
          originalOwnerTeamId: "1",
          draftedPlayer: "Player C",
        },
        {
          season: 2025,
          round: 1,
          pickNumber: 2,
          draftedTeamId: "12",
          originalOwnerTeamId: "10",
          draftedPlayer: "Player B",
        },
        {
          season: 2024,
          round: 1,
          pickNumber: 4,
          draftedTeamId: "19",
          originalOwnerTeamId: "19",
          draftedPlayer: "Player D",
        },
      ]);

      const result = await getEntryDraftData();

      expect(result).toEqual([
        {
          team: { id: "12", name: "Anaheim Ducks" },
          seasons: [
            {
              season: 2025,
              picks: [
                {
                  round: 1,
                  pickNumber: 2,
                  draftedPlayer: "Player B",
                  originalOwner: { id: "10", name: "Nashville Predators" },
                },
              ],
            },
          ],
        },
        {
          team: { id: "19", name: "Toronto Maple Leafs" },
          seasons: [
            {
              season: 2025,
              picks: [
                {
                  round: 1,
                  pickNumber: 1,
                  draftedPlayer: "Player A",
                  originalOwner: { id: "19", name: "Toronto Maple Leafs" },
                },
              ],
            },
            {
              season: 2024,
              picks: [
                {
                  round: 1,
                  pickNumber: 4,
                  draftedPlayer: "Player D",
                  originalOwner: { id: "19", name: "Toronto Maple Leafs" },
                },
                {
                  round: 2,
                  pickNumber: 33,
                  draftedPlayer: "Player C",
                  originalOwner: { id: "1", name: "Colorado Avalanche" },
                },
              ],
            },
          ],
        },
      ]);
    });
  });
});
