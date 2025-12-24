import { Redis } from "ioredis";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";

import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials
} from "../pam-resource-types";
import { TRedisAccountCredentials, TRedisResourceConnectionDetails } from "./redis-resource-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const TEST_CONNECTION_USERNAME = "infisical-gateway-connection-test";
const TEST_CONNECTION_PASSWORD = "infisical-gateway-connection-test-password";

export interface RedisResourceConnection {
  /**
   * Check and see if the connection is good or not.
   *
   * @param connectOnly when true, if we only want to know that making the connection is possible or not,
   *                    we don't care about authentication failures
   * @returns Promise to be resolved when the connection is good, otherwise an error will be errbacked
   */
  validate: (connectOnly: boolean) => Promise<void>;

  /**
   * Close the connection.
   *
   * @returns Promise for closing the connection
   */
  close: () => Promise<void>;
}

const makeRedisConnection = (
  proxyPort: number,
  config: {
    connectionDetails: TRedisResourceConnectionDetails;
    username?: string;
    password?: string;
  }
): RedisResourceConnection => {
  const { connectionDetails, username, password } = config;
  const { sslEnabled, sslRejectUnauthorized, sslCertificate } = connectionDetails;
  const actualUsername = username ?? connectionDetails.username ?? TEST_CONNECTION_USERNAME;
  const actualPassword = password ?? connectionDetails.password ?? TEST_CONNECTION_PASSWORD;

  let client: Redis | null = null;

  const createClient = () => {
    return new Redis({
      host: "localhost",
      port: proxyPort,
      username: actualUsername,
      password: actualPassword,
      connectTimeout: EXTERNAL_REQUEST_TIMEOUT,
      commandTimeout: EXTERNAL_REQUEST_TIMEOUT,
      ...(sslEnabled && {
        tls: {
          rejectUnauthorized: sslRejectUnauthorized,
          ca: sslCertificate
        }
      }),
      retryStrategy: () => {
        return null;
      }
    });
  };

  return {
    validate: async (connectOnly) => {
      try {
        client = createClient();

        // Test authentication
        const result = await client.auth(actualUsername, actualPassword);
        if (result !== "OK") {
          throw new BadRequestError({ message: `Redis authentication failed: ${result as string}` });
        }

        // Test connection with a simple command
        await client.ping();
      } catch (error) {
        if (connectOnly) {
          // If we're only checking connection, authentication failures are acceptable
          if (
            error instanceof Error &&
            (error.message.includes("NOAUTH") ||
              error.message.includes("WRONGPASS") ||
              error.message.includes("invalid password"))
          ) {
            return;
          }
        }
        throw new BadRequestError({
          message: `Unable to validate Redis connection: ${(error as Error).message || String(error)}`
        });
      } finally {
        if (client) {
          await client.quit();
          client = null;
        }
      }
    },
    close: async () => {
      if (client) {
        await client.quit();
        client = null;
      }
    }
  };
};

export const executeWithGateway = async <T>(
  config: {
    connectionDetails: TRedisResourceConnectionDetails;
    gatewayId: string;
    username?: string;
    password?: string;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (connection: RedisResourceConnection) => Promise<T>
): Promise<T> => {
  const { connectionDetails, gatewayId } = config;
  const [targetHost] = await verifyHostInputValidity(connectionDetails.host, true);
  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort: connectionDetails.port
  });

  if (!platformConnectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }

  return withGatewayV2Proxy(
    async (proxyPort) => {
      const connection = makeRedisConnection(proxyPort, config);
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

export const redisResourceFactory: TPamResourceFactory<TRedisResourceConnectionDetails, TRedisAccountCredentials> = (
  resourceType,
  connectionDetails,
  gatewayId,
  gatewayV2Service
) => {
  const validateConnection = async () => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    try {
      await executeWithGateway({ connectionDetails, gatewayId }, gatewayV2Service, async (client) => {
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

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TRedisAccountCredentials> = async (
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
      if (error instanceof BadRequestError) {
        if (
          error.message.includes("NOAUTH") ||
          error.message.includes("WRONGPASS") ||
          error.message.includes("invalid password")
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

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<TRedisAccountCredentials> = async () => {
    // TODO: Redis password rotation is not supported yet
    throw new BadRequestError({
      message: "Unsupported operation"
    });
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TRedisAccountCredentials,
    currentCredentials: TRedisAccountCredentials
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
