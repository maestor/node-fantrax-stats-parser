import type { IncomingMessage, ServerResponse } from "http";

import {
  buildCacheKey,
  isIfNoneMatchHit,
  makeEtagForJson,
  normalizeUrlForCacheKey,
  setCachedOkHeaders,
  setNoStoreHeaders,
} from "../cache";

const makeRes = (): ServerResponse => {
  const headers = new Map<string, unknown>();
  return {
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
  } as unknown as ServerResponse;
};

describe("cache", () => {
  test("normalizeUrlForCacheKey strips /api, trims trailing slash, sorts query", () => {
    const out = normalizeUrlForCacheKey("/api/seasons/?b=2&a=1", "example.com");
    expect(out).toBe("/seasons?a=1&b=2");
  });

  test("buildCacheKey returns undefined for non-GET or missing url", () => {
    expect(buildCacheKey({ method: "POST", url: "/x", headers: {} } as IncomingMessage)).toBeUndefined();
    expect(buildCacheKey({ method: "GET", url: undefined, headers: {} } as IncomingMessage)).toBeUndefined();
  });

  test("buildCacheKey includes deploy salt and normalized url", () => {
    const key = buildCacheKey({
      method: "GET",
      url: "/teams?teamId=1",
      headers: { host: "localhost" },
    } as unknown as IncomingMessage);

    expect(key).toContain(":/teams?teamId=1");
  });

  test("buildCacheKey supports host header array", () => {
    const key = buildCacheKey({
      method: "GET",
      url: "/teams",
      headers: { host: ["localhost"] },
    } as unknown as IncomingMessage);

    expect(key).toContain(":/teams");
  });

  test("setNoStoreHeaders sets cache-busting headers", () => {
    const res = makeRes();
    setNoStoreHeaders(res);
    expect(res.getHeader("cache-control")).toBe("private, no-store");
    expect(res.getHeader("pragma")).toBe("no-cache");
  });

  test("setCachedOkHeaders sets cache and vary headers", () => {
    const res = makeRes();
    setCachedOkHeaders(res, '"abc"');
    expect(String(res.getHeader("cache-control"))).toContain("s-maxage=");
    expect(res.getHeader("etag")).toBe('"abc"');
    expect(String(res.getHeader("vary"))).toContain("authorization");
  });

  test("setCachedOkHeaders appends vary values", () => {
    const res = makeRes();
    res.setHeader("Vary", "accept-encoding");
    setCachedOkHeaders(res, '"abc"');
    const vary = String(res.getHeader("vary"));
    expect(vary).toContain("accept-encoding");
    expect(vary).toContain("authorization");
  });

  test("isIfNoneMatchHit matches exact etag and list", () => {
    const etag = makeEtagForJson({ a: 1 });
    expect(
      isIfNoneMatchHit({ headers: { "if-none-match": etag } } as unknown as IncomingMessage, etag)
    ).toBe(true);
    expect(
      isIfNoneMatchHit(
        { headers: { "if-none-match": `"nope", ${etag}` } } as unknown as IncomingMessage,
        etag
      )
    ).toBe(true);
  });

  test("isIfNoneMatchHit matches weak etag values", () => {
    const etag = '"abc"';
    expect(
      isIfNoneMatchHit(
        { headers: { "if-none-match": `W/${etag}` } } as unknown as IncomingMessage,
        etag
      )
    ).toBe(true);
  });

  test("isIfNoneMatchHit handles array headers", () => {
    const etag = '"abc"';
    expect(
      isIfNoneMatchHit(
        { headers: { "if-none-match": [etag] } } as unknown as IncomingMessage,
        etag
      )
    ).toBe(true);
  });

  test("isIfNoneMatchHit returns false when array header first entry is not a string", () => {
    const etag = '"abc"';
    expect(
      isIfNoneMatchHit(
        { headers: { "if-none-match": [123 as unknown as string] } } as unknown as IncomingMessage,
        etag
      )
    ).toBe(false);
  });

  test("isIfNoneMatchHit returns false when req is undefined", () => {
    expect(isIfNoneMatchHit(undefined, '"abc"')).toBe(false);
  });
});
