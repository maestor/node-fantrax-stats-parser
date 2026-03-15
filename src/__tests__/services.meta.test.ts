import { getTeamsData } from "../features/meta/service";
import { getTeamsWithData } from "../shared/teams";

jest.mock("../shared/teams");

describe("meta services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getTeamsData", () => {
    test("returns configured teams from the shared helper", () => {
      const teams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockReturnValue(teams);

      const result = getTeamsData();

      expect(getTeamsWithData).toHaveBeenCalledTimes(1);
      expect(result).toBe(teams);
    });
  });
});
