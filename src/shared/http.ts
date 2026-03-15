export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const satisfies Record<string, number>;

export const ERROR_MESSAGES = {
  INVALID_REPORT_TYPE: "Invalid report type",
  INVALID_CAREER_HIGHLIGHT_TYPE: "Invalid career highlight type",
  INVALID_PAGING_PARAMS: "Invalid paging params",
  SEASON_NOT_AVAILABLE: "Stats for given season are not available",
  PLAYER_NOT_FOUND: "Player not found",
  GOALIE_NOT_FOUND: "Goalie not found",
};
