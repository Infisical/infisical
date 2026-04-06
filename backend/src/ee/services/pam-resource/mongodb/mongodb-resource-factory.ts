import dns from "dns";
import { MongoClient, MongoServerError } from "mongodb";
import tls, { PeerCertificate } from "tls";
import { promisify } from "util";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials,
  TPamResourceInternalMetadata
} from "../pam-resource-types";
import { TMongoDBAccountCredentials, TMongoDBResourceConnectionDetails } from "./mongodb-resource-types";

const resolveSrv = promisify(dns.resolveSrv);

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const TEST_CONNECTION_USERNAME = "infisical-gateway-connection-test";

// MongoDB error code 18 = AuthenticationFailed
const MONGO_AUTH_FAILED_CODE = 18;

export interface MongoDBResourceConnection {
  validate: (connectOnly: boolean) => Promise<void>;
  rotateCredentials: (
    currentCredentials: TMongoDBAccountCredentials,
    newPassword: string
  ) => Promise<TMongoDBAccountCredentials>;
  close: () => Promise<void>;
}

const makeMongoDBConnection = (
  proxyPort: number,
  config: {
    connectionDetails: TMongoDBResourceConnectionDetails;
    username?: string;
    password?: string;
  }
): MongoDBResourceConnection => {
  const { connectionDetails, username, password } = config;
  const { host, sslEnabled, sslRejectUnauthorized, sslCertificate } = connectionDetails;
  const actualUsername = username ?? TEST_CONNECTION_USERNAME;
  const actualPassword = password ?? "";

  const isTestConnection = actualUsername === TEST_CONNECTION_USERNAME;
  const authPart = isTestConnection
    ? ""
    : `${encodeURIComponent(actualUsername)}:${encodeURIComponent(actualPassword)}@`;

  const encodedDatabase = encodeURIComponent(connectionDetails.database);

  // Determine authSource: extract from host URI if present, otherwise default to "admin"
  // (most MongoDB deployments authenticate users against the admin database).
  let authSource = "admin";
  if (host.startsWith("mongodb://") || host.startsWith("mongodb+srv://")) {
    try {
      const parsed = new URL(host);
      const uriAuthSource = parsed.searchParams.get("authSource");
      if (uriAuthSource) {
        authSource = uriAuthSource;
      }
    } catch {
      // Invalid URI — fall through to default
    }
  }

  const uri = `mongodb://${authPart}localhost:${proxyPort}/${encodedDatabase}?authSource=${encodeURIComponent(authSource)}&directConnection=true&serverSelectionTimeoutMS=${EXTERNAL_REQUEST_TIMEOUT}&connectTimeoutMS=${EXTERNAL_REQUEST_TIMEOUT}`;

  const mongoClient = new MongoClient(uri, {
    ...(sslEnabled && {
      tls: true,
      tlsAllowInvalidCertificates: !sslRejectUnauthorized,
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
        if (connectOnly && error instanceof MongoServerError && error.code === MONGO_AUTH_FAILED_CODE) {
          return;
        }
        throw new BadRequestError({
          message: `Unable to validate connection to MongoDB: ${(error as Error).message || String(error)}`
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
};

/**
 * For MongoDB SRV connections, resolve the SRV record to discover the actual host and port.
 * Used for relay routing — the relay needs a concrete host:port for the TCP tunnel.
 */
const resolveMongoSrvHost = async (host: string): Promise<{ host: string; port: number }> => {
  const records = await resolveSrv(`_mongodb._tcp.${host}`);
  if (records.length > 0) {
    return { host: records[0].name, port: records[0].port };
  }
  throw new BadRequestError({
    message: `Unable to resolve SRV record for MongoDB host "${host}". Ensure the host is a valid SRV domain, or provide a port for direct connections.`
  });
};

/**
 * Parse the MongoDB host field to extract the hostname and port for relay routing.
 * The host field can be:
 * - A full URI: mongodb+srv://cluster.abc.net/mydb?authSource=admin
 * - A full URI: mongodb://host:27017/mydb
 * - A bare SRV hostname: cluster.abc.net
 * - A host:port: host:27017
 * - A replica set: h1:p1,h2:p2
 */
const parseMongoHostForRelay = (host: string): { hostname: string; port?: number; isSRV: boolean } => {
  // Full URI — parse hostname from it
  if (host.startsWith("mongodb+srv://")) {
    const parsed = new URL(host);
    return { hostname: parsed.hostname, isSRV: true };
  }
  if (host.startsWith("mongodb://")) {
    const parsed = new URL(host);
    const parsedPort = parsed.port ? parseInt(parsed.port, 10) : undefined;
    return { hostname: parsed.hostname, port: parsedPort, isSRV: false };
  }

  // Plain host spec
  if (!host.includes(":") && !host.includes(",")) {
    // Bare hostname — SRV
    return { hostname: host, isSRV: true };
  }

  // host:port or h1:p1,h2:p2 — take first host for relay routing
  const firstHost = host.split(",")[0];
  const [hostname, portStr] = firstHost.split(":");
  return { hostname, port: parseInt(portStr, 10) || 27017, isSRV: false };
};

const executeWithGateway = async <T>(
  config: {
    connectionDetails: TMongoDBResourceConnectionDetails;
    gatewayId: string;
    username?: string;
    password?: string;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (connection: MongoDBResourceConnection) => Promise<T>
): Promise<T> => {
  const { connectionDetails, gatewayId } = config;

  // Parse the host field to extract hostname/port for relay routing.
  // The host can be a plain hostname, host:port, or a full MongoDB URI.
  const parsed = parseMongoHostForRelay(connectionDetails.host);

  let resolvedHost = parsed.hostname;
  let resolvedPort: number = parsed.port ?? 0;

  // For SRV hosts, resolve to a concrete host:port for the relay tunnel
  if (parsed.isSRV) {
    const resolved = await resolveMongoSrvHost(parsed.hostname);
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

  // For SRV, override the host in connection details so TLS servername matches the resolved host
  const effectiveConfig =
    resolvedHost !== parsed.hostname
      ? { ...config, connectionDetails: { ...connectionDetails, host: resolvedHost } }
      : config;

  return withGatewayV2Proxy(
    async (proxyPort) => {
      const connection = makeMongoDBConnection(proxyPort, effectiveConfig);
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

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TMongoDBAccountCredentials> = async (
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
        if (error.message.includes("Authentication failed") || error.message.includes("SCRAM")) {
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

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<TMongoDBAccountCredentials> = async (
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
          username: rotationAccountCredentials.username,
          password: rotationAccountCredentials.password
        },
        gatewayV2Service,
        (client) => client.rotateCredentials(currentCredentials, newPassword)
      );
    } catch (error) {
      const sanitizedErrorMessage = ((error as Error).message || String(error)).replaceAll(newPassword, "REDACTED");

      throw new BadRequestError({
        message: `Unable to rotate account credentials for ${resourceType}: ${sanitizedErrorMessage}`
      });
    }
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
