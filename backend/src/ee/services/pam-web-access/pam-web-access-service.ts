import { randomBytes } from "node:crypto";
import http, { IncomingHttpHeaders } from "node:http";
import https from "node:https";
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
import { getConfig } from "@app/lib/config/env";
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
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamAccessMethod, PamSessionStatus } from "../pam/pam-enums";
import { checkAccountAccess } from "../pam/pam-permission";
import { TPamAccessRequestServiceFactory } from "../pam-access-request/pam-access-request-service";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import {
  extractGatewayTarget,
  getAccountAccessibilityIssues,
  PamAccountAccessibilityIssue,
  parseWebResourceUrl,
  resolveSelectedHost
} from "../pam-account/pam-account-schemas";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { TPamSessionExpirationServiceFactory } from "../pam-session/pam-session-expiration-queue";
import { TPamSessionChunkServiceFactory } from "../pam-session-recording/pam-recording-chunk-service";
import { decryptSessionKey, generateSessionRecordingSecrets } from "../pam-session-recording/pam-recording-secrets";
import { SESSION_HANDLERS } from "./pam-session-handlers";
import {
  assertWebResourceSessionCanProxy,
  buildUpstreamHeaders,
  buildUpstreamPath,
  createWebResourceSessionToken,
  filterResponseHeaders,
  getWebResourceProxyPrefix,
  getWebResourceTokenCookieName,
  headerValueToString,
  rewriteProxyHtml,
  type TWebResourceProxyContext,
  verifyWebResourceSessionToken,
  WEB_RESOURCE_BODY_LIMIT_BYTES,
  WEB_RESOURCE_RESPONSE_LIMIT_BYTES,
  WEB_RESOURCE_TOKEN_QUERY_PARAM
} from "./pam-web-resource-proxy-fns";
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
    | "create"
    | "findById"
    | "updateById"
    | "endSessionById"
    | "activateSession"
    | "countActiveWebSessions"
    | "endExpiredWebSessions"
  >;
  pamSessionChunkService: Pick<TPamSessionChunkServiceFactory, "recordInternalChunk">;
  pamSessionExpirationService: Pick<TPamSessionExpirationServiceFactory, "scheduleSessionExpiration">;
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
  selectedHost?: string | null;
  preAuthMessages: TEarlyBufferedMsg[];
  preAuthHandler: (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void;
};

type TLaunchWebResourceSessionDTO = {
  accountId: string;
  projectId: string;
  orgId: string;
  actor: TIssueWebSocketTicketDTO["actor"];
  actorEmail: string;
  actorName: string;
  actorIp: string;
  actorUserAgent: string;
  auditLogInfo: AuditLogInfo;
  reason?: string;
  mfaSessionId?: string;
};

type TProxyWebResourceRequestDTO = {
  accountId: string;
  sessionId: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  headers: IncomingHttpHeaders;
  body?: unknown;
  cookieToken?: string;
};

type TWebResourceProxyResponse = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
  setCookie?: {
    name: string;
    value: string;
    path: string;
    expires: Date;
  };
};

export const pamWebAccessServiceFactory = ({
  pamAccountDAL,
  pamAccessRequestService,
  permissionService,
  auditLogService,
  tokenService,
  pamSessionDAL,
  pamSessionChunkService,
  pamSessionExpirationService,
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

  const enforceRecordingConfig = (account: Parameters<typeof getAccountAccessibilityIssues>[0]) => {
    const issues = getAccountAccessibilityIssues(account);
    if (issues.includes(PamAccountAccessibilityIssue.NoRecordingConfig)) {
      throw new BadRequestError({
        message: "S3 recording must be configured before launching this account"
      });
    }
  };

  const appCfg = getConfig();

  const serializeProxyBody = (body: unknown, headers: IncomingHttpHeaders): Buffer | undefined => {
    if (body === undefined || body === null) return undefined;
    if (Buffer.isBuffer(body)) return body;
    if (typeof body === "string") return Buffer.from(body);

    const contentType = headerValueToString(headers["content-type"])?.toLowerCase() ?? "";
    if (contentType.includes("application/x-www-form-urlencoded") && typeof body === "object") {
      const params = new URLSearchParams();
      Object.entries(body as Record<string, unknown>).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item) => params.append(key, String(item)));
          return;
        }
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      return Buffer.from(params.toString());
    }

    if (contentType.includes("application/json")) {
      return Buffer.from(JSON.stringify(body));
    }

    if (typeof body === "object") {
      return Buffer.from(JSON.stringify(body));
    }

    return Buffer.from(String(body));
  };

  const requestUpstream = async ({
    target,
    relayPort,
    method,
    upstreamPath,
    headers,
    body
  }: {
    target: Pick<TWebResourceProxyContext, "scheme" | "host">;
    relayPort: number;
    method: string;
    upstreamPath: string;
    headers: http.OutgoingHttpHeaders;
    body?: Buffer;
  }) =>
    new Promise<{
      statusCode: number;
      headers: IncomingHttpHeaders;
      body: Buffer;
    }>((resolve, reject) => {
      const requestOptions: http.RequestOptions | https.RequestOptions = {
        host: "127.0.0.1",
        port: relayPort,
        method,
        path: upstreamPath,
        headers
      };

      if (target.scheme === "https") {
        (requestOptions as https.RequestOptions).servername = target.host;
      }

      const transport = target.scheme === "https" ? https : http;
      const req = transport.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        res.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > WEB_RESOURCE_RESPONSE_LIMIT_BYTES) {
            req.destroy(new BadRequestError({ message: "Web resource response is too large" }));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 502,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      });

      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });

  const recordWebResourceEvents = async ({
    sessionId,
    sessionKey,
    events,
    endElapsedMs
  }: {
    sessionId: string;
    sessionKey: Buffer;
    events: unknown[];
    endElapsedMs: number;
  }) => {
    try {
      await pamSessionChunkService.recordInternalChunk({
        sessionId,
        startElapsedMs: Math.max(0, endElapsedMs - 1),
        endElapsedMs,
        sessionKey,
        events
      });
    } catch (err) {
      logger.warn(err, "Failed to record web resource timeline chunk");
    }
  };

  const launchWebResourceSession = async ({
    accountId,
    projectId,
    orgId,
    actor,
    actorEmail,
    actorName,
    actorIp,
    actorUserAgent,
    auditLogInfo,
    reason,
    mfaSessionId
  }: TLaunchWebResourceSessionDTO) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    if (account.accountType !== PamAccountType.WebResource) {
      throw new BadRequestError({ message: "Web resource sessions are only supported for web-resource accounts" });
    }

    const policy = resolveAccessControls(account.templatePolicies);
    const { requiresApproval } = policy;

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
      if (grant.expiresAt) {
        grantRemainingMs = new Date(grant.expiresAt).getTime() - Date.now();
        if (grantRemainingMs <= 0) {
          throw new ForbiddenRequestError({ name: "PAM_GRANT_EXPIRED", message: "Your approved access has expired" });
        }
      }
    }

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

    let sessionDurationMs = policy.maxSessionDurationSeconds
      ? policy.maxSessionDurationSeconds * 1000
      : DEFAULT_WEB_SESSION_DURATION_MS;
    if (grantRemainingMs !== null) {
      sessionDurationMs = Math.min(sessionDurationMs, grantRemainingMs);
    }

    await pamSessionDAL.endExpiredWebSessions(actor.id, projectId);
    const activeCount = await pamSessionDAL.countActiveWebSessions(actor.id, projectId);
    if (activeCount >= MAX_WEB_SESSIONS_PER_USER) {
      throw new BadRequestError({
        message: `You have reached the maximum of ${MAX_WEB_SESSIONS_PER_USER} active web access sessions. Close an existing session and try again.`
      });
    }

    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: account.gatewayId ?? account.templateGatewayId,
      gatewayPoolId: account.gatewayPoolId ?? account.templateGatewayPoolId
    });
    if (!effectiveGatewayId) {
      throw new BadRequestError({ message: "Gateway not configured for this account" });
    }

    const rawConnectionDetails = await decrypt(projectId, account.encryptedConnectionDetails);
    const target = parseWebResourceUrl((rawConnectionDetails as { url: string }).url);
    const expiresAt = new Date(Date.now() + sessionDurationMs);

    const session = await pamSessionDAL.create({
      status: PamSessionStatus.Starting,
      accessMethod: PamAccessMethod.Web,
      expiresAt,
      accountName: account.name,
      accountType: account.accountType,
      actorEmail,
      actorIp,
      actorName,
      actorUserAgent,
      projectId,
      accountId: account.id,
      userId: actor.id,
      gatewayId: effectiveGatewayId,
      reason: trimmedReason,
      folderName: account.folderName,
      selectedHost: target.host
    });

    try {
      const secrets = await generateSessionRecordingSecrets({
        projectId,
        sessionId: session.id,
        kmsService
      });

      await pamSessionDAL.updateById(session.id, {
        encryptedSessionKey: secrets.encryptedSessionKey,
        gatewayUploadTokenHash: secrets.uploadTokenHash
      });

      await pamSessionDAL.activateSession(session.id);
      await pamSessionExpirationService.scheduleSessionExpiration(session.id, expiresAt);

      await auditLogService.createAuditLog({
        ...auditLogInfo,
        orgId,
        projectId,
        event: {
          type: EventType.PAM_ACCOUNT_ACCESS,
          metadata: {
            accountId,
            resourceName: account.name,
            accountName: account.name,
            duration: expiresAt.toISOString(),
            reason: trimmedReason ?? undefined
          }
        }
      });

      const token = createWebResourceSessionToken({
        authSecret: appCfg.AUTH_SECRET,
        sessionId: session.id,
        accountId,
        projectId,
        userId: actor.id,
        expiresAt
      });
      const proxyPrefix = getWebResourceProxyPrefix(accountId, session.id);

      return {
        sessionId: session.id,
        iframeUrl: `${proxyPrefix}?${WEB_RESOURCE_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`,
        expiresAt
      };
    } catch (err) {
      await pamSessionDAL.endSessionById(session.id);
      throw err;
    }
  };

  const proxyWebResourceRequest = async ({
    accountId,
    sessionId,
    method,
    path,
    query,
    headers,
    body,
    cookieToken
  }: TProxyWebResourceRequestDTO): Promise<TWebResourceProxyResponse> => {
    const queryToken =
      typeof query[WEB_RESOURCE_TOKEN_QUERY_PARAM] === "string" ? query[WEB_RESOURCE_TOKEN_QUERY_PARAM] : null;
    const presentedToken = queryToken || cookieToken;
    if (!presentedToken) {
      throw new ForbiddenRequestError({ message: "Invalid web resource session token" });
    }

    const tokenClaims = verifyWebResourceSessionToken({
      authSecret: appCfg.AUTH_SECRET,
      token: presentedToken,
      sessionId,
      accountId
    });

    const session = await pamSessionDAL.findById(sessionId);
    const sessionIsActive = assertWebResourceSessionCanProxy({
      session,
      accountId,
      sessionId,
      userId: tokenClaims.userId
    });
    if (!sessionIsActive) {
      await pamSessionDAL.endSessionById(sessionId);
      throw new BadRequestError({ message: "Web resource session has expired" });
    }

    if (!session || session.projectId !== tokenClaims.projectId || !session.gatewayId || !session.encryptedSessionKey) {
      throw new BadRequestError({ message: "Web resource session is not active" });
    }

    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.id !== session.accountId || account.projectId !== session.projectId) {
      throw new NotFoundError({ message: "Web resource account not found" });
    }

    const rawConnectionDetails = await decrypt(session.projectId, account.encryptedConnectionDetails);
    const target = parseWebResourceUrl((rawConnectionDetails as { url: string }).url);
    const proxyPrefix = getWebResourceProxyPrefix(accountId, sessionId);
    const proxyContext: TWebResourceProxyContext = { ...target, proxyPrefix };

    const sessionKey = await decryptSessionKey({
      projectId: session.projectId,
      sessionId,
      encryptedSessionKey: session.encryptedSessionKey,
      kmsService
    });

    const remainingMs = Math.max(1, new Date(session.expiresAt).getTime() - Date.now());
    const user = session.userId ? await userDAL.findById(session.userId) : null;
    const certs = await gatewayV2Service.getPAMConnectionDetails({
      gatewayId: session.gatewayId,
      sessionId,
      accountType: PamAccountType.WebResource,
      host: target.host,
      port: target.port,
      duration: remainingMs,
      actorMetadata: {
        id: tokenClaims.userId,
        type: ActorType.USER,
        name: user?.email ?? ""
      }
    });

    if (!certs) {
      throw new BadRequestError({ message: "Failed to obtain gateway connection details" });
    }

    const normalizedMethod = method.toUpperCase();
    if (!["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)) {
      throw new BadRequestError({ message: "Web resource proxy method is not supported" });
    }

    const requestBody = ["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)
      ? serializeProxyBody(body, headers)
      : undefined;
    if (requestBody && requestBody.length > WEB_RESOURCE_BODY_LIMIT_BYTES) {
      throw new BadRequestError({ message: "Web resource request body is too large" });
    }

    const upstreamPath = buildUpstreamPath(proxyContext, path, query);
    const upstreamHeaders = buildUpstreamHeaders(headers, target, requestBody);
    const requestId = randomBytes(8).toString("hex");
    const requestStartedAt = Date.now();

    const formFieldNames =
      headerValueToString(headers["content-type"])?.toLowerCase().includes("application/x-www-form-urlencoded") &&
      body &&
      typeof body === "object" &&
      !Buffer.isBuffer(body)
        ? Object.keys(body as Record<string, unknown>).sort()
        : undefined;

    const relayServer = await setupRelayServer({
      protocol: GatewayProxyProtocol.Tcp,
      relayHost: certs.relayHost,
      relay: certs.relay,
      gateway: certs.gateway
    });

    let upstream: Awaited<ReturnType<typeof requestUpstream>>;
    try {
      upstream = await requestUpstream({
        target,
        relayPort: relayServer.port,
        method: normalizedMethod,
        upstreamPath,
        headers: upstreamHeaders,
        body: requestBody
      });
    } finally {
      await relayServer.cleanup().catch((err) => {
        logger.debug(err, "Error closing web resource request relay server");
      });
    }

    let responseHeaders = filterResponseHeaders(upstream.headers, proxyContext);
    const responseBody = rewriteProxyHtml(upstream.body, responseHeaders, proxyContext);
    if (responseBody !== upstream.body) {
      responseHeaders = {
        ...responseHeaders,
        "content-length": String(responseBody.length)
      };
    }

    const sessionStartedAtMs = new Date(session.startedAt ?? session.createdAt).getTime();
    const elapsedMs = Date.now() - sessionStartedAtMs;
    void recordWebResourceEvents({
      sessionId,
      sessionKey,
      events: [
        {
          timestamp: new Date(requestStartedAt).toISOString(),
          requestId,
          eventType: "request",
          headers: {},
          method: normalizedMethod,
          url: upstreamPath,
          requestSize: requestBody?.length ?? 0,
          ...(formFieldNames ? { formFieldNames } : {})
        },
        {
          timestamp: new Date().toISOString(),
          requestId,
          eventType: "response",
          headers: {},
          status: String(upstream.statusCode),
          contentType: headerValueToString(upstream.headers["content-type"]) ?? "",
          responseSize: upstream.body.length
        }
      ],
      endElapsedMs: elapsedMs
    });

    return {
      statusCode: upstream.statusCode,
      headers: responseHeaders,
      body: responseBody,
      ...(queryToken
        ? {
            setCookie: {
              name: getWebResourceTokenCookieName(sessionId),
              value: presentedToken,
              path: proxyPrefix,
              expires: new Date(session.expiresAt)
            }
          }
        : {})
    };
  };

  const endWebResourceSession = async (
    sessionId: string,
    accountId: string,
    userId: string,
    orgId: string,
    auditLogInfo: AuditLogInfo
  ) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session || session.accountId !== accountId) {
      throw new NotFoundError({ message: "Web resource session not found" });
    }

    if (session.userId !== userId) {
      throw new ForbiddenRequestError({ message: "Invalid web resource session" });
    }

    if (session.accountType !== PamAccountType.WebResource || session.accessMethod !== PamAccessMethod.Web) {
      throw new BadRequestError({ message: "Session is not a web resource browser session" });
    }

    const updated = await pamSessionDAL.endSessionById(sessionId);
    if (updated) {
      await auditLogService.createAuditLog({
        ...auditLogInfo,
        orgId,
        projectId: session.projectId,
        event: {
          type: EventType.PAM_SESSION_END,
          metadata: { sessionId, accountId, accountName: session.accountName }
        }
      });
    }

    return { ok: true as const };
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

    if (!SESSION_HANDLERS[account.accountType as PamAccountType]) {
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
    launchWebResourceSession,
    proxyWebResourceRequest,
    endWebResourceSession
  };
};
