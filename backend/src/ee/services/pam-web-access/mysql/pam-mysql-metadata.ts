import mysql from "mysql2/promise";

import { logger } from "@app/lib/logger";

import { type OneShotOptions } from "../pam-data-explorer-session-handler";
import { getSchemasQuery, getTablesQuery } from "./pam-mysql-data-explorer-metadata";

const buildConnection = async ({ relayPort, username, database }: OneShotOptions): Promise<mysql.Connection> => {
  const conn = await mysql.createConnection({
    host: "localhost",
    port: relayPort,
    user: username,
    database: database || undefined,
    password: "",
    connectTimeout: 10_000,
    multipleStatements: false
  });
  return conn;
};

const withConnection = async <T>(opts: OneShotOptions, fn: (conn: mysql.Connection) => Promise<T>): Promise<T> => {
  const conn = await buildConnection(opts);
  try {
    return await fn(conn);
  } finally {
    await conn.end().catch((err) => {
      logger.debug(err, "one-shot mysql connection end error");
    });
  }
};

export const fetchSchemasOneShot = (opts: OneShotOptions): Promise<{ name: string }[]> =>
  withConnection(opts, async (conn) => {
    const query = getSchemasQuery();
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(query.sql, query.values);
    return rows as { name: string }[];
  });

export const fetchTablesOneShot = (
  opts: OneShotOptions,
  schema: string
): Promise<{ name: string; tableType: string }[]> =>
  withConnection(opts, async (conn) => {
    const query = getTablesQuery(schema);
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(query.sql, query.values);
    return rows as { name: string; tableType: string }[];
  });

export const verifyReachabilityOneShot = (opts: OneShotOptions): Promise<void> =>
  withConnection(opts, async (conn) => {
    await conn.execute("SELECT 1");
  });
