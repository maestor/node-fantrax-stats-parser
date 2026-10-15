// Preserve stats-backed routing for historical position changes, then allow known identities.
export const careerProfileTypeSql = (identity: string): string => `CASE
  WHEN EXISTS (SELECT 1 FROM players WHERE player_id = ${identity}) THEN 'player'
  WHEN EXISTS (SELECT 1 FROM goalies WHERE goalie_id = ${identity}) THEN 'goalie'
  WHEN EXISTS (SELECT 1 FROM fantrax_entities WHERE fantrax_id = ${identity} AND position IN ('F', 'D')) THEN 'player'
  WHEN EXISTS (SELECT 1 FROM fantrax_entities WHERE fantrax_id = ${identity} AND position = 'G') THEN 'goalie'
  ELSE NULL
END`;
