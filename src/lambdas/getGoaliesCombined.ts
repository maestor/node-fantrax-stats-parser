import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getRawDataFromFiles } from "../services";
import { mapCombinedGoalieData } from "../mappings";
import {
  sortItemsByStatField,
  reportTypeAvailable,
  getAvailableSeasons,
  ERROR_MESSAGES,
} from "../helpers";
import { Report, GoalieFields } from "../types";
import { sendSuccess, sendError } from "./utils/response";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const report = event.pathParameters?.reportType as Report;
  const sortBy = event.pathParameters?.sortBy as GoalieFields | undefined;

  if (!reportTypeAvailable(report)) {
    return sendError(ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  const rawData = await getRawDataFromFiles(report, getAvailableSeasons());
  const data = sortItemsByStatField(mapCombinedGoalieData(rawData), "goalies", sortBy);

  return sendSuccess(data);
};
