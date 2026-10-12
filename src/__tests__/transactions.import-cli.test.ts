import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { CURRENT_SEASON } from "../config/index.js";
import { createIntegrationDb } from "./integration-db.js";

const runFile = promisify(execFile);
const transactionHighlightTypes = [
  "most-trades",
  "most-claims",
  "most-drops",
  "reunion-king",
];

describe("transaction import command", () => {
  test.each([false, true])(
    "refreshes career highlights and the transaction leaderboard only when persisting (dry run: %s)",
    async (dryRun) => {
      const context = await createIntegrationDb();
      const cwd = path.dirname(context.snapshotDir);
      const highlightsFile = path.join(
        context.snapshotDir,
        "career/highlights/most-claims.json",
      );
      const staleSnapshot: unknown[] = [];
      const unrelatedKey = "career/highlights/stash-king";
      const unrelatedFile = path.join(
        context.snapshotDir,
        `${unrelatedKey}.json`,
      );
      const unrelatedSnapshot = [{ id: "unchanged-stash" }];

      try {
        await context.insertPlayers([
          {
            teamId: "7",
            season: CURRENT_SEASON,
            reportType: "regular",
            playerId: "p-claim",
            name: "Claim King",
            position: "F",
          },
        ]);
        await fs.mkdir(path.dirname(highlightsFile), { recursive: true });
        await fs.writeFile(highlightsFile, JSON.stringify(staleSnapshot));
        await fs.writeFile(unrelatedFile, JSON.stringify(unrelatedSnapshot));
        await fs.writeFile(
          path.join(context.snapshotDir, "manifest.json"),
          JSON.stringify({ snapshots: [{ key: unrelatedKey, bytes: 26 }] }),
        );
        await fs.writeFile(
          path.join(cwd, `claims-${CURRENT_SEASON}-${CURRENT_SEASON + 1}.csv`),
          [
            '"Player","Team","Position","Type","Team","Date (EDT)","Period"',
            ...[4, 5, 6].map(
              (day) =>
                `"Claim King","EDM","F","Claim","Edmonton Oilers","Mar ${day}, ${CURRENT_SEASON + 1}, 12:38PM","${day}"`,
            ),
          ].join("\n"),
        );
        // Run the real snapshot generator against this temporary database only.
        await fs.symlink(
          path.resolve("node_modules"),
          path.join(cwd, "node_modules"),
        );
        await fs.symlink(path.resolve("scripts"), path.join(cwd, "scripts"));
        await fs.writeFile(
          path.join(cwd, "package.json"),
          JSON.stringify({
            scripts: {
              "snapshot:generate":
                "node --import tsx scripts/generate-snapshots.ts",
            },
          }),
        );

        await runFile(
          process.execPath,
          [
            "--import",
            path.resolve("node_modules/tsx/dist/loader.mjs"),
            path.resolve("scripts/db-import-transactions.ts"),
            `--dir=${cwd}`,
            ...(dryRun ? ["--dry-run"] : []),
          ],
          {
            cwd,
            env: {
              ...process.env,
              USE_REMOTE_DB: "true",
              TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
              TURSO_AUTH_TOKEN: "",
              USE_R2_SNAPSHOTS: "false",
            },
            timeout: 20_000,
          },
        );

        const highlights = JSON.parse(
          await fs.readFile(highlightsFile, "utf8"),
        );
        if (dryRun) {
          expect(highlights).toEqual(staleSnapshot);
          await expect(
            fs.access(
              path.join(context.snapshotDir, "leaderboard/transactions.json"),
            ),
          ).rejects.toThrow();
        } else {
          expect(highlights).toEqual([
            expect.objectContaining({ id: "p-claim", transactionCount: 3 }),
          ]);
          for (const type of transactionHighlightTypes) {
            await fs.access(
              path.join(context.snapshotDir, `career/highlights/${type}.json`),
            );
          }
          await fs.access(
            path.join(context.snapshotDir, "leaderboard/transactions.json"),
          );
          const manifest = JSON.parse(
            await fs.readFile(
              path.join(context.snapshotDir, "manifest.json"),
              "utf8",
            ),
          );
          expect(
            manifest.snapshots
              .map((entry: { key: string }) => entry.key)
              .sort(),
          ).toEqual(
            [
              unrelatedKey,
              "leaderboard/transactions",
              ...transactionHighlightTypes.map(
                (type) => `career/highlights/${type}`,
              ),
            ].sort(),
          );
        }
        expect(JSON.parse(await fs.readFile(unrelatedFile, "utf8"))).toEqual(
          unrelatedSnapshot,
        );
      } finally {
        await context.cleanup();
      }
    },
    30_000,
  );
});
