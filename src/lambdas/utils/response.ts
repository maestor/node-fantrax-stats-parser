import { APIGatewayProxyResult } from "aws-lambda";

export const sendSuccess = <T>(body: T) => sendResponse(200, body);

export const sendError = (error: any, statusCode: number = 400) =>
  sendResponse(statusCode, { error });

const sendResponse = <T>(statusCode: number, body: T): APIGatewayProxyResult => ({
  statusCode,
  body: JSON.stringify(body),
});
