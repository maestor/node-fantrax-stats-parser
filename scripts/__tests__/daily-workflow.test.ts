import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { load } from "js-yaml";

const workflow = load(
  readFileSync(
    new URL("../../.github/workflows/daily-import.yml", import.meta.url),
    "utf8",
  ),
) as {
  jobs: {
    import: {
      environment?: string;
      env: Record<string, string>;
      steps: { name: string; env?: Record<string, string> }[];
    };
  };
};

test("Hosted import selects the production environment containing its credentials", () => {
  assert.equal(workflow.jobs.import.environment, "production");
});

test("Environment secrets and snapshot variables resolve in the import step", () => {
  const job = workflow.jobs.import;
  const step = job.steps.find((s) => s.name === "Import current season");
  for (const name of [
    "FANTRAX_AUTH_STATE",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ]) {
    assert.equal(step?.env?.[name], `\${{ secrets.${name} }}`, name);
    assert.equal(
      job.env[name],
      undefined,
      `${name} should resolve after the production environment is available`,
    );
  }
  assert.equal(
    step?.env?.R2_SNAPSHOT_BUCKET_NAME,
    "${{ vars.R2_SNAPSHOT_BUCKET_NAME }}",
  );
  assert.equal(job.env.R2_SNAPSHOT_BUCKET_NAME, undefined);
});
