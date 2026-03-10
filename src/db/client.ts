import { createClient, type Client } from "@libsql/client";

let clientInstance: Client | null = null;

export const getDbClient = (): Client => {
  if (!clientInstance) {
    clientInstance = process.env.TURSO_DATABASE_URL
      ? createClient({
          url: process.env.TURSO_DATABASE_URL,
          authToken: process.env.TURSO_AUTH_TOKEN,
        })
      : createClient({ url: "file:local.db" });
  }
  return clientInstance;
};

/** @internal Test-only export for resetting the shared DB client. */
export const resetDbClientForTests = (): void => {
  clientInstance = null;
};
