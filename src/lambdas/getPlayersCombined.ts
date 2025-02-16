import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getPlayersStatsCombined } from "../services";
import { reportTypeAvailable, ERROR_MESSAGES } from "../helpers";
import { Report, PlayerFields } from "../types";
import { sendSuccess, sendError } from "./utils/response";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const report = event.pathParameters?.reportType as Report;
  const sortBy = event.pathParameters?.sortBy as PlayerFields | undefined;

  if (!reportTypeAvailable(report)) {
    return sendError(ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  try {
    const data = await getPlayersStatsCombined(report, sortBy);
    return sendSuccess(data);
  } catch (error) {
    return sendError(error, 500);
  }
};
