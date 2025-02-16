import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getRawDataFromFiles } from "../services";
import { mapCombinedPlayerData } from "../mappings";
import { sortItemsByStatField, reportTypeAvailable, getAvailableSeasons } from "../helpers";
import { Report, PlayerFields } from "../types";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const report = event.pathParameters?.reportType as Report;
  const sortBy = event.pathParameters?.sortBy as PlayerFields | undefined;

  if (!reportTypeAvailable(report)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid report type" }) };
  }

  const rawData = await getRawDataFromFiles(report, getAvailableSeasons());
  const sortedData = sortItemsByStatField(mapCombinedPlayerData(rawData), "players", sortBy);

  return {
    statusCode: 200,
    body: JSON.stringify(sortedData),
  };
};
