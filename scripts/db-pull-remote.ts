#!/usr/bin/env tsx

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient, type InStatement, type InValue } from "@libsql/client";

dotenv.config();

type SqliteObjectRow = {
  name: string;
  sql: string | null;
};

type GenericRow = Record<string, unknown>;

const LOCAL_DB_FILE = "local.db";
const BACKUPS_DIR = ".backups";
const BATCH_SIZE = 200;

const quoteIdentifier = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

const toRows = <T>(rows: unknown[]): T[] => rows as T[];

const toInValue = (value: unknown): InValue | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
};

const ensureRequiredEnv = (): { remoteUrl: string; remoteAuthToken: string } => {
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  const remoteAuthToken = process.env.TURSO_AUTH_TOKEN;

  if (!remoteUrl || remoteUrl.startsWith("file:")) {
    throw new Error(
      "TURSO_DATABASE_URL must point to a remote Turso database (libsql://...) in your .env",
    );
  }

  if (!remoteAuthToken) {
    throw new Error("TURSO_AUTH_TOKEN is required to read from remote Turso database");
  }

  return { remoteUrl, remoteAuthToken };
};

const createBackup = (dbPath: string): string | null => {
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  const backupsDirPath = path.resolve(process.cwd(), BACKUPS_DIR);
  fs.mkdirSync(backupsDirPath, { recursive: true });

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const backupFileName = `local.db.backup-${timestamp}`;
  const backupPath = path.join(backupsDirPath, backupFileName);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
};

const executeStatementsInChunks = async (
  statements: InStatement[],
  executeChunk: (chunk: InStatement[]) => Promise<void>,
): Promise<void> => {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    const chunk = statements.slice(index, index + BATCH_SIZE);
    await executeChunk(chunk);
  }
};

const main = async (): Promise<void> => {
  const { remoteUrl, remoteAuthToken } = ensureRequiredEnv();

  const localDbPath = path.resolve(process.cwd(), LOCAL_DB_FILE);
  const backupPath = createBackup(localDbPath);

  const remoteDb = createClient({ url: remoteUrl, authToken: remoteAuthToken });
  const localDb = createClient({ url: `file:${localDbPath}` });

  console.info(`Pulling remote DB: ${remoteUrl}`);
  console.info(`Writing local DB: file:${localDbPath}`);
  if (backupPath) {
    console.info(`Created backup: ${backupPath}`);
  }

  const remoteTablesResult = await remoteDb.execute(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const remoteTables = toRows<SqliteObjectRow>(remoteTablesResult.rows as unknown[]);

  const remoteObjectsResult = await remoteDb.execute(
    "SELECT type, name, sql FROM sqlite_master WHERE type IN ('index', 'trigger', 'view') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 ELSE 3 END, name",
  );
  const remoteObjects = toRows<Array<SqliteObjectRow & { type: string }>[number]>(
    remoteObjectsResult.rows as unknown[],
  );

  const localTablesResult = await localDb.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const localTables = toRows<Array<{ name: string }>[number]>(localTablesResult.rows as unknown[]);

  await localDb.execute("PRAGMA foreign_keys = OFF");

  for (const table of localTables) {
    await localDb.execute(`DROP TABLE IF EXISTS ${quoteIdentifier(table.name)}`);
  }

  for (const table of remoteTables) {
    if (!table.sql) {
      continue;
    }
    await localDb.execute(table.sql);
  }

  for (const table of remoteTables) {
    const tableName = quoteIdentifier(table.name);
    const rowsResult = await remoteDb.execute(`SELECT * FROM ${tableName}`);
    const rows = toRows<GenericRow>(rowsResult.rows as unknown[]);

    if (rows.length === 0) {
      continue;
    }

    const columns = Object.keys(rows[0]);
    const columnsSql = columns.map(quoteIdentifier).join(", ");
    const placeholders = columns.map(() => "?").join(", ");

    const statements: InStatement[] = rows.map((row) => ({
      sql: `INSERT INTO ${tableName} (${columnsSql}) VALUES (${placeholders})`,
      args: columns.map((column) => toInValue(row[column])),
    }));

    await executeStatementsInChunks(statements, async (chunk) => {
      await localDb.batch(chunk, "write");
    });

    console.info(`Copied ${rows.length} row(s) from ${table.name}`);
  }

  for (const object of remoteObjects) {
    if (!object.sql) {
      continue;
    }
    await localDb.execute(object.sql);
  }

  await localDb.execute("PRAGMA foreign_keys = ON");

  console.info("Done. local.db now matches remote Turso schema + data.");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
