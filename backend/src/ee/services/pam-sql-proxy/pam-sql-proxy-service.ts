import net from "node:net";
import tls, { PeerCertificate } from "node:tls";

import { Client, ClientConfig } from "pg";

import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { createRelayConnection } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { getConfig } from "@app/lib/config/env";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { splitPemChain } from "@app/services/certificate/certificate-fns";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

import { decryptAccountCredentials } from "../pam-account/pam-account-fns";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { decryptResourceConnectionDetails } from "../pam-resource/pam-resource-fns";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { TSqlAccountCredentials, TSqlResourceConnectionDetails } from "../pam-resource/shared/sql/sql-resource-types";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamSessionStatus } from "../pam-session/pam-session-enums";
import { TPamAccountServiceFactory } from "../pam-account/pam-account-service";

type TProxy = {
  server: net.Server;
  port: number;
  cleanup: () => Promise<void>;
};

type TActiveConnection = {
  client: Client;
  proxy: TProxy | null;
  lastActivity: Date;
  userId: string;
  sessionId: string;
  database: string;
  host: string;
  port: number;
  resourceName: string;
  accountName: string;
  expiresAt: Date;
  relayHost?: string;
  relayCerts?: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
  gatewayCerts?: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
};

// track sessions that are currently in the process of connecting to prevent race conditions with duplicate websocket connections
const connectingInProgress = new Set<string>();

type TPendingSessionCerts = {
  relayHost: string;
  gateway: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
  relay: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
  projectId: string;
};

type TPamSqlProxyServiceFactoryDep = {
  pamSessionDAL: TPamSessionDALFactory;
  pamAccountDAL: TPamAccountDALFactory;
  pamResourceDAL: TPamResourceDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  pamAccountService: Pick<TPamAccountServiceFactory, "access">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "deleteItem">;
};

export type TPamSqlProxyServiceFactory = ReturnType<typeof pamSqlProxyServiceFactory>;

// creates a gateway connection for the given socket through the relay.
const createGatewayConnection = async (
  relayConn: net.Socket,
  gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string }
): Promise<net.Socket> => {
  const appCfg = getConfig();

  const tlsOptions: tls.ConnectionOptions = {
    socket: relayConn,
    cert: gateway.clientCertificate,
    key: gateway.clientPrivateKey,
    ca: splitPemChain(gateway.serverCertificateChain),
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",
    rejectUnauthorized: true,
    ALPNProtocols: ["infisical-pam-proxy"], // this enables postgres parsing & query logging in the gateway
    checkServerIdentity: appCfg.isDevelopmentMode ? () => undefined : tls.checkServerIdentity
  };

  return new Promise((resolve, reject) => {
    try {
      const gatewaySocket = tls.connect(tlsOptions, () => {
        if (!gatewaySocket.authorized) {
          const error = gatewaySocket.authorizationError;
          gatewaySocket.destroy();
          reject(new Error(`Gateway TLS authorization failed: ${error?.message}`));
          return;
        }

        resolve(gatewaySocket);
      });

      gatewaySocket.on("error", (err: Error) => {
        reject(new Error(`Failed to establish gateway mTLS: ${err.message}`));
      });

      gatewaySocket.setTimeout(30000);
      gatewaySocket.on("timeout", () => {
        gatewaySocket.destroy();
        reject(new Error("Gateway connection timeout"));
      });
    } catch (error: unknown) {
      reject(
        new Error(`Failed to create gateway TLS connection: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  });
};

// sends a session cancellation message, so that the gateway will log upload. 
const sendSessionCancellation = async ({
  sessionId,
  relayHost,
  relay,
  gateway
}: {
  sessionId: string;
  relayHost: string;
  relay: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
  gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
}): Promise<void> => {
  const appCfg = getConfig();
  
  try {
    const relayConn = await createRelayConnection({
      relayHost,
      clientCertificate: relay.clientCertificate,
      clientPrivateKey: relay.clientPrivateKey,
      serverCertificateChain: relay.serverCertificateChain
    });

    const tlsOptions: tls.ConnectionOptions = {
      socket: relayConn,
      cert: gateway.clientCertificate,
      key: gateway.clientPrivateKey,
      ca: splitPemChain(gateway.serverCertificateChain),
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.3",
      rejectUnauthorized: true,
      ALPNProtocols: ["infisical-pam-session-cancellation"],
      checkServerIdentity: appCfg.isDevelopmentMode ? () => undefined : tls.checkServerIdentity
    };

    await new Promise<void>((resolve, reject) => {
      const gatewaySocket = tls.connect(tlsOptions, () => {
        if (!gatewaySocket.authorized) {
          gatewaySocket.destroy();
          reject(new Error("Gateway TLS authorization failed for session cancellation"));
          return;
        }

        const message = JSON.stringify({ sessionId });
        gatewaySocket.write(message, (err) => {
          if (err) {
            gatewaySocket.destroy();
            reject(err);
            return;
          }
          
          setTimeout(() => {
            gatewaySocket.end();
            relayConn.destroy();
            resolve();
          }, 500);
        });
      });

      gatewaySocket.on("error", (err) => {
        relayConn.destroy();
        reject(new Error(`Session cancellation failed: ${err.message}`));
      });

      gatewaySocket.setTimeout(10000);
      gatewaySocket.on("timeout", () => {
        gatewaySocket.destroy();
        relayConn.destroy();
        reject(new Error("Session cancellation timeout"));
      });
    });
  } catch (error) {
    logger.error({ sessionId, error }, "Failed to send session cancellation to gateway");
    // purposefully dont throw, we still want to cleanup the session even if this fails
  }
};

// stays alive for the duration of the sql session (similar to withGatewayV2Proxy)
const setupPersistentRelayServer = async ({
  relayHost,
  gateway,
  relay
}: {
  relayHost: string;
  gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
  relay: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
}): Promise<TProxy> => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on("connection", (clientConn) => {
      void (async () => {
        try {
          clientConn.setKeepAlive(true, 30000);
          clientConn.setNoDelay(true);

          const relayConn = await createRelayConnection({
            relayHost,
            clientCertificate: relay.clientCertificate,
            clientPrivateKey: relay.clientPrivateKey,
            serverCertificateChain: relay.serverCertificateChain
          });

          const gatewayConn = await createGatewayConnection(relayConn, gateway);
          clientConn.pipe(gatewayConn);
          gatewayConn.pipe(clientConn);

          clientConn.on("close", () => {
            relayConn.destroy();
            gatewayConn.destroy();
          });

          relayConn.on("close", () => {
            clientConn.destroy();
            gatewayConn.destroy();
          });

          gatewayConn.on("close", () => {
            clientConn.destroy();
            relayConn.destroy();
          });
        } catch (err) {
          logger.error({ error: err }, "SQL proxy gateway connection error");
          clientConn.destroy();
        }
      })();
    });

    server.on("error", (err) => {
      reject(err);
    });

    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to get server port"));
        return;
      }

      resolve({
        server,
        port: address.port,
        cleanup: async () => {
          try {
            server.close();
            logger.info({ port: address.port }, "SQL proxy gateway relay server stopped");
          } catch (err) {
            logger.debug("Error closing relay server:", err instanceof Error ? err.message : String(err));
          }
        }
      });
    });
  });
};

export const pamSqlProxyServiceFactory = ({
  pamSessionDAL,
  pamAccountDAL,
  pamResourceDAL,
  kmsService,
  pamAccountService,
  keyStore
}: TPamSqlProxyServiceFactoryDep) => {
  // activeConnections stores live postgres connections in-memory.
  // if a request ends up on a different pod, the connection will be recreated 
  // automatically using certs stored in Redis
  const activeConnections = new Map<string, TActiveConnection>();

  const encryptSessionCerts = async (projectId: string, certs: TPendingSessionCerts): Promise<string> => {
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const { cipherTextBlob } = encryptor({
      plainText: Buffer.from(JSON.stringify(certs))
    });
    return cipherTextBlob.toString("base64");
  };

  const decryptSessionCerts = async (projectId: string, encryptedData: string): Promise<TPendingSessionCerts> => {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const decrypted = decryptor({
      cipherTextBlob: Buffer.from(encryptedData, "base64")
    });
    return JSON.parse(decrypted.toString()) as TPendingSessionCerts;
  };

  // run a cleanup of old sessions
  const cleanupStaleConnections = async () => {
    const now = new Date();

    // cleanup any connections if the pam session expired
    const entries = Array.from(activeConnections.entries());
    for (const [sessionId, connection] of entries) {
      try {
        const session = await pamSessionDAL.findById(sessionId);
        const isExpired = !session || session.expiresAt < now || session.status === PamSessionStatus.Ended;
        
        if (isExpired) {
          await connection.client.end();
          if (connection.proxy) {
            await connection.proxy.cleanup();
          }
          activeConnections.delete(sessionId);
          
          if (session && session.status !== PamSessionStatus.Ended) {
            await pamSessionDAL.expireSessionById(sessionId);
          }
          logger.info({ sessionId }, "Cleaned up expired session connection");
        }
      } catch (error) {
        activeConnections.delete(sessionId);
        logger.error({ sessionId, error }, "Error cleaning up stale connection");
      }
    }
    // sessionCerts cleanup is handled automatically by Redis TTL
  };

  setInterval(() => {
    void cleanupStaleConnections();
  }, 5 * 60 * 1000); // cleanup every 5 mins

  // creates the actual sql session by calling the access api, then storing certs for later use
  const createSqlSession = async ({
    accountPath,
    projectId,
    duration,
    actorEmail,
    actorName,
    actorIp,
    actorUserAgent,
    actor
  }: {
    accountPath: string;
    projectId: string;
    duration: number;
    actorEmail: string;
    actorName: string;
    actorIp: string;
    actorUserAgent: string;
    actor: { id: string; type: ActorType; orgId: string; authMethod: ActorAuthMethod; rootOrgId: string; parentOrgId: string };
  }) => {
    const accessResult = await pamAccountService.access(
      {
        accountPath,
        projectId,
        duration,
        actorEmail,
        actorName,
        actorIp,
        actorUserAgent
      },
      {
        id: actor.id,
        type: actor.type,
        orgId: actor.orgId,
        authMethod: actor.authMethod,
        rootOrgId: actor.rootOrgId,
        parentOrgId: actor.parentOrgId
      }
    );
    
    // only postgres is supported
    if (accessResult.resourceType !== PamResource.Postgres) {
      throw new BadRequestError({
        message: `SQL console only supports PostgreSQL. Resource type is '${accessResult.resourceType}'`
      });
    }
    
    // store certs in Redis, encrypted with project KMS key
    // TTL matches pam session duration so certs remain valid for reconnects
    const sessionCertsData: TPendingSessionCerts = {
      relayHost: accessResult.relayHost,
      gateway: {
        clientCertificate: accessResult.gatewayClientCertificate,
        clientPrivateKey: accessResult.gatewayClientPrivateKey,
        serverCertificateChain: accessResult.gatewayServerCertificateChain
      },
      relay: {
        clientCertificate: accessResult.relayClientCertificate,
        clientPrivateKey: accessResult.relayClientPrivateKey,
        serverCertificateChain: accessResult.relayServerCertificateChain
      },
      projectId
    };
    
    const encryptedCerts = await encryptSessionCerts(projectId, sessionCertsData);
    const ttlSeconds = Math.ceil(duration / 1000);
    
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.PamSqlProxySessionCerts(projectId, accessResult.sessionId),
      ttlSeconds,
      encryptedCerts
    );
    
    return {
      sessionId: accessResult.sessionId,
      resourceType: accessResult.resourceType,
      metadata: accessResult.metadata
    };
  };

  // connects to the db using the creds from the PAM session (through the relay / gateway)
  const autoConnect = async (sessionId: string, userId: string) => {
    // first make sure the session belongs to the user
    const session = await pamSessionDAL.findById(sessionId);
    if (!session) {
      throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    }

    if (session.userId !== userId) {
      throw new ForbiddenRequestError({ message: "User is not authorized to access this session" });
    }

    if (session.status !== PamSessionStatus.Starting && session.status !== PamSessionStatus.Active) {
      throw new BadRequestError({ message: "Session is not in a connectable state" });
    }

    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      throw new BadRequestError({ message: "Session has expired" });
    }

    // use connection if already exists
    if (activeConnections.has(sessionId)) {
      const existing = activeConnections.get(sessionId)!;
      existing.lastActivity = new Date();
      return {
        database: existing.database,
        host: existing.host,
        port: existing.port,
        resourceName: existing.resourceName,
        accountName: existing.accountName
      };
    }

    // prevent race conditions of making multiple pending connections
    if (connectingInProgress.has(sessionId)) {
      await new Promise((resolve) => { setTimeout(resolve, 2000); });
      if (activeConnections.has(sessionId)) {
        const existing = activeConnections.get(sessionId)!;
        return {
          database: existing.database,
          host: existing.host,
          port: existing.port,
          resourceName: existing.resourceName,
          accountName: existing.accountName
        };
      }
      throw new BadRequestError({ message: "Connection attempt in progress failed" });
    }

    // mark as in progress
    connectingInProgress.add(sessionId);

    // validate the session has an account
    if (!session.accountId) {
      throw new BadRequestError({ message: "Session does not have an associated account" });
    }

    const account = await pamAccountDAL.findById(session.accountId);
    if (!account) {
      throw new NotFoundError({ message: `Account with ID '${session.accountId}' not found` });
    }

    // get the resource and ensure its postgres
    const resource = await pamResourceDAL.findById(account.resourceId);
    if (!resource) {
      throw new NotFoundError({ message: `Resource with ID '${account.resourceId}' not found` });
    }
    if (resource.resourceType !== PamResource.Postgres) {
      throw new BadRequestError({
        message: `SQL console only supports PostgreSQL. Resource type is '${resource.resourceType}'`
      });
    }

    // decrypt connection details and credentials
    const connectionDetails = (await decryptResourceConnectionDetails({
      encryptedConnectionDetails: resource.encryptedConnectionDetails,
      projectId: session.projectId,
      kmsService
    })) as TSqlResourceConnectionDetails;
    const credentials = (await decryptAccountCredentials({
      encryptedCredentials: account.encryptedCredentials,
      projectId: session.projectId,
      kmsService
    })) as TSqlAccountCredentials;
    if (!resource.gatewayId) {
      throw new BadRequestError({
        message: "SQL console requires a gateway. Please configure a gateway for this resource."
      });
    }

    const encryptedCerts = await keyStore.getItem(KeyStorePrefixes.PamSqlProxySessionCerts(session.projectId, sessionId));
    if (!encryptedCerts) {
      throw new BadRequestError({
        message: `Session certs not found for sessionId=${sessionId}. Session may have expired or the server restarted. Please create a new session.`
      });
    }
    const storedCerts = await decryptSessionCerts(session.projectId, encryptedCerts);
    const { relayHost } = storedCerts;
    const relayCerts = storedCerts.relay;
    const gatewayCerts = storedCerts.gateway;

    const proxy = await setupPersistentRelayServer({
      relayHost: storedCerts.relayHost,
      gateway: storedCerts.gateway,
      relay: storedCerts.relay
    });

    // pg.Client connects to local proxy, which then will leave the backend to tunnel through relay -> gateway -> PostgreSQL
    // ssl is not needed here because the tunnel (relay/gateway) provides TLS/mTLS encryption. within the same process, we don't need it.
    const clientConfig: ClientConfig = {
      host: "localhost",
      port: proxy.port,
      database: connectionDetails.database,
      user: credentials.username,
      password: credentials.password,
      ssl: false,
      connectionTimeoutMillis: 30000
    };

    // connect
    const client = new Client(clientConfig);
    client.on("error", (err) => {
      logger.error({ sessionId, error: err.message }, "PostgreSQL client error");
    });

    try {
      await client.connect();
      logger.info({ sessionId }, "PostgreSQL connection established successfully");
      activeConnections.set(sessionId, {
        client,
        proxy,
        lastActivity: new Date(),
        userId,
        sessionId,
        database: connectionDetails.database,
        host: connectionDetails.host,
        port: connectionDetails.port,
        resourceName: resource.name,
        accountName: account.name,
        expiresAt: session.expiresAt,
        relayHost,
        relayCerts,
        gatewayCerts
      });

      connectingInProgress.delete(sessionId);


      return {
        database: connectionDetails.database,
        host: connectionDetails.host,
        port: connectionDetails.port,
        resourceName: resource.name,
        accountName: account.name
      };
    } catch (error) {
      connectingInProgress.delete(sessionId);
      
      if (proxy) {
        await proxy.cleanup();
      }
      logger.error({ sessionId, error }, "Failed to auto-connect to PostgreSQL");
      throw new BadRequestError({
        message: `Failed to connect to database: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };

  // execute a query on an active session
  // If connection doesn't exist locally (e.g., pod scaled down), recreate it from Redis certs
  const executeQuery = async (sessionId: string, userId: string, sql: string) => {
    let connection = activeConnections.get(sessionId);

    // If no local connection, try to recreate it (handles pod scaling/restarts)
    if (!connection) {
      logger.info({ sessionId }, "No local connection found, attempting to recreate from Redis certs");
      try {
        await autoConnect(sessionId, userId);
        connection = activeConnections.get(sessionId);
      } catch (error) {
        logger.error({ sessionId, error }, "Failed to recreate connection");
        throw new NotFoundError({ 
          message: "No active connection and failed to reconnect. Session may have expired." 
        });
      }
    }

    if (!connection) {
      throw new NotFoundError({ message: "Failed to establish connection for this session." });
    }

    if (connection.userId !== userId) {
      throw new ForbiddenRequestError({ message: "User is not authorized to use this connection" });
    }

    connection.lastActivity = new Date();

    try {
      const startTime = Date.now();
      const result = await connection.client.query(sql);
      const duration = Date.now() - startTime;

      return {
        rows: result.rows,
        columns: result.fields?.map((f) => f.name) || [],
        rowCount: result.rowCount ?? 0,
        command: result.command || "QUERY",
        duration
      };
    } catch (error) {
      logger.error({ sessionId, error }, "SQL query execution failed");
      throw new BadRequestError({
        message: `Query failed: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };

  // closes the postgres connection, proxy, and ends the pam session. sends a cancellation message to the gateway to trigger log upload.
  const closeConnection = async (sessionId: string, userId: string, endSession = true) => {
    const connection = activeConnections.get(sessionId);

    if (!connection) {
      if (endSession) {
        try {
          await pamSessionDAL.expireSessionById(sessionId);
          logger.info({ sessionId }, "PAM session ended (no active connection)");
        } catch (error) {
          logger.error({ sessionId, error }, "Error ending PAM session");
        }
      }
      return { success: true, message: "No active connection" };
    }

    if (connection.userId !== userId) {
      throw new ForbiddenRequestError({ message: "User is not authorized to close this connection" });
    }

    try {
      // cancellation to gateway to trigger log upload
      if (connection.relayHost && connection.relayCerts && connection.gatewayCerts) {
        await sendSessionCancellation({
          sessionId,
          relayHost: connection.relayHost,
          relay: connection.relayCerts,
          gateway: connection.gatewayCerts
        });
      }
      
      // postgres
      await connection.client.end();
      if (connection.proxy) {
        await connection.proxy.cleanup();
      }
      activeConnections.delete(sessionId);

      // pam session
      if (endSession) {
        await pamSessionDAL.expireSessionById(sessionId);
        logger.info({ sessionId }, "PostgreSQL connection closed and PAM session ended");
      } else {
        logger.info({ sessionId }, "PostgreSQL connection closed");
      }

      return { success: true };
    } catch (error) {
      activeConnections.delete(sessionId);
      logger.error({ sessionId, error }, "Error closing PostgreSQL connection");
      
      if (endSession) {
        try {
          await pamSessionDAL.expireSessionById(sessionId);
        } catch (sessionError) {
          logger.error({ sessionId, error: sessionError }, "Error ending PAM session");
        }
      }
      
      return { success: true, message: "Connection closed with errors" };
    }
  };


  // connection status
  const getConnectionStatus = (sessionId: string, userId: string) => {
    const connection = activeConnections.get(sessionId);

    if (!connection || connection.userId !== userId) {
      return { connected: false };
    }

    return {
      connected: true,
      lastActivity: connection.lastActivity,
      database: connection.database,
      host: connection.host,
      port: connection.port,
      resourceName: connection.resourceName,
      accountName: connection.accountName,
      expiresAt: connection.expiresAt
    };
  };

  return {
    createSqlSession,
    autoConnect,
    executeQuery,
    closeConnection,
    getConnectionStatus
  };
};
