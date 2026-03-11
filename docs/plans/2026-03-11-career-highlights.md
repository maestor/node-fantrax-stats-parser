# Career Highlights API Implementation Plan

**Goal:** Add a new snapshot-backed `/career/highlights/:type` endpoint that mixes skaters and goalies into four career highlight leaderboards with `skip`/`take` paging, while keeping runtime requests lightweight and fixing the known `06mqq` CSV normalization bug at the source.

**Architecture:** Reuse the existing career-row loaders during snapshot generation, aggregate highlight leaderboards in TypeScript, serve them via the existing snapshot-or-DB route pattern, and apply paging after loading the full sorted list. Keep the `06mqq` fix in `scripts/handle-csv.sh` so later import steps see the corrected goalie position automatically.

**Public API:** `GET /career/highlights/:type` where `:type` is one of `most-teams-played`, `most-teams-owned`, `same-team-seasons-played`, or `same-team-seasons-owned`. Query params: `skip` and `take` with defaults `0` and `10`. Response shape: `{ type, skip, take, total, items }`.

---

### Task 1: Add the persisted plan artifact

Create this file under `docs/plans/` using the existing dated filename convention so future sessions can resume from disk.

**Files:**
- Add: `docs/plans/2026-03-11-career-highlights.md`

---

### Task 2: Add career highlight API models and constants

Introduce explicit highlight type unions, paged response types, item shapes, and route-level validation messages/defaults.

**Changes:**
- Add a highlight type union for the four supported route tokens.
- Add shared team reference type `{ id, name }`.
- Add team-count highlight item shape `{ id, name, position, teamCount, teams }`.
- Add same-team highlight item shape `{ id, name, position, seasonCount, team }`.
- Add paged response envelope `{ type, skip, take, total, items }`.
- Add route-validation constants for invalid highlight types and invalid paging params.

---

### Task 3: Implement service-side career highlight aggregation

Build the four sorted full lists in the service layer by reusing the existing all-career player/goalie row queries.

**Rules:**
- `most-teams-played`: distinct teams with at least one `games > 0` row in regular or playoffs; minimum `teamCount >= 3`.
- `most-teams-owned`: distinct teams from any imported row, including `games = 0`; minimum `teamCount >= 3`.
- `same-team-seasons-played`: per person/team, distinct seasons with at least one `games > 0` row in regular or playoffs; return one row per tied max team; minimum `seasonCount >= 5`.
- `same-team-seasons-owned`: per person/team, distinct seasons from any imported row; return one row per tied max team; minimum `seasonCount >= 5`.

**Sorting:**
- Global list: primary count descending, then `name`, then `id`, then team name for same-team rows.
- Team arrays inside team-count highlights: first season seen ascending, then team name ascending.

**Notes:**
- Keep skater positions as `F` or `D`.
- Emit synthetic goalie position `G`.
- Do not add API `kind` or namespaced ids.

---

### Task 4: Add route, paging, and snapshot wiring

Wire the new endpoint into the existing route/snapshot stack.

**Changes:**
- Register `/career/highlights/:type` in `src/index.ts`.
- Add route handler validation for:
  - unknown highlight type -> `400`
  - non-integer or negative `skip`/`take` -> `400`
  - `take > 100` -> `400`
- Apply defaults `skip=0`, `take=10`.
- Add snapshot keys under `career/highlights/<type>`.
- Extend snapshot generation to write all four highlight payloads.
- Apply paging after snapshot-or-DB load so runtime stays DB-light.

---

### Task 5: Fix the `06mqq` normalization bug upstream

Correct the malformed goalie position at CSV normalization time instead of compensating in the API.

**Changes:**
- Update `scripts/handle-csv.sh`.
- In the `goalies` section, if the normalized row id is `*06mqq*`, force the normalized `Pos` column to `G` before printing the row.

**Assumption:**
- No standalone DB backfill script is added. Existing bad DB data is corrected by rerunning import on the affected source after this normalization fix.

---

### Task 6: Add tests in the planned order

Start with route integration coverage, then use coverage results to add the minimum direct tests needed to keep 100%.

**Route integration must cover:**
- live DB response for each highlight family
- snapshot-served response
- `skip`/`take` slicing and `total`
- invalid `skip`/`take`
- unknown highlight type
- duplicate rows for same-team ties
- OpenAPI schema conformance

**Expected follow-up direct tests:**
- service tests for threshold filtering, played-vs-owned counting, distinct-season merging across regular/playoffs, and deterministic sorting
- a normalization test that runs `scripts/handle-csv.sh` on a temp CSV sample and proves `06mqq` is rewritten to goalie `G` without changing unrelated rows

---

### Task 7: Update API/docs and verify

Document the new endpoint and the CSV normalization rule in the same change.

**Files:**
- Modify: `openapi.yaml`
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`

**Verification sequence:**
1. Run the new route integration tests first
2. Run coverage and add the minimal remaining direct tests
3. Run `npm run verify`

