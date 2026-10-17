import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

const fixtureState = {
  cookies: [
    {
      name: "session",
      value: "private-fixture-session",
      domain: ".fantrax.com",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ],
  origins: [
    {
      origin: "https://www.fantrax.com",
      localStorage: [{ name: "cache", value: "fixture-cache".repeat(18_000) }],
    },
  ],
};

if (process.argv[2] === "--fixture") {
  const scenario = process.argv[3];
  const { chromium } = await import("playwright");
  let verified = false;
  chromium.launch = (async (options: Parameters<typeof chromium.launch>[0]) => {
    assert.equal(options?.headless, false);
    return {
      async newContext() {
        return {
          request: {
            async post(url: string, options: { data: unknown }) {
              assert.equal(url, "https://www.fantrax.com/fxpa/req");
              assert.deepEqual(options.data, {
                msgs: [{ method: "getAllLeagues", data: { view: "LEAGUES" } }],
                uiv: 3,
                refUrl:
                  "https://www.fantrax.com/fantasy/league/all;view=LEAGUES",
                dt: 0,
                at: 0,
                tz: "Europe/Helsinki",
              });
              if (scenario === "unverified")
                throw new Error("Fixture network unavailable");
              return {
                ok: () => scenario !== "http-error",
                status: () => 503,
                async json() {
                  if (scenario === "expired")
                    return {
                      pageError: { code: "WARNING_NOT_LOGGED_IN" },
                      responses: [
                        { pageError: { code: "WARNING_NOT_LOGGED_IN" } },
                      ],
                    };
                  if (scenario === "invalid-response")
                    return { responses: [{ data: {} }] };
                  verified = true;
                  return {
                    responses: [
                      {
                        data: {
                          tableList: [
                            { tableType: "LEAGUES", header: {}, rows: [] },
                          ],
                        },
                      },
                    ],
                  };
                },
              };
            },
          },
          async newPage() {
            return {
              async goto(url: string) {
                assert.equal(
                  url,
                  "https://www.fantrax.com/login",
                  "Verification must not navigate away from the completed manual login",
                );
              },
              locator() {
                throw new Error(
                  "The league archive has no table.sticky-table; login verification must not rely on page layout",
                );
              },
            };
          },
          async storageState() {
            assert.ok(verified, "Login must be verified before saving state");
            if (scenario === "oversized") {
              fixtureState.origins[0].localStorage[0].value =
                randomBytes(70_000).toString("base64");
            }
            return fixtureState;
          },
        };
      },
      async close() {
        process.stdout.write("FIXTURE browser closed\n");
      },
    };
  }) as unknown as typeof chromium.launch;
  await import("../../src/playwright/login.js");
} else {
  for (const scenario of [
    "initial",
    "renewal",
    "expired",
    "unverified",
    "invalid-response",
    "http-error",
    "oversized",
    "cancelled",
  ]) {
    test(`Manual login secret export: ${scenario}`, async () => {
      const cwd = mkdtempSync(path.join(tmpdir(), "fantrax-login-"));
      const dir = path.join(cwd, "src/playwright/.fantrax");
      const authPath = path.join(dir, "fantrax-auth.json");
      const secretPath = path.join(dir, "fantrax-auth-secret.txt");
      const previousAuth = JSON.stringify({ cookies: [], origins: [] });
      try {
        if (scenario !== "initial") {
          mkdirSync(dir, { recursive: true });
          writeFileSync(authPath, previousAuth, { mode: 0o644 });
          writeFileSync(secretPath, "previous-secret", { mode: 0o644 });
        }
        const child = spawn(
          process.execPath,
          [
            "--import",
            import.meta.resolve("tsx"),
            fileURLToPath(import.meta.url),
            "--fixture",
            scenario,
          ],
          { cwd, stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 },
        );
        let output = "";
        let confirmed = false;
        child.stdout.on("data", (chunk) => {
          output += String(chunk);
          if (!confirmed && output.includes("press Enter")) {
            confirmed = true;
            child.stdin.end(scenario === "cancelled" ? undefined : "\n");
          }
        });
        child.stderr.on("data", (chunk) => {
          output += String(chunk);
        });
        const code = await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", resolve);
        });
        const succeeds = scenario === "initial" || scenario === "renewal";
        assert.equal(code, succeeds ? 0 : 1, output);
        assert.match(output, /FIXTURE browser closed/);
        assert.doesNotMatch(output, /private-fixture-session/);
        if (succeeds) {
          assert.ok(
            existsSync(secretPath),
            "A GitHub-ready secret file must be written",
          );
          const secret = readFileSync(secretPath, "utf8");
          assert.match(secret, /^[A-Za-z0-9+/]+=*$/);
          assert.ok(Buffer.byteLength(secret) <= 48 * 1024);
          assert.deepEqual(
            JSON.parse(readFileSync(authPath, "utf8")),
            fixtureState,
          );
          assert.deepEqual(
            JSON.parse(gunzipSync(Buffer.from(secret, "base64")).toString()),
            fixtureState,
          );
          assert.equal(
            output.includes(secret),
            false,
            "The secret must not be printed",
          );
          assert.equal(statSync(authPath).mode & 0o777, 0o600);
          assert.equal(statSync(secretPath).mode & 0o777, 0o600);
        } else {
          assert.equal(readFileSync(authPath, "utf8"), previousAuth);
          assert.equal(readFileSync(secretPath, "utf8"), "previous-secret");
          assert.match(
            output,
            scenario === "oversized"
              ? /48 KB/
              : scenario === "cancelled"
                ? /cancelled/
                : /verify.*login/i,
          );
        }
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
}
