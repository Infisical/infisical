import knex, { Knex } from "knex";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import {
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/shared/sql-credentials/sql-credentials-rotation-types";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionRaw, TSqlConnection } from "@app/services/app-connection/app-connection-types";
import { TSqlConnectionConfig } from "@app/services/app-connection/shared/sql/sql-connection-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const SQL_CONNECTION_CLIENT_MAP = {
  [AppConnection.Postgres]: "pg",
  [AppConnection.MsSql]: "mssql"
};

export const getSqlConnectionClient = async (appConnection: Pick<TSqlConnection, "credentials" | "app">) => {
  const {
    app,
    credentials: { host: baseHost, database, port, sslCertificate, password, username }
  } = appConnection;

  const ssl = sslCertificate ? { rejectUnauthorized: false, ca: sslCertificate } : undefined;

  const [host] = await verifyHostInputValidity(baseHost);

  const client = knex({
    client: SQL_CONNECTION_CLIENT_MAP[app],
    connection: {
      database,
      port,
      host,
      user: username,
      password,
      connectionTimeoutMillis: EXTERNAL_REQUEST_TIMEOUT,
      ssl,
      // following dynamic secret mssql driver requirements (see sql-database.ts)
      // @ts-expect-error this is because of knexjs type signature issue. This is directly passed to driver
      options:
        app === AppConnection.MsSql
          ? {
              trustServerCertificate: !sslCertificate,
              cryptoCredentialsDetails: sslCertificate ? { ca: sslCertificate } : {}
            }
          : undefined
    }
  });

  return client;
};

export const validateSqlConnectionCredentials = async (config: TSqlConnectionConfig) => {
  const { credentials, app } = config;

  const client = await getSqlConnectionClient({ app, credentials });

  try {
    await client.raw(`Select 1`);

    return credentials;
  } catch (error) {
    throw new BadRequestError({
      message:
        (error as Error)?.message?.replaceAll(credentials.password, "********************") ??
        "Unable to validate connection: verify credentials"
    });
  } finally {
    await client.destroy();
  }
};

export const SQL_CONNECTION_ALTER_LOGIN_STATEMENT: Record<
  TSqlCredentialsRotationWithConnection["connection"]["app"],
  (credentials: TSqlCredentialsRotationGeneratedCredentials[number]) => [string, Knex.RawBinding]
> = {
  [AppConnection.Postgres]: ({ username, password }) => [`ALTER USER ?? WITH PASSWORD '${password}';`, [username]],
  [AppConnection.MsSql]: ({ username, password }) => [`ALTER LOGIN ?? WITH PASSWORD = '${password}';`, [username]]
};

export const transferSqlConnectionCredentialsToPlatform = async (
  config: TSqlConnectionConfig,
  callback: (credentials: TSqlConnectionConfig["credentials"]) => Promise<TAppConnectionRaw>
) => {
  const { credentials, app } = config;

  const client = await getSqlConnectionClient({ app, credentials });

  const newPassword = alphaNumericNanoId(32);

  try {
    return await client.transaction(async (tx) => {
      await tx.raw(
        ...SQL_CONNECTION_ALTER_LOGIN_STATEMENT[app]({ username: credentials.username, password: newPassword })
      );
      return callback({
        ...credentials,
        password: newPassword
      });
    });
  } catch (error) {
    // update/create service function will handle
    if (error instanceof DatabaseError) {
      throw error;
    }

    throw new BadRequestError({
      message:
        (error as Error)?.message?.replaceAll(newPassword, "********************") ??
        "Encountered an error transferring credentials to platform"
    });
  } finally {
    await client.destroy();
  }
};
