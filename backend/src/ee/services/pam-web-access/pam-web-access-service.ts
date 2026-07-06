import net from "node:net";

import { ForbiddenError, subject } from "@casl/ability";
import type WebSocket from "ws";

import { ActionProjectType } from "@app/db/schemas";
import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError, PolicyViolationError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection, setupRelayServer } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { APPROVAL_POLICY_FACTORY_MAP } from "@app/services/approval-policy/approval-policy-factory";
import { TApprovalRequestGrantsDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { TPamAccessPolicy } from "@app/services/approval-policy/pam-access/pam-access-policy-types";
import { ActorType, MfaMethod } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TPamSessionExpirationServiceFactory } from "@app/services/pam-session-expiration/pam-session-expiration-queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { decryptAccountCredentials } from "../pam-account/pam-account-fns";
import { TPamAccountPolicyDALFactory } from "../pam-account-policy/pam-account-policy-dal";
import { PamAccountPolicyRuleType } from "../pam-account-policy/pam-account-policy-enums";
import { TPolicyRules } from "../pam-account-policy/pam-account-policy-types";
import { TPamDomainDALFactory } from "../pam-domain/pam-domain-dal";
import { decryptDomainConnectionDetails } from "../pam-domain/pam-domain-fns";
import { TPamProjectRecordingConfigDALFactory } from "../pam-project-recording-config/pam-project-recording-config-dal";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { decryptResourceConnectionDetails } from "../pam-resource/pam-resource-fns";
import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "../pam-resource/postgres/postgres-resource-types";
import { TRedisAccountCredentials, TRedisResourceConnectionDetails } from "../pam-resource/redis/redis-resource-types";
import { TSSHAccountCredentials, TSSHResourceConnectionDetails } from "../pam-resource/ssh/ssh-resource-types";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamSessionStatus } from "../pam-session/pam-session-enums";
import { PamRecordingStorageBackend } from "../pam-session-recording-storage/pam-session-recording-storage-enums";
import { handlePostgresSession } from "./pam-postgres-session-handler";
import { handleRdpSession } from "./pam-rdp-session-handler";
import { handleRedisSession } from "./pam-redis-session-handler";
import { handleSSHSession } from "./pam-ssh-session-handler";
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

const SUPPORTED_WEB_ACCESS_RESOURCES = [PamResource.Postgres, PamResource.SSH, PamResource.Redis, PamResource.Windows];

type TPamWebAccessServiceFactoryDep = {
  pamAccountDAL: Pick<TPamAccountDALFactory, "findById" | "findMetadataByAccountIds">;
  pamDomainDAL: Pick<TPamDomainDALFactory, "findById">;
  pamAccountPolicyDAL: Pick<TPamAccountPolicyDALFactory, "findById">;
  pamResourceDAL: Pick<TPamResourceDALFactory, "findById">;
  pamProjectRecordingConfigDAL: Pick<TPamProjectRecordingConfigDALFactory, "findByProjectId">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  pamSessionDAL: Pick<
    TPamSessionDALFactory,
    "create" | "updateById" | "countActiveWebSessions" | "endSessionById" | "activateSession" | "endExpiredWebSessions"
  >;
  pamSessionExpirationService: Pick<TPamSessionExpirationServiceFactory, "scheduleSessionExpiration">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userDAL: Pick<TUserDALFactory, "findById">;
  mfaSessionService: Pick<
    TMfaSessionServiceFactory,
    "createMfaSession" | "isMfaSessionActive" | "deleteMfaSession" | "sendMfaCode"
  >;
  approvalPolicyDAL: TApprovalPolicyDALFactory;
  approvalRequestGrantsDAL: TApprovalRequestGrantsDALFactory;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export type TPamWebAccessServiceFactory = ReturnType<typeof pamWebAccessServiceFactory>;

type THandleWebSocketConnectionDTO = {
  socket: WebSocket;
  accountId: string;
  projectId: string;
  orgId: string;
  resourceId: string;
  resourceName: string;
  accountName: string;
  auditLogInfo: AuditLogInfo;
  userId: string;
  actorEmail: string;
  actorName: string;
  actorIp: string;
  actorUserAgent: string;
  reason?: string | null;
  grantExpiresAt?: string | null;
  preAuthMessages: TEarlyBufferedMsg[];
  preAuthHandler: (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void;
};
export const pamWebAccessServiceFactory = ({
  pamAccountDAL,
  pamDomainDAL,
  pamAccountPolicyDAL,
  pamResourceDAL,
  pamProjectRecordingConfigDAL,
  permissionService,
  auditLogService,
  tokenService,
  pamSessionDAL,
  pamSessionExpirationService,
  gatewayV2Service,
  gatewayPoolService,
  kmsService,
  userDAL,
  mfaSessionService,
  approvalPolicyDAL,
  approvalRequestGrantsDAL,
  orgDAL,
  projectDAL
}: TPamWebAccessServiceFactoryDep) => {
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

  const sendSessionEnd = (socket: WebSocket, reason: SessionEndReason): void => {
    sendMessage(socket, { type: TerminalServerMessageType.SessionEnd, reason });
  };

  // Flushes the session_end frame before sending the WS close frame
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
    // Fallback: close immediately if send failed or socket wasn't open
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
    mfaSessionId,
    reason,
    resourceId: requestResourceId
  }: TIssueWebSocketTicketDTO) => {
    const account = await pamAccountDAL.findById(accountId);

    if (!account) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    if (account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    const trimmedReason = reason?.trim() || null;

    const effectiveResourceId = account.resourceId ?? requestResourceId;
    if (!effectiveResourceId) {
      throw new BadRequestError({ message: "A resourceId is required for web access" });
    }

    const resource = await pamResourceDAL.findById(effectiveResourceId);

    if (!resource) {
      throw new NotFoundError({ message: `Resource with ID '${effectiveResourceId}' not found` });
    }

    if (resource.projectId !== projectId) {
      throw new NotFoundError({ message: `Resource with ID '${effectiveResourceId}' not found` });
    }

    if (!SUPPORTED_WEB_ACCESS_RESOURCES.includes(resource.resourceType as PamResource)) {
      throw new BadRequestError({
        message: "Web access is not supported for this resource type"
      });
    }

    const isDomainAccount = !account.resourceId;
    const domain = isDomainAccount && account.domainId ? await pamDomainDAL.findById(account.domainId) : null;
    let accountIdentity = account.name;

    if (isDomainAccount) {
      if (resource.resourceType !== PamResource.Windows) {
        throw new BadRequestError({ message: "Domain account web access is only supported for Windows resources" });
      }

      if (!account.domainId || resource.domainId !== account.domainId) {
        throw new BadRequestError({ message: "Resource is not joined to this domain account's domain" });
      }

      if (!domain) {
        throw new NotFoundError({ message: `Domain with ID '${account.domainId}' not found` });
      }

      const domainConnectionDetails = await decryptDomainConnectionDetails({
        projectId,
        encryptedConnectionDetails: domain.encryptedConnectionDetails,
        kmsService
      });
      accountIdentity = `${domainConnectionDetails.domain}:${account.name}`;
    }

    // Sessions that outlived their expiresAt may still show as active — end them so that they don't count against the session limit.
    await pamSessionDAL.endExpiredWebSessions(actor.id, projectId);

    const activeWebSessionCount = await pamSessionDAL.countActiveWebSessions(actor.id, projectId);
    if (activeWebSessionCount >= MAX_WEB_SESSIONS_PER_USER) {
      throw new BadRequestError({
        message: `You have reached the maximum of ${MAX_WEB_SESSIONS_PER_USER} active web access sessions. Close an existing session and try again.`
      });
    }

    // Approval policy check
    const approvalPolicy = APPROVAL_POLICY_FACTORY_MAP[ApprovalPolicyType.PamAccess](ApprovalPolicyType.PamAccess);

    const policyInputs = {
      resourceId: resource.id,
      resourceName: resource.name,
      accountName: accountIdentity
    };

    const approvalGrant = await approvalPolicy.canAccess(
      approvalRequestGrantsDAL,
      resource.projectId,
      actor.id,
      policyInputs
    );

    if (!approvalGrant) {
      const matchedPolicy = await approvalPolicy.matchPolicy(approvalPolicyDAL, resource.projectId, policyInputs);

      if (matchedPolicy) {
        throw new PolicyViolationError({
          message: "A policy is in place for this resource",
          details: {
            policyId: matchedPolicy.id,
            policyName: matchedPolicy.name,
            policyType: matchedPolicy.type,
            constraints: {
              accessDuration: {
                max: (matchedPolicy as TPamAccessPolicy).constraints.constraints.accessDuration.max
              }
            }
          }
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

      const accountMeta = await pamAccountDAL.findMetadataByAccountIds([account.id]);

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPamAccountActions.Access,
        subject(ProjectPermissionSub.PamAccounts, {
          resourceName: resource.name,
          accountName: account.name,
          resourceType: resource.resourceType,
          ...(domain && { domainName: domain.name, domainType: domain.domainType }),
          metadata: accountMeta[account.id] || []
        })
      );
    }

    // After auth gates so error code doesn't leak policy config to unauthorized actors
    if (account.policyId) {
      const policy = await pamAccountPolicyDAL.findById(account.policyId);
      const policyRules = (policy?.rules ?? {}) as TPolicyRules;
      if (policy?.isActive && policyRules[PamAccountPolicyRuleType.RequireReason] && !trimmedReason) {
        throw new BadRequestError({
          message: "A reason is required to access this account",
          name: "PAM_REASON_REQUIRED"
        });
      }
    }

    if (resource.resourceType === PamResource.Windows) {
      const recordingConfig = await pamProjectRecordingConfigDAL.findByProjectId(projectId);
      if (!recordingConfig || recordingConfig.storageBackend === PamRecordingStorageBackend.Postgres) {
        throw new BadRequestError({
          message:
            "Windows resources require an external (S3) session recording configuration. Postgres storage is not supported for RDP sessions. Configure an S3 bucket in project settings before accessing Windows accounts."
        });
      }
    }

    // MFA check
    if (account.requireMfa && !mfaSessionId) {
      const project = await requestMemoize(requestMemoKeys.projectFindById(account.projectId), () =>
        projectDAL.findById(account.projectId)
      );
      if (!project) throw new NotFoundError({ message: `Project with ID '${account.projectId}' not found` });

      const actorUser = await requestMemoize(requestMemoKeys.userFindById(actor.id), () => userDAL.findById(actor.id));
      if (!actorUser) throw new NotFoundError({ message: `User with ID '${actor.id}' not found` });

      const org = await requestMemoize(requestMemoKeys.orgFindOrgById(project.orgId), () =>
        orgDAL.findOrgById(project.orgId)
      );
      if (!org) throw new NotFoundError({ message: `Organization with ID '${project.orgId}' not found` });

      // Priority: org-enforced > user-selected > email fallback
      const orgMfaMethod = org.enforceMfa ? (org.selectedMfaMethod as MfaMethod | null) : undefined;
      const userMfaMethod = actorUser.isMfaEnabled ? (actorUser.selectedMfaMethod as MfaMethod | null) : undefined;
      const mfaMethod = (orgMfaMethod ?? userMfaMethod ?? MfaMethod.EMAIL) as MfaMethod;

      const newMfaSessionId = await mfaSessionService.createMfaSession(actorUser.id, account.id, mfaMethod);

      if (mfaMethod === MfaMethod.EMAIL && actorUser.email) {
        await mfaSessionService.sendMfaCode(actorUser.id, actorUser.email);
      }

      throw new BadRequestError({
        message: "MFA verification required to access PAM account",
        name: "SESSION_MFA_REQUIRED",
        details: {
          mfaSessionId: newMfaSessionId,
          mfaMethod
        }
      });
    }

    if (account.requireMfa && mfaSessionId) {
      const isActive = await mfaSessionService.isMfaSessionActive({
        mfaSessionId,
        userId: actor.id,
        resourceId: account.id
      });
      if (!isActive) {
        throw new BadRequestError({ message: "Invalid or expired MFA session" });
      }

      await mfaSessionService.deleteMfaSession(mfaSessionId);
    }

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_PAM_WS_TICKET,
      userId: actor.id,
      payload: JSON.stringify({
        accountId,
        projectId,
        orgId,
        resourceId: resource.id,
        resourceName: resource.name,
        accountName: account.name,
        actorEmail,
        actorName,
        auditLogInfo,
        reason: trimmedReason,
        grantExpiresAt: approvalGrant?.expiresAt?.toISOString() ?? null
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
    resourceId: ticketResourceId,
    resourceName,
    accountName,
    auditLogInfo,
    userId,
    actorEmail,
    actorName,
    actorIp,
    actorUserAgent,
    reason: accessReason,
    grantExpiresAt: grantExpiresAtIso,
    preAuthMessages,
    preAuthHandler
  }: THandleWebSocketConnectionDTO): Promise<void> => {
    const earlyMessages: TEarlyBufferedMsg[] = preAuthMessages;
    const releaseEarlyBuffer = () => {
      socket.off("message", preAuthHandler);
    };

    let session: { id: string } | null = null;
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

      // Must come after handler cleanup
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
                metadata: {
                  sessionId,
                  accountName
                }
              }
            });
          }
        } catch (err) {
          logger.error(err, `Failed to end session in DB [sessionId=${sessionId}]`);
        } finally {
          session = null;
        }
      }

      // Best-effort ALPN session cancellation (fire-and-forget).
      // Triggers gateway-side cleanup: log upload, and session end via API.
      // If this fails, the scheduled queue job will expire the session at expiresAt time.
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
      // 1. VALIDATE
      const account = await pamAccountDAL.findById(accountId);
      if (!account || account.projectId !== projectId) {
        throw new BadRequestError({ message: "Invalid account or project" });
      }

      const effectiveResourceId = account.resourceId ?? ticketResourceId;
      if (!effectiveResourceId) {
        throw new BadRequestError({ message: "A resourceId is required for domain accounts" });
      }

      const resource = await pamResourceDAL.findById(effectiveResourceId);
      if (!resource || resource.projectId !== projectId) {
        throw new BadRequestError({ message: "Resource not found" });
      }

      if (!SUPPORTED_WEB_ACCESS_RESOURCES.includes(resource.resourceType as PamResource)) {
        throw new BadRequestError({ message: "Web access is not supported for this resource type" });
      }

      if (!account.resourceId) {
        if (resource.resourceType !== PamResource.Windows) {
          throw new BadRequestError({ message: "Domain account web access is only supported for Windows resources" });
        }

        if (!account.domainId || resource.domainId !== account.domainId) {
          throw new BadRequestError({ message: "Resource is not joined to this domain account's domain" });
        }
      }

      const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
        gatewayId: resource.gatewayId,
        gatewayPoolId: resource.gatewayPoolId
      });
      if (!effectiveGatewayId) {
        throw new BadRequestError({ message: "Gateway not configured for this resource" });
      }

      // Sessions that outlived their expiresAt may still show as active — end them so that they don't count against the session limit.
      await pamSessionDAL.endExpiredWebSessions(userId, projectId);

      // Check web session limit
      const activeCount = await pamSessionDAL.countActiveWebSessions(userId, projectId);
      if (activeCount >= MAX_WEB_SESSIONS_PER_USER) {
        sendMessage(socket, {
          type: TerminalServerMessageType.Output,
          data: `${SessionEndReason.SessionLimitReached}\n`
        });
        sendSessionEndAndClose(socket, SessionEndReason.SessionLimitReached);
        return;
      }

      // 2. DECRYPT
      const resourceConnectionDetails = await decryptResourceConnectionDetails({
        projectId,
        encryptedConnectionDetails: resource.encryptedConnectionDetails,
        kmsService
      });
      const { host, port } = resourceConnectionDetails as { host: string; port: number };

      const accountCredentials = await decryptAccountCredentials({
        projectId,
        encryptedCredentials: account.encryptedCredentials,
        kmsService
      });

      // 3. CREATE SESSION
      const user = await requestMemoize(requestMemoKeys.userFindById(userId), () => userDAL.findById(userId));
      let sessionDurationMs = DEFAULT_WEB_SESSION_DURATION_MS;
      if (grantExpiresAtIso) {
        const grantRemainingMs = new Date(grantExpiresAtIso).getTime() - Date.now();
        if (grantRemainingMs <= 0) {
          sendSessionEndAndClose(socket, SessionEndReason.SessionGrantExpired);
          return;
        }
        sessionDurationMs = Math.min(sessionDurationMs, grantRemainingMs);
      }
      const expiresAt = new Date(Date.now() + sessionDurationMs);

      const isDomainAccount = !account.resourceId;

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
        resourceId: isDomainAccount ? null : resource.id,
        selectedResourceId: isDomainAccount ? resource.id : null,
        userId,
        gatewayId: effectiveGatewayId,
        reason: accessReason?.trim() || null
      });

      await pamSessionExpirationService.scheduleSessionExpiration(session.id, expiresAt);

      // 4. GET CERTIFICATES
      const certs = await gatewayV2Service.getPAMConnectionDetails({
        gatewayId: effectiveGatewayId,
        sessionId: session.id,
        resourceType: resource.resourceType as PamResource,
        host,
        port,
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

      // 5. START TUNNEL
      const tunnelProtocol =
        resource.resourceType === PamResource.Windows ? GatewayProxyProtocol.PamRdpBrowser : GatewayProxyProtocol.Pam;
      relayServer = await setupRelayServer({
        protocol: tunnelProtocol,
        relayHost: certs.relayHost,
        relay: certs.relay,
        gateway: certs.gateway,
        longLived: true
      });

      // 30s tolerance for clock skew between us and gateway
      const isNearSessionExpiry = () => Date.now() >= expiresAt.getTime() - 30_000;

      // Bound message helpers for handlers
      const boundSendMessage = (msg: TWebSocketServerMessage) => sendMessage(socket, msg);
      const boundSendSessionEnd = (reason: SessionEndReason) => sendSessionEnd(socket, reason);
      const handlerCleanup = () => {
        if (!cleanedUp) {
          void cleanup();
        }
      };

      // Build session context once — passed to any handler
      const ctx: TSessionContext = {
        socket,
        relayPort: relayServer.port,
        resourceName: resource.name,
        sessionId: session.id,
        sendMessage: boundSendMessage,
        sendSessionEnd: boundSendSessionEnd,
        isNearSessionExpiry,
        onCleanup: handlerCleanup,
        earlyMessages,
        releaseEarlyBuffer
      };

      // 6. CONNECT TO RESOURCE (dispatch by type)
      try {
        if (resource.resourceType === PamResource.Postgres) {
          handlerResult = await handlePostgresSession(ctx, {
            connectionDetails: resourceConnectionDetails as TPostgresResourceConnectionDetails,
            credentials: accountCredentials as TPostgresAccountCredentials
          });
        } else if (resource.resourceType === PamResource.SSH) {
          handlerResult = await handleSSHSession(ctx, {
            connectionDetails: resourceConnectionDetails as TSSHResourceConnectionDetails,
            credentials: accountCredentials as TSSHAccountCredentials
          });
        } else if (resource.resourceType === PamResource.Redis) {
          handlerResult = await handleRedisSession(ctx, {
            connectionDetails: resourceConnectionDetails as TRedisResourceConnectionDetails,
            credentials: accountCredentials as TRedisAccountCredentials
          });
        } else if (resource.resourceType === PamResource.Windows) {
          handlerResult = await handleRdpSession(ctx);
        }
      } finally {
        releaseEarlyBuffer();
      }

      // 7. ACTIVATE SESSION
      // For RDP (Windows), the gateway calls getSessionCredentials which transitions
      // Starting -> Active via startSession() and generates recording secrets.
      // Setting Active here first would prevent recording secrets from being created.
      if (resource.resourceType !== PamResource.Windows) {
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
            resourceName,
            accountName,
            duration: expiresAt.toISOString(),
            reason: accessReason ?? undefined
          }
        }
      });

      // 8. SET UP COMMON HANDLERS

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
          // Client didn't respond to last ping — connection is dead
          socket.terminate();
          return;
        }
        isAlive = false;
        if (socket.readyState === socket.OPEN) {
          socket.ping();
        }
      }, WS_PING_INTERVAL_MS);

      // Reset idle timer on any incoming message
      socket.on("message", () => {
        resetIdleTimer();
      });

      // Session expiry timer
      expiryTimer = setTimeout(() => {
        if (!cleanedUp) {
          void cleanup();
          sendSessionEndAndClose(socket, SessionEndReason.SessionCompleted);
        }
      }, sessionDurationMs);

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
      await cleanup();
      sendSessionEndAndClose(socket, SessionEndReason.SetupFailed);
    }
  };

  return {
    issueWebSocketTicket,
    handleWebSocketConnection
  };
};
