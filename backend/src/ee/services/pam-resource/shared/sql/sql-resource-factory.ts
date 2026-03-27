import dns from "dns";
import knex from "knex";
import { MongoClient } from "mongodb";
import mysql, { Connection } from "mysql2/promise";
import tls, { PeerCertificate } from "tls";
import { promisify } from "util";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { PamResource } from "../../pam-resource-enums";
import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials,
  TPamResourceInternalMetadata
} from "../../pam-resource-types";
import { TSqlAccountCredentials, TSqlResourceConnectionDetails } from "./sql-resource-types";

const resolveSrv = promisify(dns.resolveSrv);

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const TEST_CONNECTION_USERNAME = "infisical-gateway-connection-test";
const TEST_CONNECTION_PASSWORD = "infisical-gateway-connection-test-password";
const SIMPLE_QUERY = "select 1";

export interface SqlResourceConnection {
  /**
   * Check and see if the connection is good or not.
   *
   * @param connectOnly when true, if we only want to know that making the connection is possible or not,
   *                    we don't care about authentication failures
   * @returns Promise to be resolved when the connection is good, otherwise an error will be errbacked
   */
  validate: (connectOnly: boolean) => Promise<void>;

  /**
   * Rotate password and return the new credentials.
   *
   * @param currentCredentials the current credentials to rotate
   *
   * @returns Promise to be resolved with the new credentials
   */
  rotateCredentials: (
    currentCredentials: TSqlAccountCredentials,
    newPassword: string
  ) => Promise<TSqlAccountCredentials>;

  /**
   * Close the connection.
   *
   * @returns Promise for closing the connection
   */
  close: () => Promise<void>;
}

const makeSqlConnection = (
  proxyPort: number,
  config: {
    connectionDetails: TSqlResourceConnectionDetails;
    resourceType: PamResource;
    username?: string;
    password?: string;
  }
): SqlResourceConnection => {
  const { connectionDetails, resourceType, username, password } = config;
  const { host, sslEnabled, sslRejectUnauthorized, sslCertificate } = connectionDetails;
  const actualUsername = username ?? TEST_CONNECTION_USERNAME; // Use provided username or fallback
  const actualPassword = password ?? TEST_CONNECTION_PASSWORD; // Use provided password or fallback
  switch (config.resourceType) {
    case PamResource.Postgres: {
      const client = knex({
        client: "pg",
        connection: {
          host: "localhost",
          port: proxyPort,
          user: actualUsername,
          password: actualPassword,
          database: connectionDetails.database,
          connectionTimeoutMillis: EXTERNAL_REQUEST_TIMEOUT,
          ssl: sslEnabled
            ? {
                rejectUnauthorized: sslRejectUnauthorized,
                ca: sslCertificate,
                servername: host,
                // When using proxy, we need to bypass hostname validation since we connect to localhost
                // but validate the certificate against the actual hostname
                checkServerIdentity: (hostname: string, cert: PeerCertificate) => {
                  return tls.checkServerIdentity(host, cert);
                }
              }
            : false
        }
      });
      return {
        validate: async (connectOnly) => {
          try {
            await client.raw(SIMPLE_QUERY);
          } catch (error) {
            if (error instanceof Error) {
              // Hacky way to know if we successfully hit the database.
              // TODO: potentially two approaches to solve the problem.
              //       1. change the work flow, add account first then resource
              //       2. modify relay to add a new endpoint for returning if the target host is healthy or not
              //          (like being able to do an auth handshake regardless pass or not)
              if (
                connectOnly &&
                (error.message === `password authentication failed for user "${TEST_CONNECTION_USERNAME}"` ||
                  error.message === `role "${TEST_CONNECTION_USERNAME}" does not exist`)
              ) {
                return;
              }
            }
            throw new BadRequestError({
              message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
            });
          }
        },
        rotateCredentials: async (currentCredentials, newPassword) => {
          // Note: The generated random password is not really going to make SQL Injection possible.
          //       The reason we are not using parameters binding is that the "ALTER USER" syntax is DDL,
          //       parameters binding is not supported. But just in case if the this code got copied
          //       around and repurposed, let's just do some naive escaping regardless
          await client.raw(`ALTER USER :username: WITH PASSWORD '${newPassword.replace(/'/g, "''")}'`, {
            username: currentCredentials.username
          });
          return { username: currentCredentials.username, password: newPassword };
        },
        close: () => client.destroy()
      };
    }
    case PamResource.MySQL: {
      return {
        validate: async (connectOnly) => {
          let client: Connection | null = null;
          try {
            // Notice: the reason we are not using Knex for mysql2 is because we don't need any fancy feature from Knex.
            //         mysql2 doesn't provide custom ssl verification function pass in.
            //         ref: https://github.com/sidorares/node-mysql2/blob/2543272a2ada8d8a07f74582549d7dd3fe948e2d/lib/base/connection.js#L358-L362
            //         and then even I tried to workaround it with Knex's pool afterCreate hook, but then encounter a bug:
            //         ref: https://github.com/knex/knex/issues/5352
            //         It appears that using Knex causing more troubles than not, we are just checking the connections,
            //         so it's much easier to create raw connection with the driver lib directly
            client = await mysql.createConnection({
              host: "localhost",
              port: proxyPort,
              user: actualUsername, // Use provided username or fallback
              password: actualPassword, // Use provided password or fallback
              database: connectionDetails.database,
              ssl: sslEnabled
                ? {
                    rejectUnauthorized: sslRejectUnauthorized,
                    ca: sslCertificate
                  }
                : undefined
            });
            await client.query(SIMPLE_QUERY);
          } catch (error) {
            if (connectOnly) {
              // Hacky way to know if we successfully hit the database.
              if (
                error instanceof Error &&
                error.message.startsWith(`Access denied for user '${TEST_CONNECTION_USERNAME}'@`)
              ) {
                return;
              }
            }
            // TODO: handle other errors, and throw standardlized errors providing user-friendly msg
            throw error;
          } finally {
            await client?.end();
          }
        },
        rotateCredentials: async () => {
          // TODO: the pwd rotation for MySQL is not supported yet
          throw new BadRequestError({
            message: "Unsupported operation"
          });
        },
        close: async () => {}
      };
    }
    case PamResource.MsSQL: {
      // For MSSQL through a gateway proxy:
      // - TCP connects to localhost:proxyPort, gateway forwards to real server
      // - TLS certificate is issued for the real hostname, not localhost
      // - The tedious driver doesn't support custom checkServerIdentity
      // - We must use serverName option to tell tedious to validate against the real host
      const mssqlOptions = sslEnabled
        ? {
            encrypt: true,
            trustServerCertificate: !sslRejectUnauthorized,
            cryptoCredentialsDetails: sslCertificate ? { ca: sslCertificate } : {},
            // serverName tells tedious to use this hostname for TLS SNI and certificate validation
            // instead of the server/host value used for the TCP connection
            serverName: host
          }
        : { encrypt: false };

      const client = knex({
        client: "mssql",
        connection: {
          server: "localhost",
          port: proxyPort,
          user: actualUsername,
          password: actualPassword,
          database: connectionDetails.database,
          requestTimeout: EXTERNAL_REQUEST_TIMEOUT,
          // mssqlOptions is passed to tedious driver
          // ref: https://github.com/knex/knex/blob/b6507a7129d2b9fafebf5f831494431e64c6a8a0/lib/dialects/mssql/index.js#L66
          options: mssqlOptions
        }
      });
      return {
        validate: async (connectOnly) => {
          try {
            await client.raw(SIMPLE_QUERY);
          } catch (error) {
            if (error instanceof Error) {
              // Check for authentication failure - MSSQL returns error code 18456 for login failures
              if (
                connectOnly &&
                (error.message.includes("Login failed for user") || error.message.includes("ELOGIN"))
              ) {
                return;
              }
            }
            throw new BadRequestError({
              message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
            });
          }
        },
        rotateCredentials: async () => {
          // Password rotation for MSSQL is not supported yet
          throw new BadRequestError({
            message: "Unsupported operation"
          });
        },
        close: () => client.destroy()
      };
    }
    case PamResource.MongoDB: {
      const isTestConnection = actualUsername === TEST_CONNECTION_USERNAME;
      const authPart = isTestConnection
        ? ""
        : `${encodeURIComponent(actualUsername)}:${encodeURIComponent(actualPassword)}@`;

      const encodedDatabase = encodeURIComponent(connectionDetails.database);
      const uri = `mongodb://${authPart}localhost:${proxyPort}/${encodedDatabase}?authSource=${encodedDatabase}&directConnection=true&serverSelectionTimeoutMS=${EXTERNAL_REQUEST_TIMEOUT}&connectTimeoutMS=${EXTERNAL_REQUEST_TIMEOUT}`;

      const mongoClient = new MongoClient(uri, {
        ...(sslEnabled && {
          tls: true,
          tlsAllowInvalidCertificates: !sslRejectUnauthorized,
          // Override servername for SNI since we connect to localhost via proxy
          // but need the real hostname for TLS negotiation
          servername: host,
          checkServerIdentity: (hostname: string, cert: PeerCertificate) => {
            return tls.checkServerIdentity(host, cert);
          }
        }),
        ...(sslEnabled && sslCertificate && { ca: sslCertificate })
      });

      return {
        validate: async (connectOnly) => {
          try {
            await mongoClient.connect();
            await mongoClient.db(connectionDetails.database).command({ ping: 1 });
          } catch (error) {
            if (
              connectOnly &&
              error instanceof Error &&
              (error.message.includes("Authentication failed") ||
                error.message.includes("auth") ||
                error.message.includes("SCRAM") ||
                error.message.includes("unauthorized"))
            ) {
              return;
            }
            throw new BadRequestError({
              message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
            });
          }
        },
        rotateCredentials: async () => {
          throw new BadRequestError({
            message: "Credential rotation is not yet supported for MongoDB resources"
          });
        },
        close: async () => {
          await mongoClient.close();
        }
      };
    }
    default:
      throw new BadRequestError({
        message: `Unhandled SQL Resource Connection Config: ${resourceType as PamResource}`
      });
  }
};

/**
 * For MongoDB SRV connections (e.g. mongodb+srv:// hosts), the user-provided host
 * is an SRV base domain that doesn't resolve as an A record. We need to do an SRV
 * lookup to discover the actual host and port.
 */
const resolveMongoSrvHost = async (host: string, port: number): Promise<{ host: string; port: number }> => {
  try {
    const records = await resolveSrv(`_mongodb._tcp.${host}`);
    if (records.length > 0) {
      return { host: records[0].name, port: records[0].port };
    }
  } catch {
    // SRV lookup failed — host is likely a direct hostname, use as-is
  }
  return { host, port };
};

export const executeWithGateway = async <T>(
  config: {
    connectionDetails: TSqlResourceConnectionDetails;
    resourceType: PamResource;
    gatewayId: string;
    username?: string;
    password?: string;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (connection: SqlResourceConnection) => Promise<T>
): Promise<T> => {
  const { connectionDetails, gatewayId } = config;

  // For MongoDB, resolve SRV records to get the actual host and port
  let resolvedHost = connectionDetails.host;
  let resolvedPort = connectionDetails.port;
  if (config.resourceType === PamResource.MongoDB) {
    const resolved = await resolveMongoSrvHost(connectionDetails.host, connectionDetails.port);
    resolvedHost = resolved.host;
    resolvedPort = resolved.port;
  }

  const [targetHost] = await verifyHostInputValidity({
    host: resolvedHost,
    isGateway: true,
    isDynamicSecret: false
  });
  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort: resolvedPort
  });

  if (!platformConnectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }

  // For MongoDB SRV, override the host in connection details so TLS servername matches the resolved host
  const effectiveConfig =
    config.resourceType === PamResource.MongoDB && resolvedHost !== connectionDetails.host
      ? { ...config, connectionDetails: { ...connectionDetails, host: resolvedHost, port: resolvedPort } }
      : config;

  return withGatewayV2Proxy(
    async (proxyPort) => {
      const connection = makeSqlConnection(proxyPort, effectiveConfig);
      try {
        return await operation(connection);
      } finally {
        await connection.close();
      }
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      relayHost: platformConnectionDetails.relayHost,
      gateway: platformConnectionDetails.gateway,
      relay: platformConnectionDetails.relay
    }
  );
};

export const sqlResourceFactory: TPamResourceFactory<
  TSqlResourceConnectionDetails,
  TSqlAccountCredentials,
  TPamResourceInternalMetadata
> = (resourceType, connectionDetails, gatewayId, gatewayV2Service) => {
  const validateConnection = async () => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    try {
      await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (client) => {
        await client.validate(true);
      });
      return connectionDetails;
    } catch (error) {
      if (error instanceof BadRequestError && error.message === "Connection terminated unexpectedly") {
        throw new BadRequestError({
          message: "Connection terminated unexpectedly. Verify that host and port are correct"
        });
      }

      throw new BadRequestError({
        message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TSqlAccountCredentials> = async (
    credentials
  ) => {
    try {
      if (!gatewayId) {
        throw new BadRequestError({ message: "Gateway ID is required" });
      }

      await executeWithGateway(
        {
          connectionDetails,
          gatewayId,
          resourceType,
          username: credentials.username,
          password: credentials.password
        },
        gatewayV2Service,
        async (client) => {
          await client.validate(false);
        }
      );
      return credentials;
    } catch (error) {
      // TODO: extract these logic into each SQL connection
      if (error instanceof BadRequestError) {
        if (
          error.message === `password authentication failed for user "${credentials.username}"` ||
          error.message === `role "${credentials.username}" does not exist` ||
          error.message.includes("Authentication failed") ||
          error.message.includes("SCRAM")
        ) {
          throw new BadRequestError({
            message: "Account credentials invalid: Username or password incorrect"
          });
        }

        if (error.message === "Connection terminated unexpectedly") {
          throw new BadRequestError({
            message: "Connection terminated unexpectedly. Verify that host and port are correct"
          });
        }
      }

      throw new BadRequestError({
        message: `Unable to validate account credentials for ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<TSqlAccountCredentials> = async (
    rotationAccountCredentials,
    currentCredentials
  ) => {
    const newPassword = alphaNumericNanoId(32);
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    try {
      return await executeWithGateway(
        {
          connectionDetails,
          gatewayId,
          resourceType,
          username: rotationAccountCredentials.username,
          password: rotationAccountCredentials.password
        },
        gatewayV2Service,
        (client) => client.rotateCredentials(currentCredentials, newPassword)
      );
    } catch (error) {
      if (error instanceof BadRequestError) {
        if (
          error.message === `password authentication failed for user "${rotationAccountCredentials.username}"` ||
          error.message === `role "${rotationAccountCredentials.username}" does not exist`
        ) {
          throw new BadRequestError({
            message: "Management credentials invalid: Username or password incorrect"
          });
        }

        if (error.message.includes("permission denied")) {
          throw new BadRequestError({
            message: `Management credentials lack permission to rotate password for user "${currentCredentials.username}"`
          });
        }

        if (error.message === "Connection terminated unexpectedly") {
          throw new BadRequestError({
            message: "Connection terminated unexpectedly. Verify that host and port are correct"
          });
        }
      }

      const sanitizedErrorMessage = ((error as Error).message || String(error)).replaceAll(newPassword, "REDACTED");

      throw new BadRequestError({
        message: `Unable to rotate account credentials for ${resourceType}: ${sanitizedErrorMessage}`
      });
    }
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TSqlAccountCredentials,
    currentCredentials: TSqlAccountCredentials
  ) => {
    if (updatedAccountCredentials.password === "__INFISICAL_UNCHANGED__") {
      return {
        ...updatedAccountCredentials,
        password: currentCredentials.password
      };
    }

    return updatedAccountCredentials;
  };

  return {
    validateConnection,
    validateAccountCredentials,
    rotateAccountCredentials,
    handleOverwritePreventionForCensoredValues
  };
};
