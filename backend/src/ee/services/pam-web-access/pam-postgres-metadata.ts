import pg from "pg";

import { getSchemasQuery, getTablesQuery } from "./pam-postgres-data-explorer-metadata";

// Shared connection options for one-shot metadata queries. Each call opens a
// fresh pg.Client, runs one query, then disposes — no persistent BE state.
type OneShotOptions = {
  relayPort: number;
  username: string;
  database: string;
};

const buildClient = ({ relayPort, username, database }: OneShotOptions): pg.Client =>
  new pg.Client({
    host: "localhost",
    port: relayPort,
    user: username,
    database,
    password: "",
    ssl: false,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000
  });

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

// Called once at WS setup to fail fast if credentials or tunnel are broken —
// preserves the early "Connection error" UX we used to get from pgClient.connect().
export const verifyReachabilityOneShot = (opts: OneShotOptions): Promise<void> =>
  withClient(opts, async (client) => {
    await client.query("SELECT 1");
  });
