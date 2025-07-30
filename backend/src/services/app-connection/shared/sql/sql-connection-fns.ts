import knex, { Knex } from "knex";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import {
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/shared/sql-credentials/sql-credentials-rotation-types";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionRaw, TSqlConnection } from "@app/services/app-connection/app-connection-types";
import { TSqlConnectionConfig } from "@app/services/app-connection/shared/sql/sql-connection-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const SQL_CONNECTION_CLIENT_MAP = {
  [AppConnection.Postgres]: "pg",
  [AppConnection.MsSql]: "mssql",
  [AppConnection.MySql]: "mysql2",
  [AppConnection.OracleDB]: "oracledb"
};

const getConnectionConfig = ({
  app,
  credentials: { host, sslCertificate, sslEnabled, sslRejectUnauthorized }
}: Pick<TSqlConnection, "credentials" | "app">) => {
  switch (app) {
    case AppConnection.Postgres: {
      return {
        ssl: sslEnabled
          ? {
              rejectUnauthorized: sslRejectUnauthorized,
              ca: sslCertificate,
              servername: host
            }
          : false
      };
    }
    case AppConnection.MsSql: {
      return {
        options: sslEnabled
          ? {
              trustServerCertificate: !sslRejectUnauthorized,
              encrypt: true,
              cryptoCredentialsDetails: sslCertificate ? { ca: sslCertificate } : {}
            }
          : { encrypt: false }
      };
    }
    case AppConnection.MySql: {
      return {
        ssl: sslEnabled
          ? {
              rejectUnauthorized: sslRejectUnauthorized,
              ca: sslCertificate,
              servername: host
            }
          : false
      };
    }

    case AppConnection.OracleDB: {
      return {
        ssl: sslEnabled
          ? {
              sslCA: sslCertificate,
              sslServerDNMatch: sslRejectUnauthorized
            }
          : false
      };
    }
    default:
      throw new Error(`Unhandled SQL Connection Config: ${app as AppConnection}`);
  }
};

export const getSqlConnectionClient = async (appConnection: Pick<TSqlConnection, "credentials" | "app">) => {
  const {
    app,
    credentials: { host: baseHost, database, port, password, username }
  } = appConnection;

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
      ...getConnectionConfig(appConnection)
    }
  });

  return client;
};

export const executeWithPotentialGateway = async <T>(
  config: TSqlConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  operation: (client: Knex) => Promise<T>
): Promise<T> => {
  const { credentials, app, gatewayId } = config;

  if (gatewayId && gatewayService) {
    const [targetHost] = await verifyHostInputValidity(credentials.host, true);
    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

    return withGatewayProxy(
      async (proxyPort) => {
        const client = knex({
          client: SQL_CONNECTION_CLIENT_MAP[app],
          connection: {
            database: credentials.database,
            port: proxyPort,
            host: "localhost",
            user: credentials.username,
            password: credentials.password,
            connectionTimeoutMillis: EXTERNAL_REQUEST_TIMEOUT,
            ...getConnectionConfig({ app, credentials })
          }
        });
        try {
          return await operation(client);
        } finally {
          await client.destroy();
        }
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        targetHost,
        targetPort: credentials.port,
        relayHost,
        relayPort: Number(relayPort),
        identityId: relayDetails.identityId,
        orgId: relayDetails.orgId,
        tlsOptions: {
          ca: relayDetails.certChain,
          cert: relayDetails.certificate,
          key: relayDetails.privateKey.toString()
        }
      }
    );
  }

  // Non-gateway path
  const client = await getSqlConnectionClient({ app, credentials });
  try {
    return await operation(client);
  } finally {
    await client.destroy();
  }
};

export const validateSqlConnectionCredentials = async (
  config: TSqlConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  try {
    await executeWithPotentialGateway(config, gatewayService, async (client) => {
      await client.raw(config.app === AppConnection.OracleDB ? `SELECT 1 FROM DUAL` : `Select 1`);
    });
    return config.credentials;
  } catch (error) {
    throw new BadRequestError({
      message: `Unable to validate connection: ${
        (error as Error)?.message?.replaceAll(config.credentials.password, "********************") ??
        "verify credentials"
      }`
    });
  }
};

export const SQL_CONNECTION_ALTER_LOGIN_STATEMENT: Record<
  TSqlCredentialsRotationWithConnection["connection"]["app"],
  (credentials: TSqlCredentialsRotationGeneratedCredentials[number]) => [string, Knex.RawBinding]
> = {
  [AppConnection.Postgres]: ({ username, password }) => [`ALTER USER ?? WITH PASSWORD '${password}';`, [username]],
  [AppConnection.MsSql]: ({ username, password }) => [`ALTER LOGIN ?? WITH PASSWORD = '${password}';`, [username]],
  [AppConnection.MySql]: ({ username, password }) => [`ALTER USER ??@'%' IDENTIFIED BY '${password}';`, [username]],
  [AppConnection.OracleDB]: ({ username, password }) => [`ALTER USER ?? IDENTIFIED BY "${password}"`, [username]]
};

export const transferSqlConnectionCredentialsToPlatform = async (
  config: TSqlConnectionConfig,
  callback: (credentials: TSqlConnectionConfig["credentials"]) => Promise<TAppConnectionRaw>,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  const { credentials, app } = config;

  const newPassword = alphaNumericNanoId(32);

  try {
    return await executeWithPotentialGateway(config, gatewayService, (client) => {
      return client.transaction(async (tx) => {
        await tx.raw(
          ...SQL_CONNECTION_ALTER_LOGIN_STATEMENT[app]({ username: credentials.username, password: newPassword })
        );
        return callback({
          ...credentials,
          password: newPassword
        });
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
  }
};
