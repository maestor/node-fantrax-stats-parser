# node-fantrax-stats-parser

## Purpose
Lightweight API to parsing my NHL fantasy league team stats and print combined seasons results by player (regular season &amp; playoffs separately) as JSON. CSV files exported manually from [Fantrax](https://www.fantrax.com). That is also some kind of practice to get some knowledge about micro, if it would be good replacement for example heavy express in some use cases. And finally, I have made last years at least 95% Frontend stuff with JS, so that is good little project to keep backend stuff on my mind.

## Installation and use
```
1. Install Node (at least 8.x recommended)
2. Clone repo
3. yarn
4. yarn dev
5. Go to endpoints mentioned below
```

## Endpoints
`/players/season/:reportType/:season/:sortBy` - Get player stats for single season

`/players/combined/:reportType/:sortBy` - Get player stats combined (repository data starting from 12-13 season)

### Parameters

`reportType` - Required. Currently available options: regular, playoffs.

`season` - Optional. Needed only in single season endpoint. Starting year of the season want to check. If not specified, latest available season will show.

`sortBy` - Optional. Sort results by specific stats field. Currently available options: games, goals, assists, points, plusMinus, penalties, shots, ppp, shp, hits, blocks.

## Technology
Written with [TypeScript](https://www.typescriptlang.org/), using [micro](https://github.com/zeit/micro) with [NodeJS](https://nodejs.org) server to get routing work. Library called [csvtojson](https://github.com/Keyang/node-csvtojson) used for parsing sources.

## Todo
- Mostly refactoring this dirty quick first solution before going public
- Goalie stats
- One season support
- Start using database and CSV import tool
- Find out if Fantrax offers some API to get needed data easily instead of CSV export
- Some kind of UI for stats (very low prio, it might be enough to get numbers copypaste when needed somewhere)
