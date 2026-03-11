import fs from "fs/promises";
import path from "path";
import { createResponse } from "node-mocks-http";

export type MockResponse = ReturnType<typeof createResponse>;

export const asRouteReq = <T>(req: unknown): T => req as T;

export const getJsonBody = <T>(res: MockResponse): T =>
  res._getJSONData() as T;

export const writeSnapshot = async (
  snapshotDir: string,
  snapshotKey: string,
  payload: unknown,
): Promise<void> => {
  const filePath = path.join(snapshotDir, `${snapshotKey}.json`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload), "utf8");
};
