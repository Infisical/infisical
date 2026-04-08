import dns from "dns";
import { MongoClient, MongoServerError } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import tls, { PeerCertificate } from "tls";
import { promisify } from "util";

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

const resolveSrv = promisify(dns.resolveSrv);

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

// MongoDB error code 18 = AuthenticationFailed
const MONGO_AUTH_FAILED_CODE = 18;

interface MongoDBResourceConnection {
  validate: (connectOnly: boolean) => Promise<void>;
  rotateCredentials: (currentCredentials: TMongoDBAccountCredentials, newPassword: string) => Promise<never>;
  close: () => Promise<void>;
}

/**
 * Parse a MongoDB connection string into its components for relay routing and connection building.
 * Expects a validated URI (mongodb:// or mongodb+srv://) — schema validation ensures this.
 */
export const parseMongoConnectionString = (connectionString: string) => {
  const cs = new ConnectionString(connectionString);
  const { isSRV } = cs;
  const authSource = cs.searchParams.get("authSource") || "admin";

  const [firstHost] = cs.hosts;
  let hostname: string;
  let port: number | undefined;

  if (isSRV) {
    // SRV hosts have no port
    hostname = firstHost;
  } else {
    const colonIdx = firstHost.lastIndexOf(":");
    if (colonIdx !== -1) {
      hostname = firstHost.slice(0, colonIdx);
      port = parseInt(firstHost.slice(colonIdx + 1), 10);
    } else {
      hostname = firstHost;
      port = 27017;
    }
  }

  return { hostname, port, isSRV, authSource };
};

/**
 * For MongoDB SRV connections, resolve the SRV record to discover the actual host and port.
 * Used for relay routing — the relay needs a concrete host:port for the TCP tunnel.
 */
const resolveMongoSrvHost = async (host: string): Promise<{ host: string; port: number }> => {
  const records = await resolveSrv(`_mongodb._tcp.${host}`);
  if (records.length > 0) {
    // Randomize record selection so retries can hit a different node if one is down
    const record = records[Math.floor(Math.random() * records.length)];
    return { host: record.name, port: record.port };
  }
  throw new BadRequestError({
    message: `Unable to resolve SRV record for MongoDB host "${host}". Ensure the host is a valid SRV domain.`
  });
};

/**
 * Build a MongoDB client connection through a local gateway proxy.
 * Receives pre-parsed connection info — no URI parsing happens here.
 */
const makeMongoDBConnection = (
  proxyPort: number,
  config: {
    hostname: string;
    authSource: string;
    database: string;
    sslEnabled: boolean;
    sslRejectUnauthorized: boolean;
    sslCertificate?: string;
    username?: string;
    password?: string;
  }
): MongoDBResourceConnection => {
  const { hostname, authSource, database, sslEnabled, sslRejectUnauthorized, sslCertificate, username, password } =
    config;

  const authPart = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";

  const encodedDatabase = encodeURIComponent(database);
  const uri = `mongodb://${authPart}localhost:${proxyPort}/${encodedDatabase}?authSource=${encodeURIComponent(authSource)}&directConnection=true&serverSelectionTimeoutMS=${EXTERNAL_REQUEST_TIMEOUT}&connectTimeoutMS=${EXTERNAL_REQUEST_TIMEOUT}`;

  const mongoClient = new MongoClient(uri, {
    ...(sslEnabled && {
      tls: true,
      tlsAllowInvalidCertificates: !sslRejectUnauthorized,
      servername: hostname,
      checkServerIdentity: (_hostnameParam: string, cert: PeerCertificate) => {
        return tls.checkServerIdentity(hostname, cert);
      }
    }),
    ...(sslEnabled && sslCertificate && { ca: sslCertificate })
  });

  return {
    validate: async (connectOnly) => {
      try {
        await mongoClient.connect();
        await mongoClient.db(database).command({ ping: 1 });
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

  // Parse the connection string once — extract hostname, port, SRV flag, and authSource
  const parsed = parseMongoConnectionString(connectionDetails.connectionString);

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

  // For SRV, use the resolved shard hostname for TLS servername.
  // TLS certificates are issued for individual shard hostnames, not the SRV domain,
  // so the servername must match the actual server we're connecting to.
  const effectiveHostname = parsed.isSRV ? resolvedHost : parsed.hostname;

  return withGatewayV2Proxy(
    async (proxyPort) => {
      const connection = makeMongoDBConnection(proxyPort, {
        hostname: effectiveHostname,
        authSource: parsed.authSource,
        database: connectionDetails.database,
        sslEnabled: connectionDetails.sslEnabled,
        sslRejectUnauthorized: connectionDetails.sslRejectUnauthorized,
        sslCertificate: connectionDetails.sslCertificate,
        username: config.username,
        password: config.password
      });
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

    await executeWithGateway({ connectionDetails, gatewayId }, gatewayV2Service, async (client) => {
      await client.validate(true);
    });
    return connectionDetails;
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TMongoDBAccountCredentials> = async (
    credentials
  ) => {
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
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<
    TMongoDBAccountCredentials
  > = async () => {
    throw new BadRequestError({
      message: "Credential rotation is not yet supported for MongoDB resources"
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
