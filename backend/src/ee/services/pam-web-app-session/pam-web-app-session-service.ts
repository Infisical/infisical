import { createHash, randomBytes } from "node:crypto";
import net from "node:net";

import type WebSocket from "ws";

import { TableName } from "@app/db/schemas";
import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ResourcePermissionPamResourceActions } from "@app/ee/services/permission/resource-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { setupGatewayProxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TPamAccessRequestServiceFactory } from "../pam-access-request/pam-access-request-service";
import { PamTemplateSettingsSchema } from "../pam-account-template/pam-account-template-schemas";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { getAccountAccessibilityIssues } from "../pam-account/pam-account-schemas";
import { resolveS3RecordingAccess } from "../pam-session-recording/aws-s3/aws-s3-provider-factory";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { verifyGatewayUploadToken } from "../pam-session-recording/pam-recording-secrets";
import { assertUserStillActiveInOrg } from "../pam-session/pam-session-access-fns";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { TPamSessionExpirationServiceFactory } from "../pam-session/pam-session-expiration-queue";
import {
  isPamSessionLive,
  reportPamSessionEnded,
  sendPamSessionCancellationSignal
} from "../pam-session/pam-session-fns";
import { TPamSessionServiceFactory } from "../pam-session/pam-session-service";
import { DEFAULT_WEB_SESSION_DURATION_MS, MAX_WEB_SESSIONS_PER_USER } from "../pam-web-access/pam-web-access-types";
import { bridgeWebAppSession } from "../pam-web-access/webapp/pam-web-app-bridge";
import {
  PamAccessMethod,
  PamAccountType,
  PamProductRole,
  PamSessionEndReason,
  PamSessionStatus
} from "../pam/pam-enums";
import { enforceMfa } from "../pam/pam-mfa";
import {
  checkAccountAccess,
  getLaunchAccessRemainingMs,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import { PamPolicyType, resolveAccessControls, resolvePolicy } from "../pam/pam-policies";
import { buildWebAppPolicySnapshot, WebAppCredentialsSchema } from "./pam-web-app-config";
import { TPamWebAppSessionDAL } from "./pam-web-app-session-dal";
import {
  assertWebWorkerTransition,
  isWebWorkerTerminal,
  webLaunchPayloadHash,
  webLeaseSeconds,
  webLeaseUntil,
  webStopConfirmation
} from "./pam-web-app-session-fns";
import {
  PAM_RECORDING_STORAGE_TABLE,
  PAM_WEB_APP_SESSION_TABLE,
  PAM_WEB_APP_TICKET_TABLE,
  TWebAppRecord,
  TWebAppSession,
  TWebAppTicket,
  TWebWorkerState
} from "./pam-web-app-session-types";

type TDeps = {
  dal: TPamWebAppSessionDAL;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails">;
  pamSessionDAL: Pick<
    TPamSessionDALFactory,
    | "create"
    | "endSessionById"
    | "terminateSessionById"
    | "activateSession"
    | "endExpiredWebSessions"
    | "countActiveWebSessions"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission" | "getProjectPermission">;
  pamAccessRequestService: Pick<TPamAccessRequestServiceFactory, "checkGrant">;
  membershipDAL: Pick<TMembershipDALFactory, "lockOrgMembershipForUser" | "findResourceMembershipsForActor">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById" | "findById" | "lockActorsForOrgAccess" | "findActorsWithActiveOrgAccess">;
  userDAL: Pick<TUserDALFactory, "findById">;
  mfaSessionService: Pick<
    TMfaSessionServiceFactory,
    "createMfaSession" | "getMfaSession" | "deleteMfaSession" | "sendMfaCode"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "assertGatewayBindingInOrg" | "resolveEffectiveGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  authTokenService: Pick<TAuthTokenServiceFactory, "validateUserSessionFreshness">;
  pamSessionService: Pick<TPamSessionServiceFactory, "terminateSession">;
  pamSessionExpirationService: Pick<TPamSessionExpirationServiceFactory, "scheduleSessionExpiration">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};
const actorContext = (actor: OrgServiceActor): TActorContext => ({
  actor: actor.type,
  actorId: actor.id,
  actorOrgId: actor.orgId,
  actorAuthMethod: actor.authMethod
});
export type TPamWebAppSessionService = ReturnType<typeof pamWebAppSessionServiceFactory>;
export const pamWebAppSessionServiceFactory = (deps: TDeps) => {
  const {
    dal,
    pamAccountDAL,
    pamSessionDAL,
    permissionService,
    pamAccessRequestService,
    membershipDAL,
    membershipRoleDAL,
    orgDAL,
    userDAL,
    mfaSessionService,
    kmsService,
    appConnectionDAL,
    gatewayPoolService,
    gatewayV2Service,
    authTokenService,
    pamSessionService,
    pamSessionExpirationService,
    auditLogService,
    telemetryService
  } = deps;
  const decrypt = async (projectId: string, blob: Buffer) => {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    return JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf8")) as Record<string, unknown>;
  };
  const getRecord = async (sessionId: string, orgId?: string) => {
    const record = await dal.getRecord(sessionId);
    if (!record || (orgId && record.session.orgId !== orgId))
      throw new NotFoundError({ message: "Browser session not found" });
    return record;
  };
  const audit = (
    record: TWebAppRecord,
    type:
      | EventType.PAM_WEB_APP_SESSION_CREATED
      | EventType.PAM_WEB_APP_SESSION_ATTACHED
      | EventType.PAM_WEB_APP_SESSION_STOP_REQUESTED
      | EventType.PAM_WEB_APP_SESSION_WORKER_FAILED
      | EventType.PAM_SESSION_TERMINATE
      | EventType.PAM_SESSION_END,
    info?: AuditLogInfo,
    extra: { controllerGen?: number; takeControl?: boolean; reason?: string; expiresAt?: string } = {}
  ) =>
    auditLogService.createAuditLog({
      ...(info ?? { actor: { type: ActorType.PLATFORM as const, metadata: {} } }),
      orgId: record.session.orgId,
      projectId: record.session.projectId,
      event: {
        type,
        metadata: {
          sessionId: record.session.id,
          accountId: record.web.accountId ?? undefined,
          accountName: record.session.accountName,
          ...extra
        }
      }
    });
  const cancel = (record: TWebAppRecord) => {
    if (record.web.gatewayId)
      sendPamSessionCancellationSignal({
        sessionId: record.session.id,
        gatewayId: record.web.gatewayId,
        accountType: PamAccountType.WebApp,
        actorId: record.web.createdByUserId ?? record.session.id,
        actorType: record.web.createdByUserId ? ActorType.USER : ActorType.PLATFORM,
        actorEmail: record.session.actorEmail,
        gatewayV2Service
      });
  };
  const failRemovedGateway = async (record: TWebAppRecord) => {
    if (record.web.gatewayId || record.web.allocationGen === 0 || isWebWorkerTerminal(record.web.workerState))
      return false;
    const result = await dal.transaction(async (tx) => {
      const locked = await dal.lockRecord(record.session.id, tx);
      if (
        !locked ||
        locked.web.gatewayId ||
        locked.web.allocationGen === 0 ||
        isWebWorkerTerminal(locked.web.workerState)
      )
        return null;
      await tx(PAM_WEB_APP_SESSION_TABLE)
        .where({ sessionId: record.session.id })
        .update({ workerState: "failed", workerStateReason: "gateway-removed", leaseUntil: new Date() });
      const ended = Boolean(await pamSessionDAL.endSessionById(record.session.id, tx));
      return { ended };
    });
    if (result) {
      await audit(record, EventType.PAM_WEB_APP_SESSION_WORKER_FAILED, undefined, { reason: "gateway-removed" });
      if (result.ended) {
        await audit(record, EventType.PAM_SESSION_END);
        void reportPamSessionEnded({
          session: { ...record.session, endedAt: new Date() },
          orgId: record.session.orgId,
          endReason: PamSessionEndReason.Completed,
          telemetryService,
          userDAL
        });
      }
    }
    return true;
  };
  const accountForActor = async (accountId: string, projectId: string, actor: OrgServiceActor) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId, dal.db);
    if (!account || account.projectId !== projectId || account.accountType !== PamAccountType.WebApp)
      throw new NotFoundError({ message: "Web App account not found" });
    await checkAccountAccess(
      permissionService,
      accountId,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.LaunchSessions,
      actorContext(actor)
    );
    return account;
  };
  const continuingAccountAccess = async (
    account: NonNullable<Awaited<ReturnType<typeof accountForActor>>>,
    actor: OrgServiceActor
  ) => {
    if (!account.projectId) throw new NotFoundError({ message: "Web App project not found" });
    let remaining = await getLaunchAccessRemainingMs(
      membershipDAL,
      membershipRoleDAL,
      account.projectId,
      account,
      { actor: ActorType.USER, actorId: actor.id },
      dal.db
    );
    if (remaining !== null && remaining <= 0)
      throw new ForbiddenRequestError({ message: "Your access to this account has expired" });
    if (resolveAccessControls(account.templatePolicies).requiresApproval) {
      const grant = await pamAccessRequestService.checkGrant({
        actorId: actor.id,
        actor: ActorType.USER,
        accountId: account.id,
        accountFolderId: account.folderId,
        projectId: account.projectId
      });
      if (!grant)
        throw new ForbiddenRequestError({ name: "PAM_APPROVAL_REQUIRED", message: "Access request required" });
      if (grant.expiresAt) {
        const grantRemaining = new Date(grant.expiresAt).getTime() - Date.now();
        if (grantRemaining <= 0) throw new ForbiddenRequestError({ message: "Your approved access has expired" });
        remaining = remaining === null ? grantRemaining : Math.min(remaining, grantRemaining);
      }
    }
    await dal.transaction((tx) =>
      assertUserStillActiveInOrg({ orgId: actor.orgId, userId: actor.id, membershipDAL, orgDAL, tx })
    );
    return remaining;
  };
  const assertWebContinuingAccess = async (record: TWebAppRecord, actor: OrgServiceActor) => {
    if (!record.web.createdByUserId || actor.type !== ActorType.USER || record.web.createdByUserId !== actor.id)
      throw new ForbiddenRequestError({ message: "Only the person who launched this browser can attach to it" });
    if (await failRemovedGateway(record)) throw new ConflictError({ message: "This browser's gateway was removed" });
    if (
      !isPamSessionLive(record.session) ||
      isWebWorkerTerminal(record.web.workerState) ||
      ["ending", "stop-unconfirmed"].includes(record.web.workerState)
    )
      throw new ConflictError({ message: "This browser session has ended" });
    if (!record.session.accountId) throw new ForbiddenRequestError({ message: "This account has been deleted" });
    const account = await accountForActor(record.session.accountId, record.session.projectId, actor);
    return continuingAccountAccess(account, actor);
  };
  const sessionView = async (record: TWebAppRecord) => {
    const { session, web } = record;
    const [manifestStatus, chunksVerified] = await Promise.all([
      dal.manifestStatus(session.id),
      dal.countVerified(session.id)
    ]);
    let recordingState:
      | "complete"
      | "incomplete"
      | "mismatch"
      | "failed"
      | "finalizing"
      | "recording"
      | "unavailable"
      | "initializing" = "initializing";
    if (session.startedAt) recordingState = "recording";
    if (web.workerState === "failed") recordingState = "failed";
    if (web.recordingFinalReport || web.workerState === "stopped") recordingState = "finalizing";
    if (manifestStatus) recordingState = manifestStatus;
    if (web.allocationGen === 0 && web.workerState === "stopped" && web.workerStateReason === "never-allocated")
      recordingState = "unavailable";

    return {
      id: session.id,
      accountId: session.accountId,
      accountName: session.accountName,
      accountType: session.accountType,
      folderName: session.folderName,
      status: session.status,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      endedAt: session.endedAt,
      reason: session.reason,
      webApp: {
        allocationGen: web.allocationGen,
        controllerGen: web.controllerGen,
        workerState: web.workerState,
        workerStateReason: web.workerStateReason,
        lastWorkerContactAt: web.lastWorkerContactAt,
        leaseUntil: web.leaseUntil,
        reconnectDeadlineAt: web.reconnectDeadlineAt,
        stopConfirmedAt: web.stopConfirmedAt,
        stopConfirmation: webStopConfirmation(web.stopConfirmedAt, web.lastWorkerContactAt),
        startOrigin: web.policySnapshot.startOrigin,
        allowTypedNavigation: web.policySnapshot.allowTypedNavigation,
        reconnectGraceSeconds: web.policySnapshot.reconnectGraceSeconds,
        gatewayName: session.gatewayName
      },
      recording: {
        state: recordingState,
        protection: "participant-level" as const,
        chunksEmitted: web.chunksEmitted,
        chunksVerified
      }
    };
  };
  const createSession = async ({
    accountId,
    projectId,
    reason,
    mfaSessionId,
    idempotencyKey,
    actor,
    tokenVersionId,
    actorEmail,
    actorName,
    actorIp,
    actorUserAgent,
    auditLogInfo
  }: {
    accountId: string;
    projectId: string;
    reason?: string;
    mfaSessionId?: string;
    idempotencyKey?: string;
    actor: OrgServiceActor;
    tokenVersionId?: string;
    actorEmail: string;
    actorName: string;
    actorIp: string;
    actorUserAgent: string;
    auditLogInfo: AuditLogInfo;
  }) => {
    if (actor.type !== ActorType.USER)
      throw new ForbiddenRequestError({ message: "Web App sessions require user authentication" });
    const account = await accountForActor(accountId, projectId, actor);
    const payloadHash = webLaunchPayloadHash(accountId, reason);
    if (idempotencyKey) {
      const previous = await dal.findLaunch(actor.id, accountId, idempotencyKey);
      if (previous) {
        if (!previous.idempotencyPayloadHash?.equals(payloadHash))
          throw new ConflictError({ message: "That launch key was used with different details" });
        const record = await getRecord(previous.sessionId, actor.orgId);
        if (!isPamSessionLive(record.session) || isWebWorkerTerminal(previous.workerState))
          throw new ConflictError({ message: "That launch has ended. Start a new launch." });
        return sessionView(record);
      }
    }
    const policy = resolveAccessControls(account.templatePolicies);
    if (policy.requireReason && !reason?.trim())
      throw new BadRequestError({
        name: "PAM_REASON_REQUIRED",
        message: "A reason is required to access this account"
      });
    if (policy.requireMfa)
      await enforceMfa(
        { mfaSessionService, orgDAL, userDAL },
        { userId: actor.id, orgId: actor.orgId, actorEmail, accountId, mfaSessionId, tokenVersionId }
      );
    if (getAccountAccessibilityIssues(account).length)
      throw new BadRequestError({ message: "This account is not ready. Ask its administrator to finish setup." });
    const remaining = await continuingAccountAccess(account, actor);
    const expiresAt = new Date(
      Date.now() +
        Math.min(
          policy.maxSessionDurationSeconds ? policy.maxSessionDurationSeconds * 1000 : DEFAULT_WEB_SESSION_DURATION_MS,
          remaining ?? Infinity
        )
    );
    const details = await decrypt(projectId, account.encryptedConnectionDetails);
    const credentials = WebAppCredentialsSchema.parse(await decrypt(projectId, account.encryptedCredentials));
    const policySnapshot = buildWebAppPolicySnapshot(details, credentials.authMethod, {
      reconnectGraceSeconds: Number(
        resolvePolicy(account.templatePolicies, PamPolicyType.WebReconnectGraceSeconds) ?? 60
      )
    });
    await gatewayPoolService.assertGatewayBindingInOrg({
      gatewayId: account.gatewayId ?? account.templateGatewayId,
      gatewayPoolId: account.gatewayPoolId ?? account.templateGatewayPoolId,
      orgId: actor.orgId
    });
    const gatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: account.gatewayId ?? account.templateGatewayId,
      gatewayPoolId: account.gatewayPoolId ?? account.templateGatewayPoolId
    });
    const gateway = gatewayId
      ? await dal.db(TableName.GatewayV2).where({ id: gatewayId, orgId: actor.orgId }).first()
      : null;
    if (!(gateway?.capabilities as { webApp?: boolean } | null)?.webApp)
      throw new BadRequestError({ message: "This gateway does not have a ready Web App browser runtime" });
    const settings = PamTemplateSettingsSchema.parse(account.templateSettings ?? {});
    const storage = {
      backend: settings.recordingStorageBackend,
      connectionId: null as string | null,
      connectionName: null as string | null,
      bucket: null as string | null,
      region: null as string | null,
      keyPrefix: null as string | null
    };
    if (storage.backend === PamRecordingStorageBackend.AwsS3) {
      const connectionId = account.recordingConnectionId ?? account.templateRecordingConnectionId;
      const s3 =
        (
          account.settingsOverrides as {
            recordingS3Config?: { bucket: string; region?: string; keyPrefix?: string };
          } | null
        )?.recordingS3Config ?? settings.recordingS3Config;
      if (!connectionId || !s3)
        throw new BadRequestError({ message: "Configure recording storage before launching this app" });
      const connection = await appConnectionDAL.findById(connectionId, dal.db);
      if (!connection || connection.orgId !== actor.orgId)
        throw new NotFoundError({ message: "Recording connection not found" });
      const access = await resolveS3RecordingAccess(await decryptAppConnection(connection, kmsService), s3.region);
      Object.assign(storage, {
        connectionId,
        connectionName: connection.name,
        bucket: s3.bucket,
        region: access.region ?? null,
        keyPrefix: s3.keyPrefix ?? null
      });
    }
    const launch = await (async () => {
      try {
        const id = await dal.transaction(async (tx) => {
          await assertUserStillActiveInOrg({ orgId: actor.orgId, userId: actor.id, membershipDAL, orgDAL, tx });
          await pamSessionDAL.endExpiredWebSessions(actor.id, projectId, tx);
          if ((await pamSessionDAL.countActiveWebSessions(actor.id, projectId, tx)) >= MAX_WEB_SESSIONS_PER_USER)
            throw new ConflictError({ message: "End an existing web session before launching another" });
          const session = await pamSessionDAL.create(
            {
              projectId,
              accountId,
              accountType: PamAccountType.WebApp,
              accountName: account.name,
              folderName: account.folderName,
              status: PamSessionStatus.Starting,
              accessMethod: PamAccessMethod.Web,
              userId: actor.id,
              actorName,
              actorEmail,
              actorIp,
              actorUserAgent,
              reason: reason?.trim() || null,
              expiresAt
            },
            tx
          );
          const sessionId = session.id;
          await tx(PAM_WEB_APP_SESSION_TABLE).insert({
            sessionId,
            createdByUserId: actor.id,
            accountId,
            idempotencyKey: idempotencyKey ?? null,
            idempotencyPayloadHash: payloadHash,
            policySnapshot: JSON.stringify(policySnapshot)
          });
          if (
            storage.connectionId &&
            !(await tx(TableName.AppConnection).where({ id: storage.connectionId }).forShare().first())
          )
            throw new NotFoundError({ message: "The recording storage connection was deleted" });
          await tx(PAM_RECORDING_STORAGE_TABLE).insert({ sessionId, ...storage });
          return sessionId;
        });
        return { id, created: true };
      } catch (error) {
        if ((error as { code?: string }).code === "23505" && idempotencyKey) {
          const previous = await dal.findLaunch(actor.id, accountId, idempotencyKey);
          if (previous?.idempotencyPayloadHash?.equals(payloadHash)) return { id: previous.sessionId, created: false };
          throw new ConflictError({ message: "That launch key was used with different details" });
        }
        throw error;
      }
    })();
    const sessionId = launch.id;
    if (!launch.created) return sessionView(await getRecord(sessionId, actor.orgId));
    await pamSessionExpirationService.scheduleSessionExpiration(sessionId, expiresAt);
    const record = await getRecord(sessionId, actor.orgId);
    await audit(record, EventType.PAM_WEB_APP_SESSION_CREATED, auditLogInfo, {
      reason: reason?.trim(),
      expiresAt: expiresAt.toISOString()
    });
    return sessionView(record);
  };
  const issueAttachTicket = async ({
    sessionId,
    takeControl = false,
    actor,
    tokenVersionId,
    accessVersion
  }: {
    sessionId: string;
    takeControl?: boolean;
    actor: OrgServiceActor;
    tokenVersionId: string;
    accessVersion: number;
  }) => {
    const record = await getRecord(sessionId, actor.orgId);
    await assertWebContinuingAccess(record, actor);
    const token = randomBytes(32).toString("base64url");
    await dal.transaction(async (tx) => {
      const locked = await dal.lockRecord(sessionId, tx);
      if (!locked || !isPamSessionLive(locked.session)) throw new ConflictError({ message: "This session is ending" });
      const [claimed] = await tx<TWebAppSession>(PAM_WEB_APP_SESSION_TABLE)
        .where({ sessionId })
        .whereNotIn("workerState", ["ending", "stop-unconfirmed", "stopped", "failed"])
        .increment("controllerGen", 1)
        .returning("controllerGen");
      if (!claimed) throw new ConflictError({ message: "This session is ending" });
      await tx(PAM_WEB_APP_TICKET_TABLE).insert({
        sessionId,
        userId: actor.id,
        tokenHash: createHash("sha256").update(token).digest(),
        controllerGen: claimed.controllerGen,
        takeControl,
        tokenVersionId,
        accessVersion,
        expiresAt: new Date(Date.now() + 30_000)
      });
    });
    return { ticket: token };
  };
  const consumeAttachTicket = async (sessionId: string, ticket: string, origin?: string) => {
    const site = getConfig().SITE_URL;
    if (!site || origin !== new URL(site).origin)
      throw new ForbiddenRequestError({ message: "This browser connection has an invalid origin" });
    const consumed = await dal.consumeTicket(createHash("sha256").update(ticket).digest(), sessionId);
    if (!consumed) throw new ForbiddenRequestError({ message: "Invalid or expired browser ticket" });
    if (!consumed.tokenVersionId || consumed.accessVersion === null)
      throw new ForbiddenRequestError({ message: "This browser ticket has no authenticated session binding" });
    await authTokenService.validateUserSessionFreshness({
      userId: consumed.userId,
      tokenVersionId: consumed.tokenVersionId,
      accessVersion: consumed.accessVersion,
      readFromPrimary: true
    });
    const record = await getRecord(sessionId);
    const actor: OrgServiceActor = {
      type: ActorType.USER,
      id: consumed.userId,
      authMethod: null,
      orgId: record.session.orgId,
      rootOrgId: record.session.orgId,
      parentOrgId: record.session.orgId
    };
    await assertWebContinuingAccess(record, actor);
    return { consumed, record, actor };
  };
  const handleAttach = async (
    socket: WebSocket,
    initialRecord: TWebAppRecord,
    ticket: TWebAppTicket,
    actor: OrgServiceActor
  ) => {
    let record = initialRecord;
    let freshClaim = false;
    let proxy: Awaited<ReturnType<typeof setupGatewayProxy>> | undefined;
    try {
      if (socket.readyState !== socket.OPEN) throw new BadRequestError({ message: "Browser viewer disconnected" });
      const account = await accountForActor(record.web.accountId!, record.session.projectId, actor);
      await gatewayPoolService.assertGatewayBindingInOrg({
        gatewayId: account.gatewayId ?? account.templateGatewayId,
        gatewayPoolId: account.gatewayPoolId ?? account.templateGatewayPoolId,
        orgId: actor.orgId
      });
      const gatewayId =
        record.web.gatewayId ??
        (await gatewayPoolService.resolveEffectiveGatewayId({
          gatewayId: account.gatewayId ?? account.templateGatewayId,
          gatewayPoolId: account.gatewayPoolId ?? account.templateGatewayPoolId
        }));
      if (!gatewayId) throw new BadRequestError({ message: "No gateway is available for this app" });
      record = await dal.transaction(async (tx) => {
        const locked = await dal.lockRecord(record.session.id, tx);
        if (
          !locked ||
          !isPamSessionLive(locked.session) ||
          ["ending", "stop-unconfirmed", "stopped", "failed"].includes(locked.web.workerState)
        )
          throw new ConflictError({ message: "This session is ending" });
        if (locked.web.workerState === "allocating") {
          const leaseUntil = webLeaseUntil(locked.session.expiresAt, null);
          await tx(TableName.PamSession).where({ id: locked.session.id }).update({ gatewayId });
          await tx(PAM_WEB_APP_SESSION_TABLE)
            .where({ sessionId: locked.session.id })
            .update({
              gatewayId,
              allocationGen: locked.web.allocationGen + 1,
              workerState: "provisioning",
              leaseUntil
            });
          freshClaim = true;
        } else if (["provisioning", "provisioned", "recording-ready"].includes(locked.web.workerState)) {
          await tx(PAM_WEB_APP_SESSION_TABLE)
            .where({ sessionId: locked.session.id })
            .update({ leaseUntil: webLeaseUntil(locked.session.expiresAt, null) });
        }
        return (await dal.getRecord(locked.session.id, tx))!;
      });
      if (await failRemovedGateway(record)) throw new ConflictError({ message: "This browser's gateway was removed" });
      const start = record.web.policySnapshot.allowedDestinations.find(
        (entry) => `${entry.scheme}://${entry.host}:${entry.port}` === record.web.policySnapshot.startOrigin
      )!;
      const details = await gatewayV2Service.getPAMConnectionDetails({
        gatewayId: record.web.gatewayId!,
        sessionId: record.session.id,
        accountType: PamAccountType.WebApp,
        host: start.host,
        port: start.port,
        duration: record.session.expiresAt.getTime() - Date.now(),
        actorMetadata: { id: actor.id, type: ActorType.USER, name: record.session.actorEmail },
        clientSupportsDirect: true,
        webApp: { allocationGen: record.web.allocationGen, controllerGen: ticket.controllerGen, actorId: actor.id }
      });
      if (!details) throw new BadRequestError({ message: "The gateway is unavailable" });
      proxy = await setupGatewayProxy({
        ...details,
        protocol: GatewayProxyProtocol.PamWebBrowser,
        longLived: true,
        eager: true
      });
      const stream = net.connect(proxy.port, "127.0.0.1");
      await new Promise<void>((resolve, reject) => {
        stream.once("connect", resolve);
        stream.once("error", reject);
      });
      stream.removeAllListeners("error");
      if (socket.readyState !== socket.OPEN) {
        stream.destroy();
        throw new BadRequestError({ message: "Browser viewer disconnected" });
      }
      const bridge = bridgeWebAppSession({
        socket,
        stream,
        attach: {
          t: "attach",
          v: 1,
          sessionId: record.session.id,
          allocationGen: record.web.allocationGen,
          controllerGen: ticket.controllerGen,
          takeControl: ticket.takeControl,
          actor: { id: actor.id, email: record.session.actorEmail },
          issuedAt: new Date().toISOString()
        },
        onAttached: () => {
          void audit(record, EventType.PAM_WEB_APP_SESSION_ATTACHED, undefined, {
            controllerGen: ticket.controllerGen,
            takeControl: ticket.takeControl
          }).catch((error) => logger.error(error, "Browser attachment audit failed"));
        },
        onProtocolViolation: () => logger.warn({ sessionId: record.session.id }, "Browser stream protocol violation")
      });
      socket.once("close", () => {
        bridge.cleanup();
        void proxy?.cleanup().catch((error) => logger.error(error, "Browser proxy cleanup failed"));
      });
    } catch (error) {
      await proxy?.cleanup().catch((cause) => logger.error(cause, "Browser proxy cleanup failed"));
      if (freshClaim) {
        const ended = await dal.transaction(async (tx) => {
          const locked = await dal.lockRecord(record.session.id, tx);
          if (locked && locked.web.workerState === "provisioning") {
            await tx(PAM_WEB_APP_SESSION_TABLE)
              .where({ sessionId: record.session.id })
              .update({ workerState: "failed", workerStateReason: "gateway-unreachable" });
            return Boolean(await pamSessionDAL.endSessionById(record.session.id, tx));
          }
          return false;
        });
        cancel(record);
        if (ended) {
          await audit(record, EventType.PAM_SESSION_END);
          await audit(record, EventType.PAM_WEB_APP_SESSION_WORKER_FAILED, undefined, {
            reason: "gateway-unreachable"
          });
          void reportPamSessionEnded({
            session: { ...record.session, endedAt: new Date() },
            orgId: actor.orgId,
            endReason: PamSessionEndReason.Completed,
            telemetryService,
            userDAL
          });
        }
      }
      throw error;
    }
  };
  const reportState = async (
    {
      sessionId,
      reportSeq,
      allocationGen,
      controllerGen,
      state,
      reason,
      chunksEmitted,
      uploadToken
    }: {
      sessionId: string;
      reportSeq: number;
      allocationGen: number;
      controllerGen: number;
      state: TWebWorkerState;
      reason?: string;
      chunksEmitted: number;
      lastFrameSeq: number;
      uploadToken: string;
    },
    actor: OrgServiceActor
  ) => {
    const record = await getRecord(sessionId, actor.orgId);
    if (actor.type !== ActorType.GATEWAY)
      throw new ForbiddenRequestError({ message: "Gateway authentication is required" });
    verifyGatewayUploadToken(uploadToken, record.session.gatewayUploadTokenHash);
    if (await failRemovedGateway(record))
      return { leaseUntil: new Date(), leaseSeconds: 0, expiresAt: record.session.expiresAt, cancel: true };
    if (record.web.gatewayId !== actor.id || record.web.allocationGen !== allocationGen)
      throw new ForbiddenRequestError({ message: "Gateway not authorized for this browser allocation" });
    let remaining: number | null = null;
    let cancelled =
      !record.web.createdByUserId ||
      !isPamSessionLive(record.session) ||
      ["ending", "stop-unconfirmed", "stopped", "failed"].includes(record.web.workerState);
    if (!cancelled && record.web.createdByUserId) {
      try {
        remaining = await assertWebContinuingAccess(record, {
          type: ActorType.USER,
          id: record.web.createdByUserId,
          authMethod: null,
          orgId: actor.orgId,
          rootOrgId: actor.rootOrgId,
          parentOrgId: actor.parentOrgId
        });
      } catch {
        cancelled = true;
      }
    }
    let ended = false;
    let stopped = false;
    const response = await dal.transaction(async (tx) => {
      const locked = await dal.lockRecord(sessionId, tx);
      if (!locked || locked.web.allocationGen !== allocationGen || locked.web.gatewayId !== actor.id)
        throw new ConflictError({ message: "This browser allocation has changed" });
      const failed = locked.web.workerState === "failed";
      if (!failed && reportSeq < locked.web.workerReportSeq)
        throw new ConflictError({ message: "This browser report is older than the current state" });
      if (!failed && reportSeq === locked.web.workerReportSeq)
        return {
          leaseUntil: locked.web.leaseUntil ?? new Date(),
          expiresAt: locked.session.expiresAt,
          cancel: cancelled
        };
      if (controllerGen > locked.web.controllerGen)
        throw new ConflictError({ message: "The browser reported a controller generation that was not issued" });
      if (failed && state !== "stopped")
        return { leaseUntil: new Date(), expiresAt: locked.session.expiresAt, cancel: true };
      let leaseUntil = cancelled ? new Date() : webLeaseUntil(locked.session.expiresAt, remaining);
      if (webLeaseSeconds(leaseUntil, locked.session.expiresAt) === 0) {
        cancelled = true;
        leaseUntil = new Date();
      }
      if (state === "detached" && ["provisioning", "provisioned", "recording-ready"].includes(locked.web.workerState)) {
        await tx(PAM_WEB_APP_SESSION_TABLE)
          .where({ sessionId })
          .update({ workerReportSeq: reportSeq, lastWorkerContactAt: new Date(), leaseUntil });
        return { leaseUntil, expiresAt: locked.session.expiresAt, cancel: cancelled };
      }
      assertWebWorkerTransition(locked.web.workerState, state);
      stopped = state === "stopped" && !locked.web.stopConfirmedAt;
      let { reconnectDeadlineAt } = locked.web;
      if (state === "detached")
        reconnectDeadlineAt = new Date(
          Math.min(
            Date.now() + locked.web.policySnapshot.reconnectGraceSeconds * 1000,
            locked.session.expiresAt.getTime()
          )
        );
      if (state === "active") reconnectDeadlineAt = null;
      await tx(PAM_WEB_APP_SESSION_TABLE)
        .where({ sessionId })
        .update({
          workerReportSeq: reportSeq,
          workerState: state,
          workerStateReason: failed ? locked.web.workerStateReason : (reason ?? locked.web.workerStateReason),
          chunksEmitted: Math.max(chunksEmitted, locked.web.chunksEmitted),
          lastWorkerContactAt: new Date(),
          leaseUntil,
          ...(state === "stopped" ? { stopConfirmedAt: new Date() } : {}),
          reconnectDeadlineAt
        });
      if (state === "active" && !cancelled) await pamSessionDAL.activateSession(sessionId, tx);
      if (state === "stopped" || state === "failed") ended = Boolean(await pamSessionDAL.endSessionById(sessionId, tx));
      return { leaseUntil, expiresAt: locked.session.expiresAt, cancel: cancelled || failed };
    });
    const leaseSeconds = response.cancel ? 0 : webLeaseSeconds(response.leaseUntil, response.expiresAt);
    const shouldCancel = response.cancel || leaseSeconds === 0;
    if (shouldCancel) cancel(record);
    if (ended || stopped) await audit(record, EventType.PAM_SESSION_END);
    if (ended) {
      if (state === "failed") await audit(record, EventType.PAM_WEB_APP_SESSION_WORKER_FAILED, undefined, { reason });
      void reportPamSessionEnded({
        session: { ...record.session, endedAt: new Date() },
        orgId: actor.orgId,
        endReason: PamSessionEndReason.Completed,
        telemetryService,
        userDAL
      });
    }
    return {
      ...response,
      cancel: shouldCancel,
      leaseSeconds: shouldCancel ? 0 : leaseSeconds
    };
  };
  const pamSessionServiceForView = async (record: TWebAppRecord, actor: OrgServiceActor) => {
    if (!record.session.accountId) {
      const { hasRole } = await verifyProductMembership(
        permissionService,
        record.session.projectId,
        actorContext(actor)
      );
      if (!hasRole(PamProductRole.Admin))
        throw new ForbiddenRequestError({
          message: "Only a project admin can access a session whose account has been deleted"
        });
      return;
    }
    const account = await pamAccountDAL.findByIdWithDetails(record.session.accountId, dal.db);
    await checkAccountAccess(
      permissionService,
      record.session.accountId,
      account?.folderId,
      record.session.projectId,
      ResourcePermissionPamResourceActions.ViewSessions,
      actorContext(actor)
    );
  };
  const getSession = async (sessionId: string, actor: OrgServiceActor) => {
    const record = await getRecord(sessionId, actor.orgId);
    if (!record.session.accountId || record.web.createdByUserId !== actor.id || actor.type !== ActorType.USER) {
      await pamSessionServiceForView(record, actor);
    }
    return sessionView(record);
  };
  const listMyActiveSessions = async (projectId: string, actor: OrgServiceActor) => {
    if (actor.type !== ActorType.USER)
      throw new ForbiddenRequestError({ message: "Web App sessions require user authentication" });
    const rows = await dal.findMine(actor.id, projectId);
    return Promise.all(rows.map(async (row) => sessionView(await getRecord(row.sessionId, actor.orgId))));
  };
  const endSession = async (sessionId: string, actor: OrgServiceActor, info: AuditLogInfo) => {
    const record = await getRecord(sessionId, actor.orgId);
    let terminated = false;
    if (!record.session.accountId || record.web.createdByUserId !== actor.id || actor.type !== ActorType.USER) {
      await pamSessionService.terminateSession(sessionId, actorContext(actor));
      terminated = true;
    } else
      terminated = await dal.transaction(async (tx) => {
        await dal.lockRecord(sessionId, tx);
        return Boolean(await pamSessionDAL.terminateSessionById(sessionId, tx));
      });
    cancel(record);
    if (terminated) {
      await audit(record, EventType.PAM_SESSION_TERMINATE, info);
      void reportPamSessionEnded({
        session: { ...record.session, endedAt: new Date() },
        orgId: actor.orgId,
        endReason: PamSessionEndReason.Completed,
        telemetryService,
        userDAL
      });
    }
    await audit(record, EventType.PAM_WEB_APP_SESSION_STOP_REQUESTED, info);
    return sessionView(await getRecord(sessionId, actor.orgId));
  };
  return {
    createSession,
    issueAttachTicket,
    consumeAttachTicket,
    handleAttach,
    reportState,
    getSession,
    listMyActiveSessions,
    endSession,
    assertWebContinuingAccess
  };
};
