import { createResponse } from "node-mocks-http";

import { send } from "../http/response.js";

describe("http response", () => {
  test("sends plain text with a default text content type", () => {
    const res = createResponse();

    send(res, 200, "hello");

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("content-type")).toBe("text/plain; charset=utf-8");
    expect(res._getData()).toBe("hello");
  });

  test("sends JSON with a default JSON content type", () => {
    const res = createResponse();

    send(res, 201, { ok: true });

    expect(res.statusCode).toBe(201);
    expect(res.getHeader("content-type")).toBe("application/json; charset=utf-8");
    expect(res._getData()).toBe(JSON.stringify({ ok: true }));
  });

  test("does not overwrite an existing content type", () => {
    const res = createResponse();
    res.setHeader("content-type", "text/html");

    send(res, 200, "<p>ok</p>");

    expect(res.getHeader("content-type")).toBe("text/html");
    expect(res._getData()).toBe("<p>ok</p>");
  });

  test("sends binary bodies as octet-stream", () => {
    const res = createResponse();
    const body = Buffer.from("abc");

    send(res, 200, body);

    expect(res.getHeader("content-type")).toBe("application/octet-stream");
    expect(res._getBuffer()).toEqual(body);
  });

  test("ends the response when body is undefined", () => {
    const res = createResponse();

    send(res, 204, undefined);

    expect(res.statusCode).toBe(204);
    expect(res._getData()).toBe("");
  });
});
