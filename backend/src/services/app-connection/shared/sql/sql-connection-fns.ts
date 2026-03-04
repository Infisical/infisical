import fs from "fs";
import knex, { Knex } from "knex";
import oracledb from "oracledb";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import {
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/shared/sql-credentials/sql-credentials-rotation-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
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
              cryptoCredentialsDetails: sslCertificate ? { ca: sslCertificate } : {},
              servername: host
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
              serverName: host
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

// if TNS_ADMIN is set and the directory exists, we assume it's a wallet connection for OracleDB
const isOracleWalletConnection = (app: AppConnection): boolean => {
  const { TNS_ADMIN } = getConfig();

  return app === AppConnection.OracleDB && !!TNS_ADMIN && fs.existsSync(TNS_ADMIN);
};

const getOracleWalletKnexClient = (
  credentials: Pick<TSqlConnection["credentials"], "username" | "password" | "database">
): Knex => {
  if (oracledb.thin) {
    try {
      oracledb.initOracleClient();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new BadRequestError({
        message: `Failed to initialize Oracle client: ${errorMessage}. See documentation for instructions: https://infisical.com/docs/integrations/app-connections/oracledb#mutual-tls-wallet`
      });
    }
  }
  return knex({
    client: SQL_CONNECTION_CLIENT_MAP[AppConnection.OracleDB],
    connection: {
      user: credentials.username,
      password: credentials.password,
      connectString: credentials.database
    }
  });
};

export const getSqlConnectionClient = async (appConnection: Pick<TSqlConnection, "credentials" | "app">) => {
  const {
    app,
    credentials: { host: baseHost, database, port, password, username }
  } = appConnection;

  if (isOracleWalletConnection(app)) {
    return getOracleWalletKnexClient({ username, password, database });
  }

  const [host] = await verifyHostInputValidity({ host: baseHost, isDynamicSecret: false });

  const client = knex({
    client: SQL_CONNECTION_CLIENT_MAP[app],
    connection: {
      database,
      port,
      host: app === AppConnection.Postgres ? host : baseHost,
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
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (client: Knex) => Promise<T>
): Promise<T> => {
  const { credentials, app, gatewayId } = config;

  if (gatewayId && gatewayService && gatewayV2Service) {
    const [targetHost] = await verifyHostInputValidity({
      host: credentials.host,
      isGateway: true,
      isDynamicSecret: false
    });
    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost,
      targetPort: credentials.port
    });

    const createClient = (proxyPort: number): Knex => {
      const { database, username, password } = credentials;
      if (isOracleWalletConnection(app)) {
        return getOracleWalletKnexClient({ username, password, database });
      }

      return knex({
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
    };

    if (platformConnectionDetails) {
      return withGatewayV2Proxy(
        async (proxyPort) => {
          const client = createClient(proxyPort);
          try {
            return await operation(client);
          } finally {
            await client.destroy();
          }
        },
        {
          protocol: GatewayProxyProtocol.Tcp,
          relayHost: platformConnectionDetails.relayHost,
          gateway: platformConnectionDetails.gateway,
          relay: platformConnectionDetails.relay
        }
      );
    }

    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);

    return withGatewayProxy(
      async (proxyPort) => {
        const client = createClient(proxyPort);
        try {
          return await operation(client);
        } finally {
          await client.destroy();
        }
      },
      {
        relayDetails,
        protocol: GatewayProxyProtocol.Tcp,
        targetHost: app === AppConnection.Postgres ? targetHost : credentials.host,
        targetPort: credentials.port
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
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await executeWithPotentialGateway(config, gatewayService, gatewayV2Service, async (client) => {
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
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { credentials, app } = config;

  const newPassword = alphaNumericNanoId(32);

  try {
    return await executeWithPotentialGateway(config, gatewayService, gatewayV2Service, (client) => {
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
