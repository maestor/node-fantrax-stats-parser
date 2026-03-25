import { createRequest, createResponse } from "node-mocks-http";
import { createApp } from "../router.js";
import { get } from "../shared/router.js";

describe("router", () => {
  test("matches route params without stripping the original request url", async () => {
    const app = await createApp([
      get("/players/:id", (req, res) => {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            id: req.params.id,
            url: req.url,
          }),
        );
      }),
    ]);

    const req = createRequest({
      method: "GET",
      url: "/players/42?view=full",
      headers: { host: "localhost" },
    });
    const res = createResponse();

    await app(req as never, res);

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Access-Control-Allow-Origin")).toBe("*");
    expect(res._getData()).toBe(
      JSON.stringify({
        id: "42",
        url: "/players/42?view=full",
      }),
    );
  });

  test("normalizes microrouter-style catch-all patterns for rou3", async () => {
    const app = await createApp([
      get("/*", (_req, res) => {
        res.statusCode = 404;
        res.end("caught");
      }),
    ]);

    const req = createRequest({
      method: "GET",
      url: "/missing/deeper/path",
      headers: { host: "localhost" },
    });
    const res = createResponse();

    await app(req as never, res);

    expect(res.statusCode).toBe(404);
    expect(res._getData()).toBe("caught");
  });

  test("falls back to localhost when the request has no host header", async () => {
    const app = await createApp([
      get("/teams", (req, res) => {
        res.statusCode = 200;
        res.end(JSON.stringify(req.params));
      }),
    ]);

    const req = createRequest({
      method: "GET",
      url: "/teams?view=summary",
    });
    const res = createResponse();

    await app(req as never, res);

    expect(res.statusCode).toBe(200);
    expect(res._getData()).toBe(JSON.stringify({}));
  });

  test("falls back to manual path parsing when URL construction throws", async () => {
    const app = await createApp([
      get("/fallback", (_req, res) => {
        res.statusCode = 200;
        res.end("fallback");
      }),
    ]);

    const req = createRequest({
      method: "GET",
      headers: { host: ":::" },
    }) as ReturnType<typeof createRequest> & {
      url?: string;
    };
    req.url = "/fallback?view=summary";
    const res = createResponse();

    await app(req as never, res);

    expect(res.statusCode).toBe(200);
    expect(res._getData()).toBe("fallback");
  });

  test("falls back to root when manual path parsing receives only a query string", async () => {
    const app = await createApp([
      get("/", (_req, res) => {
        res.statusCode = 200;
        res.end("root");
      }),
    ]);

    const req = createRequest({
      method: "GET",
      headers: { host: ":::" },
    }) as ReturnType<typeof createRequest> & {
      url?: string;
    };
    req.url = "?view=summary";
    const res = createResponse();

    await app(req as never, res);

    expect(res.statusCode).toBe(200);
    expect(res._getData()).toBe("root");
  });

  test("returns the default 404 when no route matches", async () => {
    const app = await createApp([]);

    const req = createRequest({
      url: "/no-match",
      headers: { host: "localhost" },
    }) as ReturnType<typeof createRequest> & {
      method?: string;
      url?: string;
    };
    req.method = undefined;
    req.url = undefined;
    const res = createResponse();

    await app(req as never, res);

    expect(res.statusCode).toBe(404);
    expect(res._getData()).toBe("Route not exists");
  });

  test("handles CORS preflight before route matching", async () => {
    const handler = jest.fn();
    const app = await createApp([
      get("/teams", handler),
    ]);

    const req = createRequest({
      method: "OPTIONS",
      url: "/teams",
      headers: { host: "localhost" },
    });
    const res = createResponse();

    await app(req as never, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(204);
    expect(res.getHeader("Access-Control-Allow-Origin")).toBe("*");
    expect(res.getHeader("Access-Control-Allow-Methods")).toBe(
      "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    expect(res.getHeader("Access-Control-Allow-Headers")).toBe(
      "Authorization, Content-Type, X-Requested-With, x-api-key",
    );
  });
});
