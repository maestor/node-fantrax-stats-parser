# FFHL Stats API

TypeScript/Node API serving FFHL fantasy-hockey data from Turso/SQLite and generated JSON snapshots. Fantrax CSVs and FFHL forum draft history are import sources.

[Angular UI](https://github.com/maestor/fantrax-stats-parser-ui) · [Live UI](https://ffhl-stats.vercel.app/) · [Development docs](docs/README.md) · [Agent workflow](AGENTS.md)

## Quick start

Use Node.js `>=24 <25` and npm `>=10`.

```sh
npm install
cp .env.example .env
npm run db:migrate
# If needed, download CSV backups (requires R2 credentials):
npm run r2:download
# Or use files already under csv/:
npm run db:import:stats
npm run dev
```

Local API: `http://localhost:3000`. See [importing](docs/importing.md) for fresh scraping, transactions, standings, finals, and draft history; [deployment](docs/deployment.md) for database targets/auth.

## API contract

[Hosted Swagger UI](https://ffhl-stats-api.vercel.app/api-docs) · [Hosted OpenAPI JSON](https://ffhl-stats-api.vercel.app/openapi.json) · [Local Swagger UI](http://localhost:3000/api-docs)

[openapi.yaml](openapi.yaml) owns route parameters and response schemas. Families include players, goalies, career, leaderboard, draft, and metadata. Hosted routing supports root and `/api/*` paths. When auth is enabled, data requests use `x-api-key` or Bearer auth; health routes remain public.

```sh
curl -H "x-api-key: <your-key>" \
  'http://localhost:3000/players/combined/regular?teamId=1'
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with reload |
| `npm start` | Build and start compiled server |
| `npm test` | Jest suite |
| `npm run test:integration` | Temporary SQLite route/service tests |
| `npm run verify` | Lint, types, unused exports, build, coverage; after review acceptance |
| `npm run snapshot:generate` | Regenerate snapshots; see [scope rules](docs/snapshots.md) |

[package.json](package.json) owns all commands and versions. Runtime uses local HTTP helpers, rou3 routing, and libSQL; imports use Playwright and csv-parse.
