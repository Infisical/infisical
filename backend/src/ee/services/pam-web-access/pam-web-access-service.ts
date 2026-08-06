import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";

import type WebSocket from "ws";

import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import { enforceMfa } from "@app/ee/services/pam/pam-mfa";
import { resolveAccessControls } from "@app/ee/services/pam/pam-policies";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ResourcePermissionPamResourceActions } from "@app/ee/services/permission/resource-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
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
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamAccessMethod, PamSessionEndReason, PamSessionStatus } from "../pam/pam-enums";
import { checkAccountAccess } from "../pam/pam-permission";
import { TPamAccessRequestServiceFactory } from "../pam-access-request/pam-access-request-service";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import {
  extractGatewayTarget,
  getAccountAccessibilityIssues,
  PamAccountAccessibilityIssue,
  resolveSelectedHost
} from "../pam-account/pam-account-schemas";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { reportPamSessionEnded } from "../pam-session/pam-session-fns";
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
  pamAccessRequestService: Pick<TPamAccessRequestServiceFactory, "checkGrant">;
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
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
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
  selectedHost?: string | null;
  preAuthMessages: TEarlyBufferedMsg[];
  preAuthHandler: (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void;
};

type TGatewayCertificates = {
  clientCertificate: string;
  clientPrivateKey: string;
  serverCertificateChain: string;
};

type THttpProxySession = {
  sessionId: string;
  expiresAt: number;
  relayHost: string;
  relay: TGatewayCertificates;
  gateway: TGatewayCertificates;
  relayServer: Awaited<ReturnType<typeof setupRelayServer>>;
  agent: http.Agent;
  expiryTimer: ReturnType<typeof setTimeout>;
};

type TRegisterHttpProxySessionDTO = {
  sessionId: string;
  sessionDurationMs: number;
  relayHost: string;
  relay: TGatewayCertificates;
  gateway: TGatewayCertificates;
};

type TProxyHttpRequestDTO = {
  token: string;
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body?: Buffer;
};

const MAX_HTTP_PROXY_RESPONSE_BYTES = 16 * 1024 * 1024;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
const SENSITIVE_REQUEST_HEADERS = new Set(["authorization", "cookie", "origin", "referer"]);
const UNSAFE_RESPONSE_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-security-policy",
  "set-cookie",
  "x-frame-options"
]);

export const pamWebAccessServiceFactory = ({
  pamAccountDAL,
  pamAccessRequestService,
  permissionService,
  auditLogService,
  tokenService,
  pamSessionDAL,
  gatewayV2Service,
  gatewayPoolService,
  kmsService,
  userDAL,
  mfaSessionService,
  orgDAL,
  telemetryService
}: TPamWebAccessServiceFactoryDep) => {
  const httpProxySessions = new Map<string, THttpProxySession>();

  const decrypt = async (projectId: string, blob: Buffer): Promise<Record<string, unknown>> => {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    return JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf-8")) as Record<string, unknown>;
  };

  const cleanupHttpProxySession = async (token: string) => {
    const proxySession = httpProxySessions.get(token);
    if (!proxySession) return;

    httpProxySessions.delete(token);
    clearTimeout(proxySession.expiryTimer);
    proxySession.agent.destroy();
    await proxySession.relayServer.cleanup();

    let relayConnection: net.Socket | null = null;
    try {
      relayConnection = await createRelayConnection({
        relayHost: proxySession.relayHost,
        clientCertificate: proxySession.relay.clientCertificate,
        clientPrivateKey: proxySession.relay.clientPrivateKey,
        serverCertificateChain: proxySession.relay.serverCertificateChain
      });
      const cancellationConnection = await createGatewayConnection(
        relayConnection,
        proxySession.gateway,
        GatewayProxyProtocol.PamSessionCancellation
      );
      cancellationConnection.end();
    } catch (err) {
      logger.debug(err, "Web application session cancellation signal failed");
    } finally {
      relayConnection?.destroy();
    }
  };

  const registerHttpProxySession = async ({
    sessionId,
    sessionDurationMs,
    relayHost,
    relay,
    gateway
  }: TRegisterHttpProxySessionDTO) => {
    const relayServer = await setupRelayServer({
      protocol: GatewayProxyProtocol.Pam,
      relayHost,
      relay,
      gateway,
      longLived: true
    });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + sessionDurationMs;
    const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });
    const expiryTimer = setTimeout(() => {
      void cleanupHttpProxySession(token);
    }, sessionDurationMs);
    expiryTimer.unref();

    httpProxySessions.set(token, {
      sessionId,
      expiresAt,
      relayHost,
      relay,
      gateway,
      relayServer,
      agent,
      expiryTimer
    });

    return { token, sessionId, expiresAt: new Date(expiresAt) };
  };

  const proxyHttpRequest = async ({ token, method, path, headers, body }: TProxyHttpRequestDTO) => {
    const proxySession = httpProxySessions.get(token);
    if (!proxySession || proxySession.expiresAt <= Date.now()) {
      if (proxySession) void cleanupHttpProxySession(token);
      throw new NotFoundError({ message: "Web application session not found or expired" });
    }

    const forwardedHeaders: http.OutgoingHttpHeaders = {};
    Object.entries(headers).forEach(([name, value]) => {
      const normalizedName = name.toLowerCase();
      if (
        value !== undefined &&
        normalizedName !== "host" &&
        normalizedName !== "content-length" &&
        !HOP_BY_HOP_HEADERS.has(normalizedName) &&
        !SENSITIVE_REQUEST_HEADERS.has(normalizedName)
      ) {
        forwardedHeaders[name] = value;
      }
    });
    if (body) forwardedHeaders["content-length"] = body.byteLength;

    return new Promise<{
      statusCode: number;
      headers: http.IncomingHttpHeaders;
      body: Buffer;
      sessionId: string;
    }>((resolve, reject) => {
      const request = http.request(
        {
          host: "127.0.0.1",
          port: proxySession.relayServer.port,
          method,
          path,
          headers: forwardedHeaders,
          agent: proxySession.agent
        },
        (response) => {
          const chunks: Buffer[] = [];
          let totalBytes = 0;
          response.on("data", (chunk: Buffer) => {
            totalBytes += chunk.byteLength;
            if (totalBytes > MAX_HTTP_PROXY_RESPONSE_BYTES) {
              response.destroy(new Error("Internal web application response exceeds the 16 MB demo limit"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            const responseHeaders: http.IncomingHttpHeaders = {};
            Object.entries(response.headers).forEach(([name, value]) => {
              if (value !== undefined && !UNSAFE_RESPONSE_HEADERS.has(name.toLowerCase())) {
                responseHeaders[name] = value;
              }
            });
            resolve({
              statusCode: response.statusCode ?? 502,
              headers: responseHeaders,
              body: Buffer.concat(chunks),
              sessionId: proxySession.sessionId
            });
          });
          response.on("error", (err) => {
            logger.error({ err, sessionId: proxySession.sessionId }, "Internal web application response failed");
            reject(
              new BadRequestError({
                message: err.message.includes("16 MB")
                  ? "The internal web application response exceeds the 16 MB demo limit"
                  : "The internal web application response was interrupted"
              })
            );
          });
        }
      );
      request.on("error", (err) => {
        logger.error({ err, sessionId: proxySession.sessionId }, "Internal web application request failed");
        reject(new BadRequestError({ message: "Unable to reach the internal web application through the Gateway" }));
      });
      request.setTimeout(30_000, () => request.destroy(new Error("Internal web application request timed out")));
      if (body) request.write(body);
      request.end();
    });
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

  const enforceRecordingConfig = (account: Parameters<typeof getAccountAccessibilityIssues>[0]) => {
    const issues = getAccountAccessibilityIssues(account);
    if (issues.includes(PamAccountAccessibilityIssue.NoRecordingConfig)) {
      throw new BadRequestError({
        message: "S3 recording must be configured before launching this account"
      });
    }
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
    mfaSessionId,
    selectedHost
  }: TIssueWebSocketTicketDTO) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    if (!SESSION_HANDLERS[account.accountType as PamAccountType] && account.accountType !== PamAccountType.Web) {
      throw new BadRequestError({ message: "Web access is not supported for this account type" });
    }

    const policy = resolveAccessControls(account.templatePolicies);
    const { requiresApproval } = policy;

    // Approval is a layer on top of standing access: gated accounts require LaunchSessions AND an
    // approved grant, so losing LaunchSessions blocks launch even while a grant is still active.
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

    let grantRemainingMs: number | null = null;
    if (requiresApproval) {
      const grant = await pamAccessRequestService.checkGrant({
        userId: actor.id,
        accountId,
        accountFolderId: account.folderId,
        projectId
      });
      if (!grant) {
        throw new ForbiddenRequestError({ name: "PAM_APPROVAL_REQUIRED", message: "Access request required" });
      }
      // A null expiresAt means a never-expiring grant per the checkGrant contract
      if (grant.expiresAt) {
        grantRemainingMs = new Date(grant.expiresAt).getTime() - Date.now();
        if (grantRemainingMs <= 0) {
          throw new ForbiddenRequestError({ name: "PAM_GRANT_EXPIRED", message: "Your approved access has expired" });
        }
      }
    }

    enforceRecordingConfig(account);

    const connectionDetails = await decrypt(projectId, account.encryptedConnectionDetails);
    const resolvedHost = resolveSelectedHost(account.accountType as PamAccountType, connectionDetails, selectedHost);

    const trimmedReason = reason?.trim() || null;

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

    let maxSessionDurationMs = policy.maxSessionDurationSeconds
      ? policy.maxSessionDurationSeconds * 1000
      : DEFAULT_WEB_SESSION_DURATION_MS;
    if (grantRemainingMs !== null) {
      maxSessionDurationMs = Math.min(maxSessionDurationMs, grantRemainingMs);
    }

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
        maxSessionDurationMs,
        selectedHost: resolvedHost
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
    selectedHost,
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

            void reportPamSessionEnded({
              session: updated,
              orgId,
              endReason: PamSessionEndReason.Completed,
              telemetryService,
              userDAL
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

      const handlerEntry = SESSION_HANDLERS[account.accountType as PamAccountType];
      if (!handlerEntry) {
        throw new BadRequestError({ message: "Web access is not supported for this account type" });
      }

      enforceRecordingConfig(account);

      // The single-use ticket outlives its issuance check by up to 30s, so a grant revoked in the
      // meantime must be caught here; the revoke-time session sweep can't see sessions that don't
      // exist yet.
      const { requiresApproval } = resolveAccessControls(account.templatePolicies);
      let sessionDurationCapMs = policyDurationMs || DEFAULT_WEB_SESSION_DURATION_MS;
      if (requiresApproval) {
        const grant = await pamAccessRequestService.checkGrant({
          userId,
          accountId,
          accountFolderId: account.folderId,
          projectId
        });
        if (!grant) {
          sendMessage(socket, {
            type: TerminalServerMessageType.Output,
            data: `${SessionEndReason.ApprovalRevoked}\n`
          });
          sendSessionEndAndClose(socket, SessionEndReason.ApprovalRevoked);
          return;
        }
        if (grant.expiresAt) {
          const grantRemainingMs = new Date(grant.expiresAt).getTime() - Date.now();
          if (grantRemainingMs <= 0) {
            sendMessage(socket, {
              type: TerminalServerMessageType.Output,
              data: `${SessionEndReason.ApprovalRevoked}\n`
            });
            sendSessionEndAndClose(socket, SessionEndReason.ApprovalRevoked);
            return;
          }
          sessionDurationCapMs = Math.min(sessionDurationCapMs, grantRemainingMs);
        }
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
      const targetHost = selectedHost || gatewayTarget.host;
      const credentials = await decrypt(projectId, account.encryptedCredentials);

      const user = await userDAL.findById(userId);
      const sessionDurationMs = sessionDurationCapMs;
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
        selectedHost: targetHost
      });

      const certs = await gatewayV2Service.getPAMConnectionDetails({
        gatewayId: effectiveGatewayId,
        sessionId: session.id,
        accountType: handlerEntry.gatewayAccountType,
        host: targetHost,
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

      const isRdp = account.accountType === PamAccountType.Windows || account.accountType === PamAccountType.WindowsAd;

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
    handleWebSocketConnection,
    registerHttpProxySession,
    proxyHttpRequest,
    cleanupHttpProxySession
  };
};
