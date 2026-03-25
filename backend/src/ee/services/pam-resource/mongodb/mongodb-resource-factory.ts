import { MongoClient } from "mongodb";
import tls, { PeerCertificate } from "tls";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";

import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials,
  TPamResourceInternalMetadata
} from "../pam-resource-types";
import { TMongoDBAccountCredentials, TMongoDBResourceConnectionDetails } from "./mongodb-resource-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

export interface MongoDBResourceConnection {
  validate: (credentials?: TMongoDBAccountCredentials) => Promise<void>;
  close: () => Promise<void>;
}

const makeMongoDBConnection = (
  proxyPort: number,
  config: {
    connectionDetails: TMongoDBResourceConnectionDetails;
  }
): MongoDBResourceConnection => {
  const { connectionDetails } = config;
  const { sslEnabled, sslRejectUnauthorized, sslCertificate } = connectionDetails;

  let client: MongoClient | null = null;

  return {
    validate: async (credentials?) => {
      const username = credentials?.username;
      const password = credentials?.password;

      const authPart = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";

      const uri = `mongodb://${authPart}localhost:${proxyPort}/${connectionDetails.database}?authSource=admin&directConnection=true&serverSelectionTimeoutMS=${EXTERNAL_REQUEST_TIMEOUT}&connectTimeoutMS=${EXTERNAL_REQUEST_TIMEOUT}`;

      try {
        client = new MongoClient(uri, {
          ...(sslEnabled && {
            tls: true,
            tlsAllowInvalidCertificates: !sslRejectUnauthorized,
            ...(sslCertificate && { tlsCAFile: undefined }),
            // Custom TLS options for proxy hostname validation
            tlsInsecure: !sslRejectUnauthorized,
            checkServerIdentity: (hostname: string, cert: PeerCertificate) => {
              return tls.checkServerIdentity(connectionDetails.host, cert);
            }
          }),
          ...(sslEnabled &&
            sslCertificate && {
              ca: sslCertificate
            })
        });

        await client.connect();
        await client.db("admin").command({ ping: 1 });
      } catch (error) {
        if (!credentials) {
          // Connect-only mode: auth failures mean the server is reachable
          if (
            error instanceof Error &&
            (error.message.includes("Authentication failed") ||
              error.message.includes("auth") ||
              error.message.includes("SCRAM") ||
              error.message.includes("unauthorized"))
          ) {
            return;
          }
        }

        const errorMessage = credentials
          ? `Unable to authenticate MongoDB connection: ${(error as Error).message || String(error)}`
          : `Unable to validate MongoDB connection: ${(error as Error).message || String(error)}`;

        throw new BadRequestError({
          message: errorMessage
        });
      } finally {
        if (client) {
          await client.close();
          client = null;
        }
      }
    },
    close: async () => {
      if (client) {
        await client.close();
        client = null;
      }
    }
  };
};

export const executeWithGateway = async <T>(
  config: {
    connectionDetails: TMongoDBResourceConnectionDetails;
    gatewayId: string;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (connection: MongoDBResourceConnection) => Promise<T>
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
      const connection = makeMongoDBConnection(proxyPort, config);
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

export const mongodbResourceFactory: TPamResourceFactory<
  TMongoDBResourceConnectionDetails,
  TMongoDBAccountCredentials,
  TPamResourceInternalMetadata
> = (resourceType, connectionDetails, gatewayId, gatewayV2Service) => {
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

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TMongoDBAccountCredentials> = async (
    credentials
  ) => {
    if (!credentials.username || !credentials.password) {
      throw new BadRequestError({
        message: "Both username and password are required for credential validation"
      });
    }

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
          await client.validate(credentials);
        }
      );
      return credentials;
    } catch (error) {
      if (error instanceof BadRequestError) {
        if (
          error.message.includes("Authentication failed") ||
          error.message.includes("auth") ||
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

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<
    TMongoDBAccountCredentials
  > = async () => {
    throw new BadRequestError({
      message: "Unsupported operation"
    });
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TMongoDBAccountCredentials,
    currentCredentials: TMongoDBAccountCredentials
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
