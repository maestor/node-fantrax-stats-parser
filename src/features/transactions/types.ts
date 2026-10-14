export type HistoryTeam = { id: string; name: string };
export type TradeAssemblyStatus = "reconstructed" | "ambiguous" | "incomplete";
export type TradeAsset = {
  type: "player" | "draft_pick" | "other";
  name: string;
  rawName: string;
  entityId: string | null;
  careerType: "player" | "goalie" | null;
  position: string | null;
  fromTeam: HistoryTeam;
  toTeam: HistoryTeam;
  draftSeason: number | null;
  draftRound: number | null;
  draftOriginalOwner: HistoryTeam | null;
};
export type TradeDetail = {
  id: string;
  season: number;
  date: string;
  status: TradeAssemblyStatus;
  blocks: Array<{
    sourceBlockIndex: number;
    sourcePeriod: number;
    assets: TradeAsset[];
  }>;
};
export type DraftHistoryEvent = {
  id: string;
  type: "draft";
  season: number | null;
  date: null;
  draftType: "entry" | "opening";
  round: number;
  pickNumber: number;
  team: HistoryTeam;
  originalOwner: HistoryTeam;
};
export type ClaimHistoryEvent = {
  id: string;
  type: "claim" | "drop";
  season: number;
  date: string;
  team: HistoryTeam;
};
export type TradeHistoryEvent = {
  id: string;
  type: "trade";
  season: number;
  date: string;
  tradeId: string;
  status: TradeAssemblyStatus;
  movements: Array<{ fromTeam: HistoryTeam; toTeam: HistoryTeam }>;
};
export type CareerHistoryEvent =
  DraftHistoryEvent | ClaimHistoryEvent | TradeHistoryEvent;
export type CareerHistory = {
  id: string;
  coverage: {
    entryDraftSeasons: number[];
    openingDraftPresent: boolean;
    claimSeasons: number[];
    tradeSeasons: number[];
    completeness: "unknown";
  };
  events: CareerHistoryEvent[];
};
