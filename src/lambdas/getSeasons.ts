import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getAvailableSeasons } from "../services";
import { sendSuccess, sendError } from "./utils/response";

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const data = await getAvailableSeasons();
    return sendSuccess(data);
  } catch (error) {
    return sendError(error, 500);
  }
};
