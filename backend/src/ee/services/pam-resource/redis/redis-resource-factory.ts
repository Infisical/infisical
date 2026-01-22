import { Redis } from "ioredis";
import tls, { PeerCertificate } from "tls";

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

export interface RedisResourceConnection {
  /**
   * Validate the connection and optionally authenticate with credentials.
   * If credentials are provided, authenticates with them. Otherwise, just validates the connection.
   *
   * @param credentials optional username and password to authenticate with
   * @returns Promise to be resolved when the connection is good (and authenticated if credentials provided), otherwise an error will be errbacked
   */
  validate: (credentials?: TRedisAccountCredentials) => Promise<void>;

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
  }
): RedisResourceConnection => {
  const { connectionDetails } = config;
  const { sslEnabled, sslRejectUnauthorized, sslCertificate } = connectionDetails;

  let client: Redis | null = null;

  const createClient = () => {
    // TODO: this ioredis client is too complex for our use case here.
    //       ideally we should use a simpler client. but that's what we are using already so..
    const redis = new Redis({
      host: "localhost",
      port: proxyPort,
      connectTimeout: EXTERNAL_REQUEST_TIMEOUT,
      commandTimeout: EXTERNAL_REQUEST_TIMEOUT,
      ...(sslEnabled && {
        tls: {
          rejectUnauthorized: sslRejectUnauthorized,
          ca: sslCertificate,
          // When using proxy, we need to bypass hostname validation since we connect to localhost
          // but validate the certificate against the actual hostname
          checkServerIdentity: (hostname: string, cert: PeerCertificate) => {
            return tls.checkServerIdentity(connectionDetails.host, cert);
          }
        }
      }),
      maxRetriesPerRequest: 0,
      enableReadyCheck: false,
      reconnectOnError: () => false,
      retryStrategy: () => {
        return null;
      }
    });
    return new Promise<Redis>((resolve, reject) => {
      redis.once("connect", () => {
        redis.removeAllListeners("error");
        resolve(redis);
      });
      redis.once("error", (error) => {
        redis.removeAllListeners("connect");
        reject(error);
      });
    });
  };

  return {
    validate: async (credentials?) => {
      const isConnectOnly = !credentials || !credentials.username || !credentials.password;

      try {
        client = await createClient();

        if (credentials && credentials.username && credentials.password) {
          // Authenticate with provided credentials
          const result = await client.auth(credentials.username, credentials.password);
          if (result !== "OK") {
            throw new BadRequestError({
              message: `Authentication failed: Redis returned ${result as string} status`
            });
          }
        } else {
          // Just validate connection with ping
          await client.ping();
        }
      } catch (error) {
        if (isConnectOnly) {
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

        if (error instanceof BadRequestError) {
          throw error;
        }

        const errorMessage = isConnectOnly
          ? `Unable to validate Redis connection: ${(error as Error).message || String(error)}`
          : `Unable to authenticate Redis connection: ${(error as Error).message || String(error)}`;

        throw new BadRequestError({
          message: errorMessage
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
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (connection: RedisResourceConnection) => Promise<T>
): Promise<T> => {
  const { connectionDetails, gatewayId } = config;
  const [targetHost] = await verifyHostInputValidity({
    host: connectionDetails.host,
    isGateway: true,
    isDynamicSecret: false
  });
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
        await client.validate();
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
    // Skip validation if credentials are not provided
    if (!credentials.username && !credentials.password) {
      return credentials;
    }

    // If either username or password is provided, both are required for validation
    if (!credentials.username || !credentials.password) {
      throw new BadRequestError({
        message: "Both username and password are required for credential validation"
      });
    }

    // TypeScript narrowing: at this point both username and password are defined
    const validatedCredentials = {
      username: credentials.username,
      password: credentials.password
    };

    try {
      if (!gatewayId) {
        throw new BadRequestError({ message: "Gateway ID is required" });
      }

      await executeWithGateway(
        {
          connectionDetails,
          gatewayId
        },
        gatewayV2Service,
        async (client) => {
          await client.validate(validatedCredentials);
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
