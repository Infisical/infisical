import knex, { Knex } from "knex";
import tls, { PeerCertificate } from "tls";

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
  TPamResourceFactoryValidateAccountCredentials
} from "../../pam-resource-types";
import { TSqlAccountCredentials, TSqlResourceConnectionDetails } from "./sql-resource-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const TEST_CONNECTION_USERNAME = "infisical-gateway-connection-test";
const TEST_CONNECTION_PASSWORD = "infisical-gateway-connection-test-password";

const SQL_CONNECTION_CLIENT_MAP = {
  [PamResource.Postgres]: "pg"
};

const getConnectionConfig = (
  resourceType: PamResource,
  { host, sslEnabled, sslRejectUnauthorized, sslCertificate }: TSqlResourceConnectionDetails
) => {
  switch (resourceType) {
    case PamResource.Postgres: {
      return {
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
      };
    }
    default:
      throw new BadRequestError({
        message: `Unhandled SQL Resource Connection Config: ${resourceType as PamResource}`
      });
  }
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
  operation: (client: Knex) => Promise<T>
): Promise<T> => {
  const { connectionDetails, resourceType, gatewayId, username, password } = config;

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
      const client = knex({
        client: SQL_CONNECTION_CLIENT_MAP[resourceType],
        connection: {
          database: connectionDetails.database,
          port: proxyPort,
          host: "localhost",
          user: username ?? TEST_CONNECTION_USERNAME, // Use provided username or fallback
          password: password ?? TEST_CONNECTION_PASSWORD, // Use provided password or fallback
          connectionTimeoutMillis: EXTERNAL_REQUEST_TIMEOUT,
          ...getConnectionConfig(resourceType, connectionDetails)
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
      relayHost: platformConnectionDetails.relayHost,
      gateway: platformConnectionDetails.gateway,
      relay: platformConnectionDetails.relay
    }
  );
};

export const sqlResourceFactory: TPamResourceFactory<TSqlResourceConnectionDetails, TSqlAccountCredentials> = (
  resourceType,
  connectionDetails,
  gatewayId,
  gatewayV2Service
) => {
  const validateConnection = async () => {
    try {
      await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (client) => {
        await client.raw("Select 1");
      });
      return connectionDetails;
    } catch (error) {
      // Hacky way to know if we successfully hit the database
      if (error instanceof BadRequestError) {
        if (error.message === `password authentication failed for user "${TEST_CONNECTION_USERNAME}"`) {
          return connectionDetails;
        }

        if (error.message.includes("no pg_hba.conf entry for host")) {
          return connectionDetails;
        }

        if (error.message === "Connection terminated unexpectedly") {
          throw new BadRequestError({
            message: "Connection terminated unexpectedly. Verify that host and port are correct"
          });
        }
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
          await client.raw("Select 1");
        }
      );
      return credentials;
    } catch (error) {
      if (error instanceof BadRequestError) {
        if (error.message === `password authentication failed for user "${credentials.username}"`) {
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
    try {
      const newPassword = alphaNumericNanoId(32);

      await executeWithGateway(
        {
          connectionDetails,
          gatewayId,
          resourceType,
          username: rotationAccountCredentials.username,
          password: rotationAccountCredentials.password
        },
        gatewayV2Service,
        async (client) => {
          switch (resourceType) {
            case PamResource.Postgres:
              await client.raw(`ALTER USER ?? WITH PASSWORD '${newPassword}'`, [currentCredentials.username]);
              break;
            default:
              throw new BadRequestError({
                message: `Password rotation for ${resourceType as PamResource} is not supported.`
              });
          }
        }
      );

      return { username: currentCredentials.username, password: newPassword };
    } catch (error) {
      if (error instanceof BadRequestError) {
        if (error.message === `password authentication failed for user "${rotationAccountCredentials.username}"`) {
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

      throw new BadRequestError({
        message: `Unable to rotate account credentials for ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }
  };

  return {
    validateConnection,
    validateAccountCredentials,
    rotateAccountCredentials
  };
};
