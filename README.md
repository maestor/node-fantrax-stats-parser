# FFHL Stats API

FFHL Stats API serves FFHL fantasy-hockey data as JSON from a Turso/SQLite database. Fantrax CSV exports and FFHL forum draft history are import sources; runtime responses come from the database and, for some read-mostly routes, generated JSON snapshots.

[Angular UI written for this API](https://github.com/maestor/fantrax-stats-parser-ui)

[Hosted UI showcase](https://ffhl-stats.vercel.app/)

## Quick Start

- Node.js `>=24 <25`
- npm `>=10`

```bash
git clone https://github.com/maestor/node-fantrax-stats-parser.git
cd node-fantrax-stats-parser
npm install
cp .env.example .env
npm run db:migrate

# Choose one data source:
# 1) Download CSV backup from R2 (requires R2 credentials in .env)
npm run r2:download

# 2) Or use existing files already present under csv/

npm run db:import:stats
npm run dev
```

Open [http://localhost:3000/api-docs](http://localhost:3000/api-docs) for the local Swagger UI.

If you need to scrape fresh Fantrax or FFHL forum data instead of using existing CSV/JSON inputs, use [docs/IMPORTING.md](docs/IMPORTING.md).

## API Docs

- Hosted Swagger UI: [https://ffhl-stats-api.vercel.app/api-docs](https://ffhl-stats-api.vercel.app/api-docs)
- Hosted OpenAPI JSON: [https://ffhl-stats-api.vercel.app/openapi.json](https://ffhl-stats-api.vercel.app/openapi.json)
- Local docs: start the dev server and open [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

The hosted demo supports both root-style URLs and `/api/*` URLs. Health routes stay public, while most data routes require an API key via `x-api-key` or `Authorization: Bearer <key>`.

### Players and Goalies

```bash
curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/players/combined/regular?teamId=1"

curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/goalies/combined/playoffs?teamId=1"
```

### Career

```bash
curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/career/players"

 curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/career/highlights/most-teams-owned"
```

### Leaderboard

```bash
curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/leaderboard/regular"

curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/leaderboard/transactions"
```

### Draft

```bash
curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/draft/original"

curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/draft/entry"
```

`/draft/entry` includes per-pick `playedInLeague` and `playedForDraftingTeam` flags plus matching team-summary counts and percentages.

### Meta

```bash
curl https://ffhl-stats-api.vercel.app/health

curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/teams"

curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/seasons?startFrom=2020"

curl -H "x-api-key: <your-key>" \
  "https://ffhl-stats-api.vercel.app/last-modified"
```

OpenAPI is the source of truth for route parameters and response schemas.

## Common Commands

```bash
npm run dev
npm run verify
npm run db:migrate
npm run db:import:stats
npm run test:integration
npm run snapshot:generate
```

## Documentation

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) - development workflow, code standards, project structure, OpenAPI maintenance
- [docs/TESTING.md](docs/TESTING.md) - test strategy, coverage expectations, integration testing rules
- [docs/IMPORTING.md](docs/IMPORTING.md) - Fantrax sync/import workflows, FFHL draft sync, draft entity linking/backfill, CSV normalization
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Vercel, Turso, R2, API auth, caching, operational commands
- [docs/SNAPSHOTS.md](docs/SNAPSHOTS.md) - snapshot-backed endpoints, generation rules, R2 snapshot storage
- [docs/SCORING.md](docs/SCORING.md) - player and goalie scoring model details

## Technology

Written in TypeScript on Node.js. The API uses lightweight local HTTP helpers, [rou3](https://github.com/h3js/rou3) for route matching, Turso/libSQL for the database layer, and local import tooling around Playwright plus `csv-parse`.
