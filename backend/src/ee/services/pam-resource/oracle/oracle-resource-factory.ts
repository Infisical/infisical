import oracledb from "oracledb";

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
import { probeOracleTls } from "./oracle-resource-fns";
import { TOracleAccountCredentials, TOracleResourceConnectionDetails } from "./oracle-resource-types";

const ORACLE_CONNECT_TIMEOUT_SECONDS = 30;
const TEST_CONNECTION_USERNAME = "infisical-gateway-connection-test";
const TEST_CONNECTION_PASSWORD = "infisical-gateway-connection-test-password";

interface OracleResourceConnection {
  validate: (connectOnly: boolean) => Promise<void>;
  rotateCredentials: () => Promise<never>;
  close: () => Promise<void>;
}

const makeOracleConnection = (
  proxyPort: number,
  config: {
    connectionDetails: TOracleResourceConnectionDetails;
    username?: string;
    password?: string;
  }
): OracleResourceConnection => {
  const { connectionDetails } = config;
  const { host, sslEnabled, sslRejectUnauthorized, sslCertificate } = connectionDetails;
  const actualUsername = config.username ?? TEST_CONNECTION_USERNAME;
  const actualPassword = config.password ?? TEST_CONNECTION_PASSWORD;

  const connectString = sslEnabled
    ? `tcps://localhost:${proxyPort}/${connectionDetails.database}?ssl_server_dn_match=false`
    : `localhost:${proxyPort}/${connectionDetails.database}`;

  const openConnection = () =>
    oracledb.getConnection({
      user: actualUsername,
      password: actualPassword,
      connectString,
      connectTimeout: ORACLE_CONNECT_TIMEOUT_SECONDS,
      transportConnectTimeout: ORACLE_CONNECT_TIMEOUT_SECONDS
    });

  return {
    validate: async (connectOnly) => {
      // Probe TLS first to validate hostname + cert chain. The tcps:// connect
      // string uses ssl_server_dn_match=false (required because we connect via
      // localhost proxy), so this probe is the hostname validation layer.
      if (sslEnabled) {
        try {
          await probeOracleTls({
            tcpHost: "localhost",
            port: proxyPort,
            servername: host,
            caPem: sslCertificate,
            rejectUnauthorized: sslRejectUnauthorized
          });
        } catch (error) {
          throw new BadRequestError({
            message: `Unable to validate connection to Oracle: ${(error as Error).message || String(error)}`
          });
        }
      }

      let conn: oracledb.Connection | null = null;
      try {
        conn = await openConnection();
        await conn.execute("SELECT 1 FROM DUAL");
      } catch (error) {
        if (error instanceof Error) {
          const msg = error.message || "";
          if (connectOnly && msg.includes("ORA-")) {
            return;
          }
        }
        // Probe passed so the cert is valid — tcps:// failure is likely because
        // the custom CA isn't in the system trust store. Save anyway; creds
        // will be checked on first PAM session.
        if (sslEnabled && sslCertificate) {
          return;
        }
        throw new BadRequestError({
          message: `Unable to validate connection to Oracle: ${(error as Error).message || String(error)}`
        });
      } finally {
        if (conn) {
          await conn.close().catch(() => undefined);
        }
      }
    },
    rotateCredentials: async () => {
      throw new BadRequestError({ message: "Credential rotation is not yet supported for Oracle resources" });
    },
    close: async () => {}
  };
};

const executeWithGateway = async <T>(
  config: {
    connectionDetails: TOracleResourceConnectionDetails;
    gatewayId: string;
    username?: string;
    password?: string;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (connection: OracleResourceConnection) => Promise<T>
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
      const connection = makeOracleConnection(proxyPort, config);
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

export const oracleResourceFactory: TPamResourceFactory<
  TOracleResourceConnectionDetails,
  TOracleAccountCredentials,
  TPamResourceInternalMetadata
> = (_resourceType, connectionDetails, gatewayId, gatewayV2Service) => {
  const validateConnection = async () => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    await executeWithGateway({ connectionDetails, gatewayId }, gatewayV2Service, async (client) => {
      await client.validate(true);
    });
    return connectionDetails;
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TOracleAccountCredentials> = async (
    credentials
  ) => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    try {
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
      if (error instanceof BadRequestError && error.message.includes("ORA-01017")) {
        throw new BadRequestError({
          message: "Account credentials invalid: Username or password incorrect"
        });
      }
      throw error;
    }
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<TOracleAccountCredentials> = async () => {
    throw new BadRequestError({ message: "Credential rotation is not yet supported for Oracle resources" });
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TOracleAccountCredentials,
    currentCredentials: TOracleAccountCredentials
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
