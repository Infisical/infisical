import pg from "pg";

import { logger } from "@app/lib/logger";

import { type OneShotOptions } from "../pam-data-explorer-session-handler";
import { getSchemasQuery, getTablesQuery } from "./pam-postgres-data-explorer-metadata";

const buildClient = ({ relayPort, username, database }: OneShotOptions): pg.Client => {
  const client = new pg.Client({
    host: "localhost",
    port: relayPort,
    user: username,
    database,
    password: "",
    ssl: false,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000
  });
  client.on("error", (err) => {
    logger.debug(err, "one-shot pg client error");
  });
  return client;
};

const withClient = async <T>(opts: OneShotOptions, fn: (client: pg.Client) => Promise<T>): Promise<T> => {
  const client = buildClient(opts);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
};

export const fetchSchemasOneShot = (opts: OneShotOptions): Promise<{ name: string }[]> =>
  withClient(opts, async (client) => {
    const query = getSchemasQuery();
    const result = await client.query<{ name: string }>(query.text, query.values);
    return result.rows;
  });

export const fetchTablesOneShot = (
  opts: OneShotOptions,
  schema: string
): Promise<{ name: string; tableType: string }[]> =>
  withClient(opts, async (client) => {
    const query = getTablesQuery(schema);
    const result = await client.query<{ name: string; tableType: string }>(query.text, query.values);
    return result.rows;
  });

export const verifyReachabilityOneShot = (opts: OneShotOptions): Promise<void> =>
  withClient(opts, async (client) => {
    await client.query("SELECT 1");
  });
