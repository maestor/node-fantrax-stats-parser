import fs from "fs";
import yaml from "js-yaml";
import { send } from "micro";
import { createRequest, createResponse } from "node-mocks-http";
import { getOpenApiSpec, getSwaggerUi } from "../openapi";

jest.mock("micro");
jest.mock("fs");
jest.mock("js-yaml");

type AnyReq = Parameters<typeof getOpenApiSpec>[0];
const asReq = (r: unknown): AnyReq => r as AnyReq;

describe("openapi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getOpenApiSpec", () => {
    test("returns 200 with parsed spec and application/json content-type", () => {
      const fakeYaml = "openapi: '3.0.3'";
      const fakeSpec = { openapi: "3.0.3", info: { title: "test" }, paths: {} };
      (fs.readFileSync as jest.Mock).mockReturnValue(fakeYaml);
      (yaml.load as jest.Mock).mockReturnValue(fakeSpec);

      const req = createRequest();
      const res = createResponse();

      getOpenApiSpec(asReq(req), res);

      expect(res.getHeader("content-type")).toBe("application/json");
      expect(send).toHaveBeenCalledWith(res, 200, fakeSpec);
    });
  });

  describe("getSwaggerUi", () => {
    test("returns 200 with text/html content-type and swagger-ui markup", () => {
      const req = createRequest();
      const res = createResponse();

      getSwaggerUi(asReq(req), res);

      expect(res.getHeader("content-type")).toBe("text/html");
      expect(send).toHaveBeenCalledWith(res, 200, expect.stringContaining("swagger-ui"));
    });

    test("HTML references /openapi.json as spec URL", () => {
      const req = createRequest();
      const res = createResponse();

      getSwaggerUi(asReq(req), res);

      expect(send).toHaveBeenCalledWith(res, 200, expect.stringContaining("/openapi.json"));
    });
  });

  describe("openapi.yaml smoke test", () => {
    test("file is parseable and contains required top-level keys", () => {
      const realFs = jest.requireActual<typeof fs>("fs");
      const realYaml = jest.requireActual<typeof yaml>("js-yaml");
      const path = jest.requireActual<typeof import("path")>("path");
      const specPath = path.join(__dirname, "..", "..", "openapi.yaml");
      const raw = realFs.readFileSync(specPath, "utf8");
      const spec = realYaml.load(raw) as Record<string, unknown>;
      expect(spec).toHaveProperty("openapi");
      expect(spec).toHaveProperty("info");
      expect(spec).toHaveProperty("paths");
    });
  });

  describe("route coverage", () => {
    function getRegisteredPaths(): string[] {
      const realFs = jest.requireActual<typeof import("fs")>("fs");
      const realPath = jest.requireActual<typeof import("path")>("path");
      const indexPath = realPath.join(__dirname, "..", "index.ts");
      const source = realFs.readFileSync(indexPath, "utf8") as string;
      return [...source.matchAll(/get\("([^"]+)"/g)]
        .map((m) => m[1].replace(/:(\w+)/g, "{$1}"))
        .filter((p) => !p.includes("*"));
    }

    function getSpecPaths(): string[] {
      const realFs = jest.requireActual<typeof import("fs")>("fs");
      const realYaml = jest.requireActual<typeof import("js-yaml")>("js-yaml");
      const realPath = jest.requireActual<typeof import("path")>("path");
      const specPath = realPath.join(__dirname, "..", "..", "openapi.yaml");
      const raw = realFs.readFileSync(specPath, "utf8") as string;
      const spec = realYaml.load(raw) as { paths: Record<string, unknown> };
      return Object.keys(spec.paths);
    }

    test("every registered route in index.ts is documented in openapi.yaml", () => {
      const registeredPaths = getRegisteredPaths();
      const specPaths = getSpecPaths();
      for (const routePath of registeredPaths) {
        expect(specPaths).toContain(routePath);
      }
    });

    test("every path in openapi.yaml has a matching registered route in index.ts", () => {
      const registeredPaths = getRegisteredPaths();
      const specPaths = getSpecPaths();
      for (const specPath of specPaths) {
        expect(registeredPaths).toContain(specPath);
      }
    });
  });
});
