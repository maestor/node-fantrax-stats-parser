import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { mapAvailableSeasons } from "../mappings";
import { sendSuccess } from "./utils/response";

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const data = mapAvailableSeasons();
  return sendSuccess(data);
};
