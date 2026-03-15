import { createRequest, createResponse } from "node-mocks-http";
import { getSeasons } from "../features/meta/routes";
import { HTTP_STATUS } from "../constants";
import { createIntegrationDb } from "./integration-db";
import { expectArraySchema } from "./openapi-schema";
import { asRouteReq, getJsonBody } from "./routes.integration.helpers";

type RouteReq = Parameters<typeof getSeasons>[0];

export const registerSeasonRouteIntegrationTests = (): void => {
  describe("season routes", () => {
    test("returns regular seasons for the default team from the real helper range", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/seasons",
        });
        const res = createResponse();

        await getSeasons(asRouteReq<RouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body[0]).toEqual({ season: 2012, text: "2012-2013" });
        expect(body.at(-1)).toEqual({ season: 2025, text: "2025-2026" });
        expectArraySchema("Season", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns filtered seasons for both-report requests using the real helper range", async () => {
      const db = await createIntegrationDb();

      try {
        const req = createRequest({
          method: "GET",
          url: "/seasons/both?teamId=32&startFrom=2020",
          params: { reportType: "both" },
          headers: { host: "localhost" },
        });
        const res = createResponse();

        await getSeasons(asRouteReq<RouteReq>(req), res);

        const body = getJsonBody<Array<Record<string, unknown>>>(res);
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(body).toEqual([
          { season: 2020, text: "2020-2021" },
          { season: 2021, text: "2021-2022" },
          { season: 2022, text: "2022-2023" },
          { season: 2023, text: "2023-2024" },
          { season: 2024, text: "2024-2025" },
          { season: 2025, text: "2025-2026" },
        ]);
        expectArraySchema("Season", body);
      } finally {
        await db.cleanup();
      }
    });

    test("returns playoff seasons from the live DB and honors teamId/startFrom", async () => {
      const db = await createIntegrationDb();

      try {
        await db.insertPlayers([
          {
            teamId: "19",
            season: 2023,
            reportType: "playoffs",
            playerId: "p-playoff-2023",
            name: "Playoff Skater",
            position: "F",
            games: 3,
            goals: 1,
            assists: 1,
            points: 2,
          },
          {
            teamId: "19",
            season: 2024,
            reportType: "playoffs",
            playerId: "p-playoff-2024",
            name: "Playoff Skater",
            position: "F",
            games: 4,
            goals: 2,
            assists: 2,
            points: 4,
          },
        ]);

        const req = createRequest({
          method: "GET",
          url: "/seasons/playoffs?teamId=19&startFrom=2024",
          params: { reportType: "playoffs" },
          headers: { host: "localhost" },
        });
        const res = createResponse();

        await getSeasons(asRouteReq<RouteReq>(req), res);

        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.getHeader("x-stats-data-source")).toBe("db");
        expect(getJsonBody(res)).toEqual([{ season: 2024, text: "2024-2025" }]);
      } finally {
        await db.cleanup();
      }
    });
  });
};
