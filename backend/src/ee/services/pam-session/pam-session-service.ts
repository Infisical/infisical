import net from "net";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { createSshCert, createSshKeyPair } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { SshCertType } from "@app/ee/services/ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamAccessMethod, PamAccountType, PamSessionStatus } from "../pam/pam-enums";
import { enforceMfa } from "../pam/pam-mfa";
import {
  checkAccountAccess,
  getResourceIdsWithActions,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import { resolveAccessControls } from "../pam/pam-policies";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { extractGatewayTarget, parseInternalMetadata } from "../pam-account/pam-account-schemas";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { generateSessionRecordingSecrets } from "../pam-session-recording/pam-recording-secrets";
import { ResourcePermissionPamResourceActions } from "../permission/resource-permission";
import { DEFAULT_SESSION_DURATION_MS } from "./pam-session-constants";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { TPamSessionExpirationServiceFactory } from "./pam-session-expiration-queue";

type TPamSessionServiceFactoryDep = {
  pamSessionDAL: Pick<
    TPamSessionDALFactory,
    | "findAccessibleByProjectId"
    | "findById"
    | "findOne"
    | "create"
    | "endSessionById"
    | "terminateSessionById"
    | "updateById"
  >;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails" | "findOne">;
  pamFolderDAL: Pick<TPamFolderDALFactory, "findOne">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  userDAL: Pick<TUserDALFactory, "findById">;
  pamSessionExpirationService: Pick<TPamSessionExpirationServiceFactory, "scheduleSessionExpiration">;
  mfaSessionService: Pick<
    TMfaSessionServiceFactory,
    "createMfaSession" | "getMfaSession" | "deleteMfaSession" | "sendMfaCode"
  >;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
};

export type TPamSessionServiceFactory = ReturnType<typeof pamSessionServiceFactory>;

export const pamSessionServiceFactory = ({
  pamSessionDAL,
  pamAccountDAL,
  pamFolderDAL,
  membershipDAL,
  membershipRoleDAL,
  permissionService,
  kmsService,
  gatewayV2Service,
  gatewayPoolService,
  userDAL,
  pamSessionExpirationService,
  mfaSessionService,
  orgDAL
}: TPamSessionServiceFactoryDep) => {
  const decrypt = async (projectId: string, blob: Buffer): Promise<Record<string, unknown>> => {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    return JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf-8")) as Record<string, unknown>;
  };

  const checkAccount = (
    accountId: string,
    folderId: string | null | undefined,
    projectId: string,
    action: ResourcePermissionPamResourceActions,
    ctx: TActorContext
  ) => checkAccountAccess(permissionService, accountId, folderId, projectId, action, ctx);

  const listSessions = async (
    projectId: string,
    ctx: TActorContext,
    pagination?: { offset?: number; limit?: number; search?: string; status?: string }
  ) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const { folderIds, accountIds } = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      { allOf: [ResourcePermissionPamResourceActions.ViewSessions] },
      ctx
    );

    return pamSessionDAL.findAccessibleByProjectId(projectId, {
      viewSessionsFolderIds: folderIds,
      viewSessionsAccountIds: accountIds,
      userId: ctx.actorId,
      ...pagination
    });
  };

  const getSessionById = async (sessionId: string, ctx: TActorContext) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session || !session.accountId) return null;

    const account = await pamAccountDAL.findByIdWithDetails(session.accountId);
    await checkAccount(
      session.accountId,
      account?.folderId,
      session.projectId,
      ResourcePermissionPamResourceActions.ViewSessions,
      ctx
    );

    return session;
  };

  // Called by the gateway
  const getSessionCredentials = async (sessionId: string, gatewayId: string) => {
    const session = await pamSessionDAL.findOne({ id: sessionId, gatewayId });
    if (!session) {
      throw new NotFoundError({ message: "Session not found" });
    }

    if (session.status !== PamSessionStatus.Starting && session.status !== PamSessionStatus.Active) {
      throw new BadRequestError({ message: "Session is not active" });
    }

    if (!session.accountId) {
      throw new BadRequestError({ message: "Session has no linked account" });
    }

    const account = await pamAccountDAL.findByIdWithDetails(session.accountId);
    if (!account) {
      throw new NotFoundError({ message: "Account not found" });
    }

    const connectionDetails = await decrypt(session.projectId, account.encryptedConnectionDetails);
    const credentials = await decrypt(session.projectId, account.encryptedCredentials);

    if (credentials.authMethod === "certificate" && account.encryptedInternalMetadata) {
      const internalMetadata = parseInternalMetadata(
        account.accountType as PamAccountType,
        await decrypt(session.projectId, account.encryptedInternalMetadata)
      );

      if (internalMetadata?.caPrivateKey) {
        const keyAlgorithm = (internalMetadata.caKeyAlgorithm as SshCertKeyAlgorithm) || SshCertKeyAlgorithm.ED25519;
        const { publicKey: clientPublicKey, privateKey: clientPrivateKey } = await createSshKeyPair(keyAlgorithm);

        const username = credentials.username as string;
        const { signedPublicKey } = await createSshCert({
          caPrivateKey: internalMetadata.caPrivateKey,
          clientPublicKey,
          keyId: `pam-session-${session.id}`,
          principals: [username],
          requestedTtl: `${resolveAccessControls(account.templatePolicies).maxSessionDurationSeconds ?? DEFAULT_SESSION_DURATION_MS / 1000}s`,
          certType: SshCertType.USER
        });

        credentials.privateKey = clientPrivateKey;
        credentials.certificate = signedPublicKey;
      }
    }

    const sessionStarted = session.status === PamSessionStatus.Starting;

    let recording: {
      sessionKey: string;
      uploadToken: string;
      storageBackend: PamRecordingStorageBackend;
      projectId: string;
      sessionId: string;
    } | null = null;

    if (!session.encryptedSessionKey) {
      const secrets = await generateSessionRecordingSecrets({
        projectId: session.projectId,
        sessionId,
        kmsService
      });

      await pamSessionDAL.updateById(sessionId, {
        encryptedSessionKey: secrets.encryptedSessionKey,
        gatewayUploadTokenHash: secrets.uploadTokenHash
      });

      recording = {
        sessionKey: secrets.sessionKey.toString("base64"),
        uploadToken: secrets.uploadToken.toString("base64"),
        storageBackend: PamRecordingStorageBackend.Postgres,
        projectId: session.projectId,
        sessionId
      };
    }

    return {
      credentials: { ...connectionDetails, ...credentials },
      recording,
      projectId: session.projectId,
      accountId: session.accountId,
      accountName: session.accountName,
      accountType: session.accountType,
      actorEmail: session.actorEmail,
      sessionStarted
    };
  };

  // Called by the gateway
  const endSessionFromGateway = async (sessionId: string, gatewayId: string) => {
    const session = await pamSessionDAL.findOne({ id: sessionId, gatewayId });
    if (!session) {
      throw new NotFoundError({ message: "Session not found" });
    }

    const updatedSession = await pamSessionDAL.endSessionById(sessionId);

    return {
      projectId: session.projectId,
      accountId: session.accountId,
      accountName: session.accountName,
      alreadyEnded: !updatedSession
    };
  };

  const resolveAccountByPath = async (projectId: string, path: string) => {
    const separatorIdx = path.indexOf("/");
    if (separatorIdx === -1) {
      throw new BadRequestError({
        message: "Path must be in the format 'folderName/accountName'"
      });
    }

    const folderName = path.slice(0, separatorIdx);
    const accountName = path.slice(separatorIdx + 1);
    if (!folderName || !accountName) {
      throw new BadRequestError({
        message: "Path must be in the format 'folderName/accountName'"
      });
    }

    const folder = await pamFolderDAL.findOne({ projectId, name: folderName });
    if (!folder) {
      throw new NotFoundError({ message: `Folder '${folderName}' not found` });
    }

    const accountRow = await pamAccountDAL.findOne({ folderId: folder.id, name: accountName });
    if (!accountRow) {
      throw new NotFoundError({ message: `Account '${accountName}' not found in folder '${folderName}'` });
    }

    const account = await pamAccountDAL.findByIdWithDetails(accountRow.id);
    if (!account) {
      throw new NotFoundError({ message: `Account '${accountName}' not found` });
    }

    return account;
  };

  const access = async ({
    path,
    projectId,
    actor,
    actorEmail,
    actorName,
    actorIp,
    actorUserAgent,
    reason,
    duration,
    mfaSessionId
  }: {
    path: string;
    projectId: string;
    actor: TActorContext;
    actorEmail: string;
    actorName: string;
    actorIp: string;
    actorUserAgent: string;
    reason?: string;
    duration?: string;
    mfaSessionId?: string;
  }) => {
    const account = await resolveAccountByPath(projectId, path);

    await checkAccount(
      account.id,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.LaunchSessions,
      actor
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
        { userId: actor.actorId, orgId: actor.actorOrgId, actorEmail, accountId: account.id, mfaSessionId }
      );
    }

    const maxDurationMs = policy.maxSessionDurationSeconds
      ? policy.maxSessionDurationSeconds * 1000
      : DEFAULT_SESSION_DURATION_MS;

    let sessionDurationMs = maxDurationMs;
    if (duration) {
      const parsed = ms(duration);
      if (!parsed || parsed <= 0) {
        throw new BadRequestError({ message: "Invalid duration format" });
      }
      sessionDurationMs = Math.min(parsed, maxDurationMs);
    }

    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: account.gatewayId ?? account.templateGatewayId,
      gatewayPoolId: account.gatewayPoolId ?? account.templateGatewayPoolId
    });
    if (!effectiveGatewayId) {
      throw new BadRequestError({ message: "Gateway not configured for this account" });
    }

    const rawConnectionDetails = await decrypt(projectId, account.encryptedConnectionDetails);
    const rawCredentials = await decrypt(projectId, account.encryptedCredentials);
    const gatewayTarget = extractGatewayTarget(account.accountType as PamAccountType, rawConnectionDetails);

    const user = await userDAL.findById(actor.actorId);
    const expiresAt = new Date(Date.now() + sessionDurationMs);

    const session = await pamSessionDAL.create({
      status: PamSessionStatus.Starting,
      accessMethod: PamAccessMethod.Cli,
      expiresAt,
      accountName: account.name,
      accountType: account.accountType,
      actorEmail,
      actorIp,
      actorName,
      actorUserAgent,
      projectId,
      accountId: account.id,
      userId: actor.actorId,
      gatewayId: effectiveGatewayId,
      reason: trimmedReason,
      folderName: account.folderName,
      selectedHost: gatewayTarget.host
    });

    await pamSessionExpirationService.scheduleSessionExpiration(session.id, expiresAt);

    const certs = await gatewayV2Service.getPAMConnectionDetails({
      gatewayId: effectiveGatewayId,
      sessionId: session.id,
      accountType: account.accountType as PamAccountType,
      host: gatewayTarget.host,
      port: gatewayTarget.port,
      duration: sessionDurationMs,
      actorMetadata: {
        id: actor.actorId,
        type: ActorType.USER,
        name: user?.email ?? ""
      }
    });

    if (!certs) {
      throw new BadRequestError({ message: "Failed to obtain gateway connection details" });
    }

    const metadata: Record<string, string> = {};

    if (account.accountType === PamAccountType.Kubernetes) {
      metadata.authMethod = rawCredentials.authMethod as string;
      if (rawCredentials.namespace) {
        metadata.namespace = rawCredentials.namespace as string;
      }
      if (rawCredentials.serviceAccountName) {
        metadata.serviceAccountName = rawCredentials.serviceAccountName as string;
      }
    } else {
      metadata.username = rawCredentials.username as string;
      if (
        (account.accountType === PamAccountType.Postgres || account.accountType === PamAccountType.MySQL) &&
        rawConnectionDetails.database
      ) {
        metadata.database = rawConnectionDetails.database as string;
      }
    }

    return {
      sessionId: session.id,
      accountId: account.id,
      accountType: account.accountType as PamAccountType,
      accountName: account.name,
      metadata,
      sessionDurationMs,
      relayHost: certs.relayHost,
      relayClientCertificate: certs.relay.clientCertificate,
      relayClientPrivateKey: certs.relay.clientPrivateKey,
      relayServerCertificateChain: certs.relay.serverCertificateChain,
      gatewayClientCertificate: certs.gateway.clientCertificate,
      gatewayClientPrivateKey: certs.gateway.clientPrivateKey,
      gatewayServerCertificateChain: certs.gateway.serverCertificateChain
    };
  };

  const terminateSession = async (sessionId: string, ctx: TActorContext) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session) {
      throw new NotFoundError({ message: "Session not found" });
    }

    if (session.status !== PamSessionStatus.Active && session.status !== PamSessionStatus.Starting) {
      throw new BadRequestError({ message: "Session is not active" });
    }

    if (!session.accountId) {
      throw new BadRequestError({ message: "Session has no linked account" });
    }

    const account = await pamAccountDAL.findByIdWithDetails(session.accountId);
    await checkAccount(
      session.accountId,
      account?.folderId,
      session.projectId,
      ResourcePermissionPamResourceActions.TerminateSessions,
      ctx
    );

    const updated = await pamSessionDAL.terminateSessionById(sessionId);
    if (!updated) {
      throw new BadRequestError({ message: "Session could not be terminated" });
    }

    if (session.gatewayId) {
      void (async () => {
        let relayConn: net.Socket | null = null;
        try {
          const user = await userDAL.findById(ctx.actorId);
          const certs = await gatewayV2Service.getPAMConnectionDetails({
            gatewayId: session.gatewayId!,
            sessionId,
            accountType: session.accountType as PamAccountType,
            host: "0.0.0.0",
            port: 0,
            actorMetadata: { id: ctx.actorId, type: ActorType.USER, name: user?.email ?? "" }
          });
          if (!certs) {
            logger.error(
              { sessionId, gatewayId: session.gatewayId },
              `Failed to get gateway [gatewayId=${session.gatewayId}] connection details for PAM session [sessionId=${sessionId}] termination`
            );
            return;
          }
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
          logger.error(
            { sessionId, err },
            `Session [sessionId=${sessionId}] termination ALPN signal failed (best-effort)`
          );
        } finally {
          relayConn?.destroy();
        }
      })();
    }

    return { session: updated, projectId: session.projectId, accountName: session.accountName };
  };

  return {
    access,
    listSessions,
    getSessionById,
    getSessionCredentials,
    endSessionFromGateway,
    terminateSession
  };
};
