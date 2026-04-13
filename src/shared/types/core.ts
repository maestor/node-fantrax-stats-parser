export type CsvReport = "regular" | "playoffs";

// API-level reportType. `both` is virtual and represents regular+playoffs merged.
export type Report = CsvReport | "both";

export type QueryParams = {
  reportType: Report;
  season?: number;
  startFrom?: number;
};

export type Team = {
  id: string;
  name: string;
  presentName: string;
  teamAbbr: string;
  nameAliases?: string[];
  // First season year in the YYYY-YYYY+1 format used by imports (e.g. 2017 => 2017-2018).
  // Useful for expansion/relocation where a team doesn't exist in older seasons.
  firstSeason?: number;
};
