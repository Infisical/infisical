import { ForbiddenError, subject } from "@casl/ability";
import pg from "pg";
import type WebSocket from "ws";

import { ActionProjectType } from "@app/db/schemas";
import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection, setupRelayServer } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPamSessionExpirationServiceFactory } from "@app/services/pam-session-expiration/pam-session-expiration-queue";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { decryptAccountCredentials } from "../pam-account/pam-account-fns";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { decryptResourceConnectionDetails } from "../pam-resource/pam-resource-fns";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamSessionStatus } from "../pam-session/pam-session-enums";
import { createPamSqlRepl } from "./pam-web-access-repl";
import {
  DEFAULT_WEB_SESSION_DURATION_MS,
  MAX_WEB_SESSIONS_PER_USER,
  SessionEndReason,
  TIssueWebSocketTicketDTO,
  TWebSocketServerMessage,
  WebSocketClientMessageSchema,
  WS_PING_INTERVAL_MS,
  WsMessageType
} from "./pam-web-access-types";

type TPamWebAccessServiceFactoryDep = {
  pamAccountDAL: Pick<TPamAccountDALFactory, "findById">;
  pamResourceDAL: Pick<TPamResourceDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "create" | "updateById" | "expireSessionById" | "countActiveWebSessions">;
  pamSessionExpirationService: Pick<TPamSessionExpirationServiceFactory, "scheduleSessionExpiration">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export type TPamWebAccessServiceFactory = ReturnType<typeof pamWebAccessServiceFactory>;

type THandleWebSocketConnectionDTO = {
  socket: WebSocket;
  accountId: string;
  projectId: string;
  orgId: string;
  resourceName: string;
  accountName: string;
  auditLogInfo: AuditLogInfo;
  userId: string;
  actorEmail: string;
  actorName: string;
  actorIp: string;
  actorUserAgent: string;
};
export const pamWebAccessServiceFactory = ({
  pamAccountDAL,
  pamResourceDAL,
  permissionService,
  auditLogService,
  tokenService,
  pamSessionDAL,
  pamSessionExpirationService,
  gatewayV2Service,
  kmsService,
  userDAL
}: TPamWebAccessServiceFactoryDep) => {
  const sendMessage = (socket: WebSocket, message: TWebSocketServerMessage): void => {
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    } catch (err) {
      logger.error(err, "Failed to send WebSocket message");
    }
  };

  const sendSessionEnd = (socket: WebSocket, reason: SessionEndReason): void => {
    sendMessage(socket, { type: WsMessageType.SessionEnd, reason });
  };

  const issueWebSocketTicket = async ({
    accountId,
    projectId,
    orgId,
    actor,
    actorEmail,
    actorName,
    auditLogInfo
  }: TIssueWebSocketTicketDTO) => {
    const account = await pamAccountDAL.findById(accountId);

    if (!account) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    if (account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    const resource = await pamResourceDAL.findById(account.resourceId);

    if (!resource) {
      throw new NotFoundError({ message: `Resource with ID '${account.resourceId}' not found` });
    }

    if (resource.resourceType !== PamResource.Postgres) {
      throw new BadRequestError({
        message: "Web access is currently only supported for PostgreSQL accounts"
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Access,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name
      })
    );

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_PAM_WS_TICKET,
      userId: actor.id,
      payload: JSON.stringify({
        accountId,
        projectId,
        orgId,
        resourceName: resource.name,
        accountName: account.name,
        actorEmail,
        actorName,
        auditLogInfo
      })
    });

    await auditLogService.createAuditLog({
      ...auditLogInfo,
      orgId,
      projectId,
      event: {
        type: EventType.PAM_WEB_ACCESS_SESSION_TICKET_CREATED,
        metadata: {
          accountId,
          resourceName: resource.name,
          accountName: account.name
        }
      }
    });

    return { ticket: `${actor.id}:${token}` };
  };

  const handleWebSocketConnection = async ({
    socket,
    accountId,
    projectId,
    orgId,
    resourceName,
    accountName,
    auditLogInfo,
    userId,
    actorEmail,
    actorName,
    actorIp,
    actorUserAgent
  }: THandleWebSocketConnectionDTO): Promise<void> => {
    let session: { id: string } | null = null;
    let cleanedUp = false;
    let pgClient: pg.Client | null = null;
    let relayServer: { port: number; cleanup: () => Promise<void> } | null = null;
    let relayCerts: {
      relay: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
      gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
      relayHost: string;
    } | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;

      if (expiryTimer) {
        clearTimeout(expiryTimer);
      }
      if (pingInterval) {
        clearInterval(pingInterval);
      }

      // End pg client (needs tunnel to send Terminate message)
      if (pgClient) {
        try {
          await pgClient.end();
        } catch (err) {
          logger.debug(err, "Error closing pg client");
        }
      }

      // Close relay tunnel
      if (relayServer) {
        try {
          await relayServer.cleanup();
        } catch (err) {
          logger.debug(err, "Error closing relay server");
        }
      }

      // Best-effort ALPN session cancellation
      if (relayCerts) {
        try {
          const relayConn = await createRelayConnection({
            relayHost: relayCerts.relayHost,
            clientCertificate: relayCerts.relay.clientCertificate,
            clientPrivateKey: relayCerts.relay.clientPrivateKey,
            serverCertificateChain: relayCerts.relay.serverCertificateChain
          });
          const cancelConn = await createGatewayConnection(
            relayConn,
            relayCerts.gateway,
            GatewayProxyProtocol.PamSessionCancellation
          );
          cancelConn.end();
        } catch (err) {
          logger.debug(err, "Session cancellation signal failed (best-effort)");
        }
      }

      // Always expire session in DB
      if (session) {
        try {
          await pamSessionDAL.expireSessionById(session.id);
        } catch (err) {
          logger.debug(err, "Error expiring session");
        }
      }
    };

    try {
      // 1. VALIDATE
      const account = await pamAccountDAL.findById(accountId);
      if (!account || account.projectId !== projectId) {
        throw new BadRequestError({ message: "Invalid account or project" });
      }

      const resource = await pamResourceDAL.findById(account.resourceId);
      if (!resource) {
        throw new BadRequestError({ message: "Resource not found" });
      }

      if (resource.resourceType !== PamResource.Postgres) {
        throw new BadRequestError({ message: "Web access is only supported for PostgreSQL" });
      }

      if (!resource.gatewayId) {
        throw new BadRequestError({ message: "Gateway not configured for this resource" });
      }

      // Check web session limit
      const activeCount = await pamSessionDAL.countActiveWebSessions(userId, projectId);
      if (activeCount >= MAX_WEB_SESSIONS_PER_USER) {
        sendMessage(socket, {
          type: WsMessageType.Output,
          data: `Maximum concurrent web sessions (${MAX_WEB_SESSIONS_PER_USER}) reached. Please close an existing session first.\n`,
          prompt: ""
        });
        socket.close();
        return;
      }

      // 2. DECRYPT
      const connectionDetails = await decryptResourceConnectionDetails({
        projectId,
        encryptedConnectionDetails: resource.encryptedConnectionDetails,
        kmsService
      });

      const credentials = await decryptAccountCredentials({
        projectId,
        encryptedCredentials: account.encryptedCredentials,
        kmsService
      });

      // 3. CREATE SESSION
      const user = await userDAL.findById(userId);
      const expiresAt = new Date(Date.now() + DEFAULT_WEB_SESSION_DURATION_MS);

      session = await pamSessionDAL.create({
        status: PamSessionStatus.Starting,
        accessMethod: "web",
        expiresAt,
        accountName,
        actorEmail,
        actorIp,
        actorName,
        actorUserAgent,
        projectId,
        resourceName: resource.name,
        resourceType: resource.resourceType,
        accountId: account.id,
        userId
      });

      await pamSessionExpirationService.scheduleSessionExpiration(session.id, expiresAt);

      // 4. GET CERTIFICATES
      const certs = await gatewayV2Service.getPAMConnectionDetails({
        gatewayId: resource.gatewayId,
        sessionId: session.id,
        resourceType: PamResource.Postgres,
        host: (connectionDetails as { host: string }).host,
        port: (connectionDetails as { port: number }).port,
        duration: DEFAULT_WEB_SESSION_DURATION_MS,
        actorMetadata: {
          id: userId,
          type: ActorType.USER,
          name: user?.email ?? ""
        }
      });

      if (!certs) {
        throw new BadRequestError({ message: "Failed to obtain gateway connection details" });
      }

      relayCerts = {
        relayHost: certs.relayHost,
        relay: certs.relay,
        gateway: certs.gateway
      };

      // 5. START TUNNEL
      relayServer = await setupRelayServer({
        protocol: GatewayProxyProtocol.Pam,
        relayHost: certs.relayHost,
        relay: certs.relay,
        gateway: certs.gateway,
        longLived: true
      });

      // 6. CONNECT PG
      pgClient = new pg.Client({
        host: "localhost",
        port: relayServer.port,
        user: (credentials as { username: string }).username,
        database: (connectionDetails as { database: string }).database,
        password: "",
        ssl: false,
        // Max time to wait for TCP connection
        connectionTimeoutMillis: 30_000,
        // Max execution time per SQL statement (sent as a PostgreSQL connection parameter)
        statement_timeout: 30_000,
        // Return raw strings for ALL types — we only display values, never compute with them.
        // Without this, pg auto-parses timestamps to JS Date objects (verbose toString()),
        // booleans to true/false (psql shows t/f), JSON to objects, arrays to JS arrays, etc.
        types: {
          getTypeParser: () => (val: string | Buffer) => (typeof val === "string" ? val : val.toString("hex"))
        }
      });

      await pgClient.connect();

      // 7. ACTIVATE SESSION
      await pamSessionDAL.updateById(session.id, {
        status: PamSessionStatus.Active,
        startedAt: new Date()
      });

      // 8. INIT REPL + SEND READY
      const repl = createPamSqlRepl(pgClient);
      const { username } = credentials as { username: string };
      const { database } = connectionDetails as { database: string };

      sendMessage(socket, {
        type: WsMessageType.Ready,
        data: `Connected to ${resource.name} (${database}) as ${username}\n\n`,
        prompt: "=> "
      });

      logger.info({ accountId, sessionId: session.id }, "Web access session established");

      await auditLogService.createAuditLog({
        ...auditLogInfo,
        orgId,
        projectId,
        event: {
          type: EventType.PAM_ACCOUNT_ACCESS,
          metadata: {
            accountId,
            resourceName,
            accountName,
            duration: expiresAt.toISOString()
          }
        }
      });

      // 9. SET UP HANDLERS

      // WebSocket keep-alive to survive ALB idle timeout (default 60s)
      let isAlive = true;

      socket.on("pong", () => {
        isAlive = true;
      });

      pingInterval = setInterval(() => {
        if (!isAlive) {
          // Client didn't respond to last ping — connection is dead
          socket.terminate();
          return;
        }
        isAlive = false;
        if (socket.readyState === socket.OPEN) {
          socket.ping();
        }
      }, WS_PING_INTERVAL_MS);

      // Sequential message processing to prevent concurrent query issues
      let processingPromise = Promise.resolve();

      socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
        processingPromise = processingPromise
          .then(async () => {
            if (cleanedUp) return;

            let data: string;
            if (Buffer.isBuffer(rawData)) {
              data = rawData.toString();
            } else if (Array.isArray(rawData)) {
              data = Buffer.concat(rawData).toString();
            } else {
              data = Buffer.from(rawData).toString();
            }

            let parsed: unknown;
            try {
              parsed = JSON.parse(data);
            } catch {
              sendMessage(socket, {
                type: WsMessageType.Output,
                data: "Invalid message format\n",
                prompt: repl.getPrompt()
              });
              return;
            }
            const result = WebSocketClientMessageSchema.safeParse(parsed);
            if (!result.success) {
              sendMessage(socket, {
                type: WsMessageType.Output,
                data: "Invalid message format\n",
                prompt: repl.getPrompt()
              });
              return;
            }

            const message = result.data;

            // Control messages
            if (message.type === WsMessageType.Control) {
              if (message.data === "quit") {
                sendSessionEnd(socket, SessionEndReason.UserQuit);
                void cleanup();
                socket.close();
                return;
              }
              if (message.data === "clear-buffer") {
                repl.clearBuffer();
                // No response — frontend already writes ^C and prompt locally
                return;
              }
              return;
            }

            // User input
            if (message.type === WsMessageType.Input) {
              const replResult = await repl.processInput(message.data);

              if (replResult.shouldClose) {
                sendSessionEnd(socket, SessionEndReason.UserQuit);
                void cleanup();
                socket.close();
                return;
              }

              sendMessage(socket, {
                type: WsMessageType.Output,
                data: replResult.output,
                prompt: replResult.prompt
              });
            }
          })
          .catch((err) => {
            logger.error(err, "Error processing message");
            if (!cleanedUp) {
              sendMessage(socket, {
                type: WsMessageType.Output,
                data: "Internal error\n",
                prompt: "=> "
              });
            }
          });
      });

      // Tunnel drop detection
      // The gateway cert expires on the gateway's clock, which may be slightly
      // ahead of ours (clock skew). A 30s tolerance lets us correctly attribute
      // tunnel teardowns near session end as normal completion rather than errors.
      const isNearSessionExpiry = () => Date.now() >= expiresAt.getTime() - 30_000;

      pgClient.on("error", (err) => {
        logger.error(err, "Database connection error");
        if (!cleanedUp) {
          if (isNearSessionExpiry()) {
            sendSessionEnd(socket, SessionEndReason.SessionCompleted);
          } else {
            sendSessionEnd(socket, SessionEndReason.ConnectionLost);
          }
          void cleanup();
          socket.close();
        }
      });

      pgClient.on("end", () => {
        if (!cleanedUp) {
          if (isNearSessionExpiry()) {
            sendSessionEnd(socket, SessionEndReason.SessionCompleted);
          } else {
            sendSessionEnd(socket, SessionEndReason.ConnectionLost);
          }
          void cleanup();
          socket.close();
        }
      });

      // Session expiry timer
      expiryTimer = setTimeout(() => {
        if (!cleanedUp) {
          sendSessionEnd(socket, SessionEndReason.SessionCompleted);
          void cleanup();
          socket.close();
        }
      }, DEFAULT_WEB_SESSION_DURATION_MS);

      // WebSocket close/error
      socket.on("close", () => {
        logger.info({ accountId, sessionId: session?.id }, "WebSocket connection closed");
        void cleanup();
      });

      socket.on("error", (err: Error) => {
        logger.error(err, "WebSocket error");
        void cleanup();
      });
    } catch (err) {
      logger.error(err, "Failed to establish web access session");
      sendSessionEnd(socket, SessionEndReason.SetupFailed);
      await cleanup();
      socket.close();
    }
  };

  return {
    issueWebSocketTicket,
    handleWebSocketConnection
  };
};
