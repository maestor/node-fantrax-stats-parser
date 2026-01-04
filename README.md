# node-fantrax-stats-parser

## Purpose

Lightweight API to parse my NHL fantasy league team stats and print combined seasons results by player (regular season &amp; playoffs separately) as JSON. CSV files exported manually from [Fantrax](https://www.fantrax.com). This is also some kind of practice to get some knowledge about micro, if it would be good replacement for example heavy express server in some use cases. And finally, I have made last years at least 95% Frontend stuff with JS, so that is good little project to keep backend stuff on my mind.

[UI written by Angular which uses this parser.](https://github.com/maestor/fantrax-stats-parser-ui)

## Installation and use

```
1. Install Node (at least 18.x recommended)
2. Clone repo
3. npm install
4. npm run dev
5. Go to endpoints mentioned below
```

## Endpoints

`/seasons` - Available seasons list (item format `{ season: 2012, text: '2012-2013' }`)

`/players/season/:reportType/:season/:sortBy` - Get player stats for a single season

`/players/combined/:reportType/:sortBy` - Get player stats combined (repository data starting from 12-13 season). Includes a 'seasons' array with individual season stats.

`/goalies/season/:reportType/:season/:sortBy` - Get goalie stats for a single season

`/goalies/combined/:reportType/:sortBy` - Get goalie stats combined (repository data starting from 12-13 season, goal against average and save percentage NOT included as combined!). Includes a 'seasons' array with individual season stats.

### Parameters

`reportType` - Required. Currently available options: regular, playoffs.

`season` - Optional. Needed only in single season endpoint. Starting year of the season want to check. If not specified, latest available season will show.

`sortBy` - Optional. Sort results by specific stats field. Currently available options: games, goals, assists, points, penalties, ppp, shp for both. shots, plusMinus, hits, blocks for players only and wins, saves, shutouts for goalies only. If not specified, sort by points (players) and by wins (goalies).

## Technology

Written with [TypeScript](https://www.typescriptlang.org/), using [micro](https://github.com/zeit/micro) with [NodeJS](https://nodejs.org) server to get routing work. Library called [csvtojson](https://github.com/Keyang/node-csvtojson) used for parsing sources.

## Todo

- Start using database and CSV import tool
- Find out if Fantrax offers some API to get needed data easily instead of CSV export

Feel free to suggest feature / implementation polishing with writing issue or make PR if you want to contribute!
