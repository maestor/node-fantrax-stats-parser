import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getRawDataFromFiles } from "../services";
import { mapGoalieData } from "../mappings";
import {
  sortItemsByStatField,
  reportTypeAvailable,
  seasonAvailable,
  getSeasonParam,
} from "../helpers";
import { Report, GoalieFields } from "../types";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const report = event.pathParameters?.reportType as Report;
  const sortBy = event.pathParameters?.sortBy as GoalieFields | undefined;
  const season = event.pathParameters?.season ? Number(event.pathParameters?.season) : undefined;

  if (!reportTypeAvailable(report)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid report type" }) };
  }

  if (!seasonAvailable(season)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Stats for this season are not available" }),
    };
  }

  const rawData = await getRawDataFromFiles(report, getSeasonParam(season));
  const sortedData = sortItemsByStatField(mapGoalieData(rawData), "goalies", sortBy);

  return {
    statusCode: 200,
    body: JSON.stringify(sortedData),
  };
};
