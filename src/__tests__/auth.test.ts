import { send } from "micro";
import { createRequest, createResponse } from "node-mocks-http";
import {
  extractApiKey,
  getApiKeysFromEnv,
  isValidApiKey,
  shouldRequireAuth,
  withApiKeyAuth,
} from "../auth";

jest.mock("micro");

describe("auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.API_KEY;
    delete process.env.API_KEYS;
    delete process.env.REQUIRE_API_KEY;
    delete process.env.API_KEY_HEADER;
  });

  describe("getApiKeysFromEnv", () => {
    test("returns empty when no env configured", () => {
      expect(getApiKeysFromEnv()).toEqual([]);
    });

    test("returns single key when API_KEY is set", () => {
      process.env.API_KEY = "abc";
      expect(getApiKeysFromEnv()).toEqual(["abc"]);
    });

    test("returns multiple keys when API_KEYS is set", () => {
      process.env.API_KEYS = "a, b, ,c";
      expect(getApiKeysFromEnv()).toEqual(["a", "b", "c"]);
    });

    test("merges API_KEY and API_KEYS", () => {
      process.env.API_KEY = "primary";
      process.env.API_KEYS = "secondary";
      expect(getApiKeysFromEnv()).toEqual(["primary", "secondary"]);
    });
  });

  describe("shouldRequireAuth", () => {
    test("defaults to false when no keys", () => {
      expect(shouldRequireAuth([])).toBe(false);
    });

    test("defaults to true when keys exist", () => {
      expect(shouldRequireAuth(["k1"])).toBe(true);
    });

    test("honors explicit requireAuth option", () => {
      expect(shouldRequireAuth([], true)).toBe(true);
      expect(shouldRequireAuth(["k1"], false)).toBe(false);
    });

    test("honors REQUIRE_API_KEY env", () => {
      process.env.REQUIRE_API_KEY = "true";
      expect(shouldRequireAuth([])).toBe(true);

      process.env.REQUIRE_API_KEY = "false";
      expect(shouldRequireAuth(["k1"])).toBe(false);
    });
  });

  describe("extractApiKey", () => {
    test("reads configured header", () => {
      const req = createRequest({ headers: { "x-api-key": "  key  " } });
      expect(extractApiKey(req, "x-api-key", true)).toBe("key");
    });

    test("reads Bearer token when header missing", () => {
      const req = createRequest({ headers: { authorization: "Bearer token123" } });
      expect(extractApiKey(req, "x-api-key", true)).toBe("token123");
    });

    test("does not read Bearer token when disabled", () => {
      const req = createRequest({ headers: { authorization: "Bearer token123" } });
      expect(extractApiKey(req, "x-api-key", false)).toBeUndefined();
    });
  });

  describe("isValidApiKey", () => {
    test("matches any configured key", () => {
      expect(isValidApiKey("b", ["a", "b", "c"])).toBe(true);
      expect(isValidApiKey("x", ["a", "b", "c"])).toBe(false);
    });
  });

  describe("withApiKeyAuth", () => {
    test("passes through when auth not required", async () => {
      const handler = jest.fn();
      const wrapped = withApiKeyAuth(handler, { requireAuth: false });
      const req = createRequest();
      const res = createResponse();

      await wrapped(req, res);

      expect(handler).toHaveBeenCalledWith(req, res);
      expect(send).not.toHaveBeenCalled();
    });

    test("allows OPTIONS preflight even when auth required", async () => {
      const handler = jest.fn();
      const wrapped = withApiKeyAuth(handler, { requireAuth: true, validKeys: ["k1"] });
      const req = createRequest({ method: "OPTIONS" });
      const res = createResponse();

      await wrapped(req, res);

      expect(handler).toHaveBeenCalledWith(req, res);
      expect(send).not.toHaveBeenCalled();
    });

    test("returns 401 when key missing", async () => {
      const handler = jest.fn();
      const wrapped = withApiKeyAuth(handler, { requireAuth: true, validKeys: ["k1"] });
      const req = createRequest({ headers: {} });
      const res = createResponse();

      await wrapped(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(res, 401, { error: "Missing API key" });
    });

    test("returns 403 when key invalid", async () => {
      const handler = jest.fn();
      const wrapped = withApiKeyAuth(handler, { requireAuth: true, validKeys: ["k1"] });
      const req = createRequest({ headers: { "x-api-key": "nope" } });
      const res = createResponse();

      await wrapped(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(res, 403, { error: "Invalid API key" });
    });

    test("calls handler when key valid", async () => {
      const handler = jest.fn();
      const wrapped = withApiKeyAuth(handler, { requireAuth: true, validKeys: ["k1"] });
      const req = createRequest({ headers: { "x-api-key": "k1" } });
      const res = createResponse();

      await wrapped(req, res);

      expect(send).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(req, res);
    });

    test("supports API_KEY_HEADER env override", async () => {
      process.env.API_KEY_HEADER = "x-custom-key";
      const handler = jest.fn();
      const wrapped = withApiKeyAuth(handler, { requireAuth: true, validKeys: ["k1"] });
      const req = createRequest({ headers: { "x-custom-key": "k1" } });
      const res = createResponse();

      await wrapped(req, res);

      expect(handler).toHaveBeenCalledWith(req, res);
      expect(send).not.toHaveBeenCalled();
    });
  });
});
