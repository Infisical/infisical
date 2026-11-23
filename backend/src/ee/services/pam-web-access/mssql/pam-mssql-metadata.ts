import { type Connection } from "tedious";

import { logger } from "@app/lib/logger";

import { type OneShotOptions } from "../pam-data-explorer-session-handler";
import { connectMssql, queryRows } from "./pam-mssql-client";
import { getSchemasQuery, getTablesQuery } from "./pam-mssql-data-explorer-metadata";

const withConnection = async <T>(opts: OneShotOptions, fn: (conn: Connection) => Promise<T>): Promise<T> => {
  const conn = await connectMssql(opts, 10_000);
  conn.on("error", (err) => {
    logger.debug(err, "one-shot mssql connection error");
  });
  try {
    return await fn(conn);
  } finally {
    conn.close();
  }
};

export const fetchSchemasOneShot = (opts: OneShotOptions): Promise<{ name: string }[]> =>
  withConnection(opts, (conn) => {
    const query = getSchemasQuery();
    return queryRows<{ name: string }>(conn, query.sql, query.params);
  });

export const fetchTablesOneShot = (
  opts: OneShotOptions,
  schema: string
): Promise<{ name: string; tableType: string }[]> =>
  withConnection(opts, (conn) => {
    const query = getTablesQuery(schema);
    return queryRows<{ name: string; tableType: string }>(conn, query.sql, query.params);
  });

export const verifyReachabilityOneShot = (opts: OneShotOptions): Promise<void> =>
  withConnection(opts, async (conn) => {
    await queryRows(conn, "SELECT 1 AS ok");
  });
