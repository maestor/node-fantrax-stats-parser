import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getPlayersStatsSeason } from "../services";
import { reportTypeAvailable, seasonAvailable, ERROR_MESSAGES } from "../helpers";
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

  try {
    const data = await getPlayersStatsSeason(report, season, sortBy);
    return sendSuccess(data);
  } catch (error) {
    return sendError(error, 500);
  }
};
