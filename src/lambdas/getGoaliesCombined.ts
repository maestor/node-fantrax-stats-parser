import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getGoaliesStatsCombined } from "../services";
import { reportTypeAvailable, ERROR_MESSAGES } from "../helpers";
import { Report, GoalieFields } from "../types";
import { sendSuccess, sendError } from "./utils/response";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const report = event.pathParameters?.reportType as Report;
  const sortBy = event.pathParameters?.sortBy as GoalieFields | undefined;

  if (!reportTypeAvailable(report)) {
    return sendError(ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  try {
    const data = await getGoaliesStatsCombined(report, sortBy);
    return sendSuccess(data);
  } catch (error) {
    return sendError(error, 500);
  }
};
