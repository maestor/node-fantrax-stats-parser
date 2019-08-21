# node-fantrax-stats-parser

## Purpose
Lightweight API to parsing my NHL fantasy league team stats and print combined seasons results by player (regular season &amp; playoffs separately) as JSON. CSV files exported manually from [Fantrax](https://www.fantrax.com). That is also some kind of practice to get some knowledge about micro, if it would be good replacement for example heavy express in some use cases.

## Installation and use
```
1. Install Node (at least 8.x recommended)
2. Clone repo
3. yarn
4. yarn dev
5. Go to endpoints mentioned below
```

## Endpoints
`/parse/regular` - Get regular season stats combined (starting from 12-13 season)

`/parse/playoffs` - Get playoffs stats combined (starting from 12-13 season)

`/parse/{regular|playoffs}/{sortBy}` - Get stats sorted by specific stat property (available options: games, goals, assists, points, plusMinus, penalties, shots, ppp, shp, hits, blocks)

## Technology
Written with [TypeScript](https://www.typescriptlang.org/), using [micro](https://github.com/zeit/micro) with (NodeJS)[https://nodejs.org] server to get routing work. Library called [csvtojson](https://github.com/Keyang/node-csvtojson) used for parsing sources.

## Todo
- Refactoring dirty quick solutions before going public
- Goalie stats
- One season support
- Some kind of UI(?)
