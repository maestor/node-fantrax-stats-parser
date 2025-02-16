import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getRawDataFromFiles } from "../services";
import { mapPlayerData } from "../mappings";
import {
  sortItemsByStatField,
  reportTypeAvailable,
  seasonAvailable,
  getSeasonParam,
  ERROR_MESSAGES,
} from "../helpers";
import { Report, PlayerFields } from "../types";
import { sendSuccess, sendError } from "./utils/response";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const report = event.pathParameters?.reportType as Report;
  const sortBy = event.pathParameters?.sortBy as PlayerFields | undefined;
  const season = event.pathParameters?.season ? Number(event.pathParameters?.season) : undefined;

  if (!reportTypeAvailable(report)) {
    return sendError(ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  if (!seasonAvailable(season)) {
    return sendError(ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
  }

  const rawData = await getRawDataFromFiles(report, getSeasonParam(season));
  const data = sortItemsByStatField(mapPlayerData(rawData), "players", sortBy);

  return sendSuccess(data);
};
