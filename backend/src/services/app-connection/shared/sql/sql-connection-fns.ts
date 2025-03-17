import knex from "knex";

import { getConfig } from "@app/lib/config/env";
import { getDbConnectionHost } from "@app/lib/knex";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TSqlConnectionQueryParams } from "./sql-connection-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const SQL_CONNECTION_CLIENT_MAP = {
  [AppConnection.Postgres]: "pg",
  [AppConnection.MsSql]: "mssql"
};

export const sqlConnectionQuery = async ({
  credentials: { host, database, port, ca, password, username },
  app,
  query,
  variables = [],
  options
}: TSqlConnectionQueryParams) => {
  const appCfg = getConfig();

  const ssl = ca ? { rejectUnauthorized: false, ca } : undefined;
  const isCloud = Boolean(appCfg.LICENSE_SERVER_KEY); // quick and dirty way to check if its cloud or not
  const dbHost = appCfg.DB_HOST || getDbConnectionHost(appCfg.DB_CONNECTION_URI);

  if (
    (isCloud &&
      // internal ips
      (host === "host.docker.internal" || host.match(/^10\.\d+\.\d+\.\d+/) || host.match(/^192\.168\.\d+\.\d+/))) ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    // Infisical's database
    dbHost === host
  )
    throw new Error("Invalid Host");

  const db = knex({
    client: SQL_CONNECTION_CLIENT_MAP[app],
    connection: {
      database,
      port,
      host,
      user: username,
      password,
      connectionTimeoutMillis: EXTERNAL_REQUEST_TIMEOUT,
      ssl,
      pool: { min: 0, max: 1 },
      options
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const results = await db.raw(query, variables);

  await db.destroy();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return results;
};
