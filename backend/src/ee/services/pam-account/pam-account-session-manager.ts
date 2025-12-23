import tls, { TLSSocket } from "tls";

import { TPamAccounts, TPamSessions } from "@app/db/schemas";
import { BadRequestError, GoneError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { OrgServiceActor } from "@app/lib/types";

import { TPamAccountServiceFactory } from "./pam-account-service";

type TActiveSession = {
  sessionId: string;
  pamSessionId: string;
  relayConnection: TLSSocket;
  gatewayConnection: TLSSocket;
  relayHost: string;
  relayCerts: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
  gatewayCerts: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
  metadata: {
    username: string;
    database: string;
    host: string;
    port: number;
  };
  createdAt: Date;
  expiresAt: Date;
  account: TPamAccounts;
  pamSession: TPamSessions;
};

type TCreateSessionDTO = {
  accountPath: string;
  projectId: string;
  duration?: string;
};

type TQueryResult = {
  // TODO: Replace any with proper PostgreSQL field type union (string | number | boolean | null | Buffer)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Array<Array<any>>;
  fields?: Array<string>;
  rowCount: number;
  executionTimeMs: number;
};

type THealthCheckResult = {
  isAlive: boolean;
  expiresAt?: Date;
  error?: string;
};

type TPamAccountSessionManagerFactoryDep = {
  pamAccountService: Pick<TPamAccountServiceFactory, "access">;
};

export type TPamAccountSessionManagerFactory = ReturnType<typeof pamAccountSessionManagerFactory>;

export const pamAccountSessionManagerFactory = ({ pamAccountService }: TPamAccountSessionManagerFactoryDep) => {
  // In-memory storage for active sessions
  const activeSessions = new Map<string, TActiveSession>();

  // PostgreSQL wire protocol helpers
  const buildStartupMessage = (user: string, database: string): Buffer => {
    const params = ["user", user, "database", database, "client_encoding", "UTF8"];
    let paramsLength = 0;
    for (const param of params) {
      paramsLength += Buffer.from(param, "utf8").length + 1;
    }
    paramsLength += 1; // Null terminator

    const messageLength = 4 + 4 + paramsLength;
    const message = Buffer.alloc(messageLength);
    let offset = 0;

    message.writeInt32BE(messageLength, offset);
    offset += 4;
    message.writeInt32BE(196608, offset); // Protocol version 3.0
    offset += 4;

    for (const param of params) {
      const paramBuf = Buffer.from(`${param}\0`, "utf8");
      paramBuf.copy(message, offset);
      offset += paramBuf.length;
    }
    message.writeInt8(0, offset);

    return message;
  };

  const buildQueryMessage = (query: string): Buffer => {
    const queryStr = `${query}\0`;
    const queryBytes = Buffer.from(queryStr, "utf8");
    const length = Buffer.alloc(4);
    length.writeInt32BE(4 + queryBytes.length);

    return Buffer.concat([Buffer.from("Q"), length, queryBytes]);
  };

  // Connect to relay server with TLS
  const connectToRelay = async (
    relayHost: string,
    certs: {
      clientCertificate: string;
      clientPrivateKey: string;
      serverCertificateChain: string;
    }
  ): Promise<TLSSocket> => {
    const [host, portStr] = relayHost.includes(":") ? relayHost.split(":") : [relayHost, "8443"];
    const port = parseInt(portStr, 10);

    return new Promise((resolve, reject) => {
      const options = {
        host,
        port,
        cert: Buffer.from(certs.clientCertificate),
        key: Buffer.from(certs.clientPrivateKey),
        ca: Buffer.from(certs.serverCertificateChain),
        minVersion: "TLSv1.2" as const,
        rejectUnauthorized: true
      };

      const conn = tls.connect(options);
      const timeout = setTimeout(() => {
        conn.destroy();
        reject(new Error("Relay connection timeout"));
      }, 30000);

      conn.on("secureConnect", () => {
        clearTimeout(timeout);
        resolve(conn);
      });

      conn.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  };

  // Connect to gateway through relay
  const connectToGateway = async (
    relayConn: TLSSocket,
    certs: {
      clientCertificate: string;
      clientPrivateKey: string;
      serverCertificateChain: string;
    },
    alpn = "infisical-pam-proxy"
  ): Promise<TLSSocket> => {
    return new Promise((resolve, reject) => {
      const options = {
        socket: relayConn,
        cert: Buffer.from(certs.clientCertificate),
        key: Buffer.from(certs.clientPrivateKey),
        ca: Buffer.from(certs.serverCertificateChain),
        ALPNProtocols: [alpn],
        servername: "localhost",
        minVersion: "TLSv1.2" as const,
        maxVersion: "TLSv1.3" as const,
        rejectUnauthorized: true
      };

      const gatewayConn = tls.connect(options);
      const timeout = setTimeout(() => {
        gatewayConn.destroy();
        reject(new Error("Gateway connection timeout"));
      }, 30000);

      gatewayConn.on("secureConnect", () => {
        clearTimeout(timeout);
        resolve(gatewayConn);
      });

      gatewayConn.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  };

  // Send PostgreSQL startup message and wait for ready
  const initializePostgresConnection = async (
    gatewayConn: TLSSocket,
    username: string,
    database: string
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      let responseData = Buffer.alloc(0);
      let timeout: NodeJS.Timeout;

      const dataHandler = (chunk: Buffer) => {
        responseData = Buffer.concat([responseData, chunk]);

        let offset = 0;
        while (offset < responseData.length) {
          if (offset + 5 > responseData.length) break;

          const messageType = String.fromCharCode(responseData[offset]);
          const messageLength = responseData.readInt32BE(offset + 1);

          if (offset + 1 + messageLength > responseData.length) break;

          if (messageType === "Z") {
            // ReadyForQuery
            clearTimeout(timeout);
            gatewayConn.removeListener("data", dataHandler);
            resolve();
            return;
          }
          if (messageType === "E") {
            // Error
            clearTimeout(timeout);
            gatewayConn.removeListener("data", dataHandler);
            reject(new Error("PostgreSQL startup error"));
            return;
          }

          offset += 1 + messageLength;
        }

        responseData = responseData.slice(offset);
      };

      timeout = setTimeout(() => {
        gatewayConn.removeListener("data", dataHandler);
        reject(new Error("PostgreSQL startup timeout"));
      }, 15000);

      gatewayConn.on("data", dataHandler);
      gatewayConn.on("error", (err) => {
        clearTimeout(timeout);
        gatewayConn.removeListener("data", dataHandler);
        reject(err);
      });

      // Send startup message
      const startupMessage = buildStartupMessage(username, database);
      gatewayConn.write(startupMessage);
    });
  };

  // Execute PostgreSQL query
  const executePostgresQuery = async (
    gatewayConn: TLSSocket,
    query: string
    // TODO: Replace any with proper PostgreSQL field type union (string | number | boolean | null | Buffer)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ rows: Array<Array<any>>; rowCount: number }> => {
    return new Promise((resolve, reject) => {
      let responseData = Buffer.alloc(0);
      // TODO: Replace any with proper PostgreSQL field type union
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: Array<Array<any>> = [];
      let timeout: NodeJS.Timeout;

      const dataHandler = (chunk: Buffer) => {
        responseData = Buffer.concat([responseData, chunk]);

        let offset = 0;
        while (offset < responseData.length) {
          if (offset + 5 > responseData.length) break;

          const messageType = String.fromCharCode(responseData[offset]);
          const messageLength = responseData.readInt32BE(offset + 1);

          if (offset + 1 + messageLength > responseData.length) break;

          const messageData = responseData.slice(offset + 5, offset + 1 + messageLength);

          if (messageType === "D") {
            // DataRow
            const fieldCount = messageData.readInt16BE(0);
            // TODO: Replace any with proper PostgreSQL field type union
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fields: Array<any> = [];
            let fieldOffset = 2;

            for (let i = 0; i < fieldCount; i += 1) {
              const fieldLength = messageData.readInt32BE(fieldOffset);
              fieldOffset += 4;
              if (fieldLength > 0) {
                const fieldValue = messageData.slice(fieldOffset, fieldOffset + fieldLength).toString("utf8");
                fields.push(fieldValue);
                fieldOffset += fieldLength;
              } else {
                fields.push(null);
              }
            }
            results.push(fields);
          } else if (messageType === "Z") {
            // ReadyForQuery
            clearTimeout(timeout);
            gatewayConn.removeListener("data", dataHandler);
            resolve({ rows: results, rowCount: results.length });
            return;
          } else if (messageType === "E") {
            // Error
            clearTimeout(timeout);
            gatewayConn.removeListener("data", dataHandler);
            reject(new Error("PostgreSQL query error"));
            return;
          }

          offset += 1 + messageLength;
        }

        responseData = responseData.slice(offset);
      };

      timeout = setTimeout(() => {
        gatewayConn.removeListener("data", dataHandler);
        reject(new Error("Query timeout"));
      }, 60000); // 60 second query timeout

      gatewayConn.on("data", dataHandler);
      gatewayConn.on("error", (err) => {
        clearTimeout(timeout);
        gatewayConn.removeListener("data", dataHandler);
        reject(err);
      });

      // Send query
      const queryMessage = buildQueryMessage(query);
      gatewayConn.write(queryMessage);
    });
  };

  // Terminate session
  const terminateSession = async (sessionId: string): Promise<void> => {
    const session = activeSessions.get(sessionId);

    if (!session) {
      throw new NotFoundError({ message: "Session not found" });
    }

    try {
      // Connect with session cancellation ALPN
      const cancelRelay = await connectToRelay(session.relayHost, session.relayCerts).catch(() => null); // Ignore errors on cancellation connect

      if (cancelRelay) {
        const cancelConn = await connectToGateway(
          cancelRelay,
          session.gatewayCerts,
          "infisical-pam-session-cancellation"
        ).catch(() => null);

        if (cancelConn) {
          cancelConn.end();
        }
        cancelRelay.end();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error during session cancellation for ${sessionId}`, errorMessage);
    }

    // Close connections
    try {
      session.gatewayConnection.destroy();
    } catch (e) {
      // Ignore
    }
    try {
      session.relayConnection.destroy();
    } catch (e) {
      // Ignore
    }

    // Remove from map
    activeSessions.delete(sessionId);

    logger.info(`Terminated browser PAM session: ${sessionId}`);
  };

  // Create a new session
  const createSession = async (
    { accountPath, projectId, duration = "4h" }: TCreateSessionDTO,
    actor: OrgServiceActor
  ) => {
    // Parse duration
    const durationMs = ms(duration);
    if (durationMs <= 0) {
      throw new BadRequestError({
        message: "Invalid duration format. Must be a positive duration (e.g., '1h', '30m', '2d')."
      });
    }

    // Get PAM access details
    const accessResponse = await pamAccountService.access(
      {
        accountPath,
        projectId,
        actorEmail: "",
        actorIp: "",
        actorName: "",
        actorUserAgent: "",
        duration: durationMs
      },
      actor
    );

    // Only support gateway-based Postgres resources for now
    if (accessResponse.resourceType !== "postgres") {
      throw new BadRequestError({
        message: "Only PostgreSQL resources are supported for browser-based sessions"
      });
    }

    if (!accessResponse.metadata || !accessResponse.metadata.username || !accessResponse.metadata.database) {
      throw new BadRequestError({
        message: "Missing required connection metadata"
      });
    }

    try {
      // Connect to relay
      const relayConnection = await connectToRelay(accessResponse.relayHost, {
        clientCertificate: accessResponse.relayClientCertificate,
        clientPrivateKey: accessResponse.relayClientPrivateKey,
        serverCertificateChain: accessResponse.relayServerCertificateChain
      });

      // Connect to gateway through relay
      const gatewayConnection = await connectToGateway(relayConnection, {
        clientCertificate: accessResponse.gatewayClientCertificate,
        clientPrivateKey: accessResponse.gatewayClientPrivateKey,
        serverCertificateChain: accessResponse.gatewayServerCertificateChain
      });

      // Initialize PostgreSQL connection
      await initializePostgresConnection(
        gatewayConnection,
        accessResponse.metadata.username,
        accessResponse.metadata.database
      );

      const relayCerts = {
        clientCertificate: accessResponse.relayClientCertificate,
        clientPrivateKey: accessResponse.relayClientPrivateKey,
        serverCertificateChain: accessResponse.relayServerCertificateChain
      };

      const gatewayCerts = {
        clientCertificate: accessResponse.gatewayClientCertificate,
        clientPrivateKey: accessResponse.gatewayClientPrivateKey,
        serverCertificateChain: accessResponse.gatewayServerCertificateChain
      };

      const session: TActiveSession = {
        sessionId: accessResponse.sessionId,
        pamSessionId: accessResponse.sessionId,
        relayConnection,
        gatewayConnection,
        relayHost: accessResponse.relayHost,
        relayCerts,
        gatewayCerts,
        metadata: {
          username: accessResponse.metadata.username,
          database: accessResponse.metadata.database,
          host: "",
          port: 0
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + durationMs),
        account: accessResponse.account,
        pamSession: {} as TPamSessions
      };

      // Store session
      activeSessions.set(session.sessionId, session);

      logger.info(`Created browser PAM session: ${session.sessionId}`);

      return {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        metadata: session.metadata,
        account: {
          id: session.account.id,
          name: session.account.name
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to create PAM session", errorMessage);
      throw new BadRequestError({
        message: `Failed to establish connection: ${errorMessage}`
      });
    }
  };

  // Get session info
  const getSessionInfo = (sessionId: string): { accountId: string; accountName: string } | null => {
    const session = activeSessions.get(sessionId);
    if (!session) {
      return null;
    }
    return {
      accountId: session.account.id,
      accountName: session.account.name
    };
  };

  // Check if session is alive
  const checkHealth = async (sessionId: string): Promise<THealthCheckResult> => {
    const session = activeSessions.get(sessionId);

    if (!session) {
      return { isAlive: false, error: "Session not found" };
    }

    if (new Date() > session.expiresAt) {
      // Clean up expired session
      await terminateSession(sessionId);
      return { isAlive: false, error: "Session expired" };
    }

    // Check if connections are still alive
    if (session.relayConnection.destroyed || session.gatewayConnection.destroyed) {
      await terminateSession(sessionId);
      return { isAlive: false, error: "Connection closed" };
    }

    return {
      isAlive: true,
      expiresAt: session.expiresAt
    };
  };

  // Execute query on existing session
  const executeQuery = async (sessionId: string, query: string): Promise<TQueryResult> => {
    const session = activeSessions.get(sessionId);

    if (!session) {
      throw new NotFoundError({ message: "Session not found" });
    }

    if (new Date() > session.expiresAt) {
      await terminateSession(sessionId);
      throw new GoneError({ message: "Session expired" });
    }

    // Check if connection is alive before executing
    if (session.gatewayConnection.destroyed) {
      await terminateSession(sessionId);
      throw new BadRequestError({ message: "Connection closed" });
    }

    try {
      const startTime = Date.now();
      const { rows, rowCount } = await executePostgresQuery(session.gatewayConnection, query);
      const executionTimeMs = Date.now() - startTime;

      return {
        rows,
        rowCount,
        executionTimeMs
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Query execution failed for session ${sessionId}`, errorMessage);
      throw new BadRequestError({
        message: `Query execution failed: ${errorMessage}`
      });
    }
  };

  // Background cleanup job for expired sessions
  const startCleanupInterval = () => {
    setInterval(() => {
      const now = new Date();
      for (const [sessionId, session] of activeSessions.entries()) {
        if (now > session.expiresAt) {
          terminateSession(sessionId).catch((err) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error(`Failed to cleanup expired session ${sessionId}`, errorMessage);
          });
        }
      }
    }, 60000); // Run every 60 seconds
  };

  // Start cleanup on service initialization
  startCleanupInterval();

  return {
    createSession,
    getSessionInfo,
    checkHealth,
    executeQuery,
    terminateSession
  };
};
