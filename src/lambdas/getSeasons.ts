import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { mapAvailableSeasons } from "../mappings";

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify(mapAvailableSeasons()),
  };
};
