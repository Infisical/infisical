import net from "node:net";

import type WebSocket from "ws";

import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import { enforceMfa } from "@app/ee/services/pam/pam-mfa";
import { resolveAccessControls } from "@app/ee/services/pam/pam-policies";
import { PamTemplateAccessPolicySchema } from "@app/ee/services/pam-account-template/pam-account-template-schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ResourcePermissionPamResourceActions } from "@app/ee/services/permission/resource-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection, setupRelayServer } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamAccessMethod, PamSessionStatus } from "../pam/pam-enums";
import { checkAccountAccess } from "../pam/pam-permission";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { extractGatewayTarget } from "../pam-account/pam-account-schemas";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { SESSION_HANDLERS } from "./pam-session-handlers";
import {
  DEFAULT_WEB_SESSION_DURATION_MS,
  MAX_WEB_SESSIONS_PER_USER,
  SessionEndReason,
  TEarlyBufferedMsg,
  TerminalServerMessageType,
  TIssueWebSocketTicketDTO,
  TSessionContext,
  TSessionHandlerResult,
  TWebSocketServerMessage,
  WebSocketServerMessageSchema,
  WS_IDLE_TIMEOUT_MS,
  WS_PING_INTERVAL_MS
} from "./pam-web-access-types";

type TPamWebAccessServiceFactoryDep = {
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails">;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  pamSessionDAL: Pick<
    TPamSessionDALFactory,
    "create" | "endSessionById" | "activateSession" | "countActiveWebSessions" | "endExpiredWebSessions"
  >;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userDAL: Pick<TUserDALFactory, "findById">;
  mfaSessionService: Pick<
    TMfaSessionServiceFactory,
    "createMfaSession" | "getMfaSession" | "deleteMfaSession" | "sendMfaCode"
  >;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
};

export type TPamWebAccessServiceFactory = ReturnType<typeof pamWebAccessServiceFactory>;

type THandleWebSocketConnectionDTO = {
  socket: WebSocket;
  accountId: string;
  projectId: string;
  orgId: string;
  accountName: string;
  auditLogInfo: AuditLogInfo;
  userId: string;
  actorEmail: string;
  actorName: string;
  actorIp: string;
  actorUserAgent: string;
  reason: string | null | undefined;
  maxSessionDurationMs?: number;
  preAuthMessages: TEarlyBufferedMsg[];
  preAuthHandler: (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void;
};

export const pamWebAccessServiceFactory = ({
  pamAccountDAL,
  permissionService,
  auditLogService,
  tokenService,
  pamSessionDAL,
  gatewayV2Service,
  gatewayPoolService,
  kmsService,
  userDAL,
  mfaSessionService,
  orgDAL
}: TPamWebAccessServiceFactoryDep) => {
  const decrypt = async (projectId: string, blob: Buffer): Promise<Record<string, unknown>> => {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    return JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf-8")) as Record<string, unknown>;
  };

  const sendMessage = (socket: WebSocket, message: TWebSocketServerMessage): void => {
    try {
      if (socket.readyState === socket.OPEN) {
        const parsed = WebSocketServerMessageSchema.parse(message);
        socket.send(JSON.stringify(parsed));
      }
    } catch (err) {
      logger.error(err, "Failed to send WebSocket message");
    }
  };

  const sendSessionEndAndClose = (socket: WebSocket, reason: SessionEndReason): void => {
    try {
      if (socket.readyState === socket.OPEN) {
        const parsed = WebSocketServerMessageSchema.parse({ type: TerminalServerMessageType.SessionEnd, reason });
        socket.send(JSON.stringify(parsed), () => {
          socket.close();
        });
        return;
      }
    } catch (err) {
      logger.error(err, "Failed to send session end message");
    }
    socket.close();
  };

  const issueWebSocketTicket = async ({
    accountId,
    projectId,
    orgId,
    actor,
    actorEmail,
    actorName,
    auditLogInfo,
    reason,
    mfaSessionId
  }: TIssueWebSocketTicketDTO) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    if (!SESSION_HANDLERS[account.accountType as PamAccountType]) {
      throw new BadRequestError({ message: "Web access is not supported for this account type" });
    }

    await checkAccountAccess(
      permissionService,
      accountId,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.LaunchSessions,
      {
        actorId: actor.id,
        actor: actor.type,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod
      }
    );

    const trimmedReason = reason?.trim() || null;

    const policy = resolveAccessControls(account.templatePolicies);

    if (policy.requireReason && !trimmedReason) {
      throw new BadRequestError({
        name: "PAM_REASON_REQUIRED",
        message: "A reason is required to access this account"
      });
    }

    if (policy.requireMfa) {
      await enforceMfa(
        { mfaSessionService, orgDAL, userDAL },
        { userId: actor.id, orgId: actor.orgId, actorEmail, accountId: account.id, mfaSessionId }
      );
    }

    const maxSessionDurationMs = policy.maxSessionDurationSeconds
      ? policy.maxSessionDurationSeconds * 1000
      : DEFAULT_WEB_SESSION_DURATION_MS;

    await pamSessionDAL.endExpiredWebSessions(actor.id, projectId);
    const activeCount = await pamSessionDAL.countActiveWebSessions(actor.id, projectId);
    if (activeCount >= MAX_WEB_SESSIONS_PER_USER) {
      throw new BadRequestError({
        message: `You have reached the maximum of ${MAX_WEB_SESSIONS_PER_USER} active web access sessions. Close an existing session and try again.`
      });
    }

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_PAM_WS_TICKET,
      userId: actor.id,
      payload: JSON.stringify({
        accountId,
        projectId,
        orgId,
        accountName: account.name,
        accountType: account.accountType,
        actorEmail,
        actorName,
        auditLogInfo,
        reason: trimmedReason,
        maxSessionDurationMs
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
          resourceName: account.name,
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
    accountName,
    auditLogInfo,
    userId,
    actorEmail,
    actorName,
    actorIp,
    actorUserAgent,
    reason: accessReason,
    maxSessionDurationMs: policyDurationMs,
    preAuthMessages,
    preAuthHandler
  }: THandleWebSocketConnectionDTO): Promise<void> => {
    const earlyMessages: TEarlyBufferedMsg[] = preAuthMessages;
    const releaseEarlyBuffer = () => {
      socket.off("message", preAuthHandler);
    };

    let session: { id: string; accountId?: string | null } | null = null;
    let cleanedUp = false;
    let handlerResult: TSessionHandlerResult | null = null;
    let relayServer: { port: number; cleanup: () => Promise<void> } | null = null;
    let relayCerts: {
      relay: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
      gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
      relayHost: string;
    } | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = async () => {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }

      if (handlerResult) {
        try {
          await handlerResult.cleanup();
        } catch (err) {
          logger.debug(err, "Error in handler cleanup");
        } finally {
          handlerResult = null;
        }
      }

      if (relayServer) {
        try {
          await relayServer.cleanup();
        } catch (err) {
          logger.debug(err, "Error closing relay server");
        } finally {
          relayServer = null;
        }
      }

      if (session) {
        const sessionId = session.id;
        try {
          const updated = await pamSessionDAL.endSessionById(sessionId);
          if (updated) {
            await auditLogService.createAuditLog({
              ...auditLogInfo,
              orgId,
              projectId,
              event: {
                type: EventType.PAM_SESSION_END,
                metadata: { sessionId, accountId: session.accountId ?? undefined, accountName }
              }
            });
          }
        } catch (err) {
          logger.error(err, `Failed to end session in DB [sessionId=${sessionId}]`);
        } finally {
          session = null;
        }
      }

      if (relayCerts) {
        const certs = relayCerts;
        relayCerts = null;
        void (async () => {
          let relayConn: net.Socket | null = null;
          try {
            relayConn = await createRelayConnection({
              relayHost: certs.relayHost,
              clientCertificate: certs.relay.clientCertificate,
              clientPrivateKey: certs.relay.clientPrivateKey,
              serverCertificateChain: certs.relay.serverCertificateChain
            });
            const cancelConn = await createGatewayConnection(
              relayConn,
              certs.gateway,
              GatewayProxyProtocol.PamSessionCancellation
            );
            cancelConn.end();
          } catch (err) {
            logger.debug(err, "Session cancellation signal failed (best-effort)");
          } finally {
            relayConn?.destroy();
          }
        })();
      }

      cleanedUp = true;
    };

    try {
      const account = await pamAccountDAL.findByIdWithDetails(accountId);
      if (!account || account.projectId !== projectId) {
        throw new BadRequestError({ message: "Invalid account or project" });
      }

<<<<<<< HEAD
      const handlerEntry = SESSION_HANDLERS[account.accountType];
=======
      const handlerEntry = SESSION_HANDLERS[account.accountType as PamAccountType];
>>>>>>> 64c8bcdcd0 (refactor(pam): remove resolveAccountType and resolvePamAccountType identity functions)
      if (!handlerEntry) {
        throw new BadRequestError({ message: "Web access is not supported for this account type" });
      }

      const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
        gatewayId: account.gatewayId ?? account.templateGatewayId,
        gatewayPoolId: account.gatewayPoolId ?? account.templateGatewayPoolId
      });
      if (!effectiveGatewayId) {
        throw new BadRequestError({ message: "Gateway not configured for this account" });
      }

      await pamSessionDAL.endExpiredWebSessions(userId, projectId);
      const activeCount = await pamSessionDAL.countActiveWebSessions(userId, projectId);
      if (activeCount >= MAX_WEB_SESSIONS_PER_USER) {
        sendMessage(socket, {
          type: TerminalServerMessageType.Output,
          data: `${SessionEndReason.SessionLimitReached}\n`
        });
        sendSessionEndAndClose(socket, SessionEndReason.SessionLimitReached);
        return;
      }

      const rawConnectionDetails = await decrypt(projectId, account.encryptedConnectionDetails);
      const gatewayTarget = await extractGatewayTarget(account.accountType as PamAccountType, rawConnectionDetails);
      const credentials = await decrypt(projectId, account.encryptedCredentials);

      const user = await userDAL.findById(userId);
      const sessionDurationMs = policyDurationMs || DEFAULT_WEB_SESSION_DURATION_MS;
      const expiresAt = new Date(Date.now() + sessionDurationMs);

      session = await pamSessionDAL.create({
        status: PamSessionStatus.Starting,
        accessMethod: PamAccessMethod.Web,
        expiresAt,
        accountName,
        accountType: account.accountType,
        actorEmail,
        actorIp,
        actorName,
        actorUserAgent,
        projectId,
        accountId: account.id,
        userId,
        gatewayId: effectiveGatewayId,
        reason: accessReason?.trim() || null,
        folderName: account.folderName,
        selectedHost: gatewayTarget.host
      });

      const certs = await gatewayV2Service.getPAMConnectionDetails({
        gatewayId: effectiveGatewayId,
        sessionId: session.id,
        accountType: handlerEntry.gatewayAccountType,
        host: gatewayTarget.host,
        port: gatewayTarget.port,
        duration: sessionDurationMs,
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

      const isRdp = account.accountType === PamAccountType.Windows;

      relayServer = await setupRelayServer({
        protocol: isRdp ? GatewayProxyProtocol.PamRdpBrowser : GatewayProxyProtocol.Pam,
        relayHost: certs.relayHost,
        relay: certs.relay,
        gateway: certs.gateway,
        longLived: true
      });

      const isNearSessionExpiry = () => Date.now() >= expiresAt.getTime() - 30_000;

      const boundSendMessage = (msg: TWebSocketServerMessage) => sendMessage(socket, msg);
      const boundSendSessionEnd = (reason: SessionEndReason) =>
        sendMessage(socket, { type: TerminalServerMessageType.SessionEnd, reason });
      const handlerCleanup = () => {
        if (!cleanedUp) void cleanup();
      };

      const ctx: TSessionContext = {
        socket,
        relayPort: relayServer.port,
        resourceName: account.name,
        sessionId: session.id,
        sendMessage: boundSendMessage,
        sendSessionEnd: boundSendSessionEnd,
        isNearSessionExpiry,
        onCleanup: handlerCleanup,
        earlyMessages,
        releaseEarlyBuffer
      };

      try {
        handlerResult = await handlerEntry.handler(ctx, {
          connectionDetails: rawConnectionDetails,
          credentials
        });
      } finally {
        releaseEarlyBuffer();
      }

      // RDP sessions are activated by the gateway after credential exchange,
      // not by the web access service.
      if (!isRdp) {
        await pamSessionDAL.activateSession(session.id);
      }

      logger.info({ accountId, sessionId: session.id }, "Web access session established");

      await auditLogService.createAuditLog({
        ...auditLogInfo,
        orgId,
        projectId,
        event: {
          type: EventType.PAM_ACCOUNT_ACCESS,
          metadata: {
            accountId,
            resourceName: account.name,
            accountName,
            duration: expiresAt.toISOString(),
            reason: accessReason ?? undefined
          }
        }
      });

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (!cleanedUp) {
            void cleanup();
            sendSessionEndAndClose(socket, SessionEndReason.IdleTimeout);
          }
        }, WS_IDLE_TIMEOUT_MS);
      };

      resetIdleTimer();

      let isAlive = true;

      socket.on("pong", () => {
        isAlive = true;
      });

      pingInterval = setInterval(() => {
        if (!isAlive) {
          socket.terminate();
          return;
        }
        isAlive = false;
        if (socket.readyState === socket.OPEN) {
          socket.ping();
        }
      }, WS_PING_INTERVAL_MS);

      socket.on("message", () => {
        resetIdleTimer();
      });

      expiryTimer = setTimeout(() => {
        if (!cleanedUp) {
          void cleanup();
          sendSessionEndAndClose(socket, SessionEndReason.SessionCompleted);
        }
      }, sessionDurationMs);

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
      await cleanup();
      sendSessionEndAndClose(socket, SessionEndReason.SetupFailed);
    }
  };

  return {
    issueWebSocketTicket,
    handleWebSocketConnection
  };
};
