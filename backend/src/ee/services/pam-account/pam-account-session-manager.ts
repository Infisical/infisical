import { serialize } from "pg-protocol";
import { Parser } from "pg-protocol/dist/parser";
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

type TFieldMetadata = {
  name: string;
  dataTypeID: number;
  dataTypeSize: number;
  dataTypeModifier: number;
  tableID?: number;
  columnID?: number;
};

type TQueryResult = {
  // TODO: Replace any with proper PostgreSQL field type union (string | number | boolean | null | Buffer)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Array<Array<any>>;
  fields: Array<TFieldMetadata>;
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

  // Helper: Format error message
  const formatError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

  // Helper: Cleanup event listeners and timeout
  const cleanupListeners = (
    connection: TLSSocket,
    timeout: NodeJS.Timeout,
    dataHandler: (chunk: Buffer) => void,
    errorHandler: (err: Error) => void
  ) => {
    clearTimeout(timeout);
    connection.removeListener("data", dataHandler);
    connection.removeListener("error", errorHandler);
  };

  // Helper: Execute PostgreSQL protocol operation with timeout
  const executeWithTimeout = <T>(
    gatewayConn: TLSSocket,
    operation: (parser: Parser) => void,
    messageHandler: (
      msg: any,
      resolve: (value: T) => void,
      reject: (reason?: any) => void,
      cleanup: () => void
    ) => void,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const parser = new Parser();
      let timeout: NodeJS.Timeout;
      let dataHandler: ((chunk: Buffer) => void) | undefined;
      let errorHandler: ((err: Error) => void) | undefined;

      const cleanup = () => {
        clearTimeout(timeout);
        if (dataHandler) gatewayConn.removeListener("data", dataHandler);
        if (errorHandler) gatewayConn.removeListener("error", errorHandler);
      };

      errorHandler = (err: Error) => {
        cleanup();
        reject(err);
      };

      dataHandler = (chunk: Buffer) => {
        parser.parse(chunk, (msg: any) => messageHandler(msg, resolve, reject, cleanup));
      };

      timeout = setTimeout(() => {
        cleanup();
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      gatewayConn.on("data", dataHandler);
      gatewayConn.on("error", errorHandler);

      operation(parser);
    });
  };

  // Helper: Create TLS connection with timeout
  const createTLSConnection = (
    options: tls.ConnectionOptions,
    timeoutMessage: string,
    timeoutMs = 30000
  ): Promise<TLSSocket> => {
    return new Promise((resolve, reject) => {
      const conn = tls.connect(options);
      const timeout = setTimeout(() => {
        conn.destroy();
        reject(new Error(timeoutMessage));
      }, timeoutMs);

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

  // Helper: Convert certificate strings to buffers
  const certsToBuffers = (certs: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  }) => ({
    cert: Buffer.from(certs.clientCertificate),
    key: Buffer.from(certs.clientPrivateKey),
    ca: Buffer.from(certs.serverCertificateChain)
  });

  // Helper: Safely destroy connections
  const destroyConnection = (conn: TLSSocket) => {
    try {
      conn.destroy();
    } catch {
      // Ignore errors
    }
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
    return createTLSConnection(
      {
        host,
        port: parseInt(portStr, 10),
        ...certsToBuffers(certs),
        minVersion: "TLSv1.2" as const,
        rejectUnauthorized: true
      },
      "Relay connection timeout"
    );
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
    return createTLSConnection(
      {
        socket: relayConn,
        ...certsToBuffers(certs),
        ALPNProtocols: [alpn],
        servername: "localhost",
        minVersion: "TLSv1.2" as const,
        maxVersion: "TLSv1.3" as const,
        rejectUnauthorized: true
      },
      "Gateway connection timeout"
    );
  };

  // Initialize PostgreSQL connection using pg-protocol
  const initializePostgresConnection = async (
    gatewayConn: TLSSocket,
    username: string,
    database: string
  ): Promise<void> => {
    return executeWithTimeout<void>(
      gatewayConn,
      () => {
        const startupMessage = serialize.startup({
          user: username,
          database,
          client_encoding: "UTF8"
        });
        gatewayConn.write(startupMessage);
      },
      (msg, resolve, reject, cleanup) => {
        if (msg.name === "readyForQuery") {
          cleanup();
          resolve();
        } else if (msg.name === "error") {
          cleanup();
          reject(new Error("PostgreSQL startup error"));
        }
      },
      15000,
      "PostgreSQL startup timeout"
    );
  };

  // Execute PostgreSQL query using pg-protocol
  const executePostgresQuery = async (
    gatewayConn: TLSSocket,
    query: string
    // TODO: Replace any with proper PostgreSQL field type union (string | number | boolean | null | Buffer)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ rows: Array<Array<any>>; fields: Array<TFieldMetadata>; rowCount: number }> => {
    // TODO: Replace any with proper PostgreSQL field type union
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: Array<Array<any>> = [];
    const fields: Array<TFieldMetadata> = [];

    await executeWithTimeout<void>(
      gatewayConn,
      () => {
        const queryMessage = serialize.query(query);
        gatewayConn.write(queryMessage);
      },
      (msg: any, resolve, reject, cleanup) => {
        if (msg.name === "rowDescription") {
          // Extract full field metadata including data types
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fields.push(
            ...msg.fields.map((f: any) => ({
              name: f.name,
              dataTypeID: f.dataTypeID,
              dataTypeSize: f.dataTypeSize,
              dataTypeModifier: f.dataTypeModifier,
              tableID: f.tableID,
              columnID: f.columnID
            }))
          );
        } else if (msg.name === "dataRow") {
          results.push(msg.fields);
        } else if (msg.name === "readyForQuery") {
          cleanup();
          resolve();
        } else if (msg.name === "error") {
          cleanup();
          reject(new Error("PostgreSQL query error"));
        }
      },
      60000,
      "Query timeout"
    );

    return { rows: results, fields, rowCount: results.length };
  };

  // Terminate session
  const terminateSession = async (sessionId: string): Promise<void> => {
    const session = activeSessions.get(sessionId);

    if (!session) {
      throw new NotFoundError({ message: "Session not found" });
    }

    try {
      // Connect with session cancellation ALPN
      const cancelRelay = await connectToRelay(session.relayHost, session.relayCerts).catch(() => null);

      if (cancelRelay) {
        const cancelConn = await connectToGateway(
          cancelRelay,
          session.gatewayCerts,
          "infisical-pam-session-cancellation"
        ).catch(() => null);

        if (cancelConn) cancelConn.end();
        cancelRelay.end();
      }
    } catch (error) {
      logger.error(`Error during session cancellation for ${sessionId}`, formatError(error));
    }

    // Close connections
    destroyConnection(session.gatewayConnection);
    destroyConnection(session.relayConnection);

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

      const session: TActiveSession = {
        sessionId: accessResponse.sessionId,
        pamSessionId: accessResponse.sessionId,
        relayConnection,
        gatewayConnection,
        relayHost: accessResponse.relayHost,
        relayCerts: {
          clientCertificate: accessResponse.relayClientCertificate,
          clientPrivateKey: accessResponse.relayClientPrivateKey,
          serverCertificateChain: accessResponse.relayServerCertificateChain
        },
        gatewayCerts: {
          clientCertificate: accessResponse.gatewayClientCertificate,
          clientPrivateKey: accessResponse.gatewayClientPrivateKey,
          serverCertificateChain: accessResponse.gatewayServerCertificateChain
        },
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
      logger.error("Failed to create PAM session", formatError(error));
      throw new BadRequestError({
        message: `Failed to establish connection: ${formatError(error)}`
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
      const { rows, fields, rowCount } = await executePostgresQuery(session.gatewayConnection, query);
      const executionTimeMs = Date.now() - startTime;

      return {
        rows,
        fields,
        rowCount,
        executionTimeMs
      };
    } catch (error) {
      logger.error(`Query execution failed for session ${sessionId}`, formatError(error));
      throw new BadRequestError({
        message: `Query execution failed: ${formatError(error)}`
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
            logger.error(`Failed to cleanup expired session ${sessionId}`, formatError(err));
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
