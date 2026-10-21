# Daily Fantrax Imports

[Daily Fantrax import](../.github/workflows/daily-import.yml) is scheduled on a GitHub-hosted Linux runner at **09:07 Europe/Helsinki**, including daylight saving changes. NHL games are assumed to have finished by 09:00 Helsinki; minute 7 avoids GitHub's busy top-of-hour scheduling period. Actual starts can still be delayed by hours or dropped; this is a best-effort target, not a completion deadline. It uses the configured `CURRENT_SEASON` and that season's tracked `fantrax-leagues.json` entry, regardless of the calendar year or a newer league appearing in Fantrax.

## Season behavior

| Period                                                    | Work                                                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Every day, including offseason and before the first games | Download current-season transactions and incrementally import them                                                                 |
| Regular season                                            | Download regular rosters, sync standings, import results                                                                           |
| After regular season, until finalized                     | Refresh playoff mapping, then finalize regular stats/standings and the regular champion                                            |
| Playoffs                                                  | Refresh the bracket, download all 16 teams' playoff rosters, import advancement results; sync/import finals when a champion exists |
| After the last playoff date, until finalized              | Repeat playoff work until stats, results, champion and finals all succeed                                                          |
| After successful season finalization                      | Continue transactions only                                                                                                         |

End dates are inclusive game dates. Finalization starts the following Helsinki calendar day, allowing the final night's games to be imported. A failed finalization retries on subsequent daily runs. Completion markers and the last fully successful run timestamp live in the existing `import_metadata` table under season-specific `daily-import:*` keys; no new database schema is needed.

Regular and playoff phases complete independently. Transactions still run after a stats/bracket/finals failure, and the overall job fails when required work is incomplete. Commands run sequentially so snapshot manifests do not race. The workflow queues hosted scheduled/manual runs in one concurrency group without cancelling an active import.

Generated mappings remain temporary and are regenerated when needed. The hosted job disables source CSV/R2 backups, imports into remote Turso, and publishes affected snapshots to R2. Snapshot storage is serving infrastructure, separate from source backups; see [snapshots](snapshots.md).

## GitHub setup

The import job selects the GitHub environment named **`production`**. In **Settings → Environments → production**, configure these **environment secrets**:

| Secret                 | Value                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `FANTRAX_AUTH_STATE`   | Contents of `src/playwright/.fantrax/fantrax-auth-secret.txt`; see [manual login and renewal](importing.md#1-login-saves-auth-state) |
| `TURSO_DATABASE_URL`   | Production remote database URL                                                                                                       |
| `TURSO_AUTH_TOKEN`     | Production database token                                                                                                            |
| `R2_ENDPOINT`          | Existing Cloudflare R2 endpoint                                                                                                      |
| `R2_ACCESS_KEY_ID`     | Existing snapshot storage access key                                                                                                 |
| `R2_SECRET_ACCESS_KEY` | Existing snapshot storage secret key                                                                                                 |

In the same `production` environment, configure these **environment variables** to match the deployed API:

- `R2_SNAPSHOT_BUCKET_NAME`: required snapshot bucket name
- `R2_SNAPSHOT_PREFIX`: optional; defaults to `snapshots`

Keep `main` allowed under the environment's deployment branch rules. Scheduled and manual production imports should run from `main`; selecting a feature branch will be blocked when only `main` is allowed. Required reviewers, wait timers, or deployment protection rules also apply to this job, so they must permit unattended daily runs if that is intended. Secrets and snapshot variables are resolved in the import step after the selected environment is available. Existing repository-level values are still supported, with the `production` environment taking precedence.

The production database must already be migrated. Hosted imports list any missing configuration by name without printing values, and reject local database URLs, raw-upload mode, missing/invalid authentication state, or an absent/invalid current-season mapping before starting import commands. Auth is restored to an ignored file with owner-only permissions and removed in an always-run workflow cleanup step. The workflow does not upload auth files, debug dumps, traces, CSVs, or generated mappings as artifacts. CI and imports use Ubuntu 24.04 explicitly and Node 24-based action versions, avoiding automatic changes from the `ubuntu-latest` image label.

After the workflow reaches the default branch, first use **Actions → Daily Fantrax import → Run workflow** with `dry_run` checked, then run it normally. Check the job's stage summary and confirm the deployed API data changed. An expired session fails the job; renew the session locally and replace `FANTRAX_AUTH_STATE`. No account password is stored in the workflow.

After changing the workflow, start a new run from `main`; retrying an older failed run uses its original commit and workflow definition. Dry runs preview phase routing without validating hosted credentials, so a normal manual run is still needed to confirm the production environment is connected correctly.

Enable GitHub Actions failure notifications in your GitHub notification settings. GitHub scheduling is best effort: runs can be delayed or dropped, and public-repository schedules disable after 60 days without repository activity. A dropped/disabled run does not generate a failed-run notification; check the workflow's run history and last-success marker when data is stale. See [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

When investigating lateness, compare the intended Helsinki schedule with the run's creation time, job start and step timings. A run created hours late but completed in minutes indicates trigger delay; speeding up dependency or browser installation cannot recover that time. If off-peak scheduling remains too late, an external scheduler can call the existing `workflow_dispatch` trigger on `main`; runner availability and environment protection rules still apply.

## Manual runs and corrections

Existing individual import commands remain available. The coordinator also runs locally from the repository root:

```sh
# Preview routing without reading checkpoints, accessing DB, or writing/downloading files:
npm run import:daily -- --dry-run

# Requires existing migrated DB/session and Playwright browsers:
npm run import:daily

# Reimport completed phases after late stat corrections:
npm run import:daily -- --refresh-finalized
```

The coordinator loads `.env` without overriding explicitly supplied environment variables. `USE_REMOTE_DB` selects the target as in [deployment](deployment.md); `RAW_UPLOAD` must be false. Browser stages use headless Chromium. If needed, install the version-matched shell with `npx playwright install chromium --only-shell`. The coordinator skips npm browser-install prehooks; the hosted workflow installs its shell and Linux dependencies once.

For a hosted correction, check `refresh_finalized` when triggering the workflow manually. A dry run reports phase eligibility without reading completion markers, so it may describe a completed phase as awaiting finalization. Manual local commands do not share GitHub's concurrency queue; avoid running them against production while a hosted import is active.

Metadata syncs support `--strict`, which fails without replacing the existing mapping if any requested season could not be scraped. The coordinator always supplies an explicit year and strict mode. Result importers support `--season=YYYY` and reject a missing season before writing; their no-argument manual behavior still imports all mapped seasons.

## Season rollover

In the summer rollover contribution, update `CURRENT_SEASON` and include the reviewed league mapping with the new season's league ID and dates. The next scheduled run follows that configuration automatically: transactions start immediately for the new season; stats wait for its game dates. No secret, workflow year, or cron change is needed. Complete the previous season's finalization before changing the configured season. Follow the remaining [season-change checklist](season-change.md).
