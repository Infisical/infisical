import { Impersonated, JWT } from "google-auth-library";
import RE2 from "re2";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { createSshCert, createSshKeyPair } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { SshCertType } from "@app/ee/services/ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { buildGcpSourceCredential } from "@app/services/app-connection/gcp/gcp-connection-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import {
  GcpServiceAccountAuthMethod,
  PamAccessMethod,
  PamAccessStatus,
  PamAccountType,
  PamSessionStatus
} from "../pam/pam-enums";
import { resolveAccountByPath as resolveAccountByPathFn } from "../pam/pam-fns";
import { enforceMfa } from "../pam/pam-mfa";
import {
  checkAccountAccess,
  getResourceIdsWithActions,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import {
  PamPolicyType,
  PamSettingType,
  policyAppliesTo,
  resolveAccessControls,
  resolvePolicy,
  splitPatternString
} from "../pam/pam-policies";
import { TPamAccessRequestServiceFactory } from "../pam-access-request/pam-access-request-service";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import {
  buildSessionGatewayConnectionDetails,
  extractGatewayTarget,
  getAccountAccessibilityIssues,
  PamAccountAccessibilityIssue,
  parseInternalMetadata,
  resolveGatewayAccountType,
  resolveSelectedHost
} from "../pam-account/pam-account-schemas";
import { PamTemplateSettingsSchema } from "../pam-account-template/pam-account-template-schemas";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { decryptSessionKey, generateSessionRecordingSecrets } from "../pam-session-recording/pam-recording-secrets";
import { ResourcePermissionPamResourceActions } from "../permission/resource-permission";
import {
  AWS_STS_MIN_DURATION_SECONDS,
  exchangeCredentialsForConsoleUrl,
  extractAwsAccountIdFromArn,
  generateAwsIamSessionCredentials
} from "./aws-iam/aws-iam-federation";
import { DEFAULT_SESSION_DURATION_MS } from "./pam-session-constants";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { TPamSessionExpirationServiceFactory } from "./pam-session-expiration-queue";
import { sendPamSessionCancellationSignal } from "./pam-session-fns";

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
    | "activateSession"
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
  pamAccessRequestService: Pick<
    TPamAccessRequestServiceFactory,
    "checkGrant" | "getAccessStatusBatch" | "getFolderPolicyConfigured"
  >;
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
  orgDAL,
  pamAccessRequestService
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

  const enforceRecordingConfig = (account: Parameters<typeof getAccountAccessibilityIssues>[0]) => {
    const issues = getAccountAccessibilityIssues(account);
    if (issues.includes(PamAccountAccessibilityIssue.NoRecordingConfig)) {
      throw new BadRequestError({
        message: "S3 recording must be configured before launching this account"
      });
    }
  };

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

    if (account.accountType === PamAccountType.GcpServiceAccount) {
      const serviceAccountEmail = connectionDetails.serviceAccountEmail as string;
      const remainingSeconds = Math.max(1, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
      const sessionTtlSeconds = Math.min(remainingSeconds, 3600);

      let tokenResponse;

      if (credentials.authMethod === GcpServiceAccountAuthMethod.StaticKey) {
        const keyJson = JSON.parse(credentials.serviceAccountKeyJson as string) as {
          client_email: string;
          private_key: string;
        };
        const jwtClient = new JWT({
          email: keyJson.client_email,
          key: keyJson.private_key,
          scopes: ["https://www.googleapis.com/auth/cloud-platform"]
        });

        if (keyJson.client_email === serviceAccountEmail) {
          try {
            tokenResponse = await jwtClient.getAccessToken();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new BadRequestError({
              message: `Failed to obtain GCP access token for [serviceAccountEmail=${serviceAccountEmail}]: ${msg}`
            });
          }
        } else {
          const impersonated = new Impersonated({
            sourceClient: jwtClient,
            targetPrincipal: serviceAccountEmail,
            lifetime: sessionTtlSeconds,
            delegates: [],
            targetScopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/iam"]
          });
          try {
            tokenResponse = await impersonated.getAccessToken();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new BadRequestError({
              message: `Failed to obtain GCP access token for [serviceAccountEmail=${serviceAccountEmail}]: ${msg}`
            });
          }
        }
      } else {
        const appCfg = getConfig();
        if (!appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) {
          throw new InternalServerError({
            message: "Environment variable has not been configured: INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL"
          });
        }
        const sourceClient = buildGcpSourceCredential(appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL);
        const impersonated = new Impersonated({
          sourceClient,
          targetPrincipal: serviceAccountEmail,
          lifetime: sessionTtlSeconds,
          delegates: [],
          targetScopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/iam"]
        });
        try {
          tokenResponse = await impersonated.getAccessToken();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new BadRequestError({
            message: `Failed to obtain GCP access token for [serviceAccountEmail=${serviceAccountEmail}]: ${msg}`
          });
        }
      }

      if (!tokenResponse?.token) {
        throw new BadRequestError({
          message: `Failed to obtain GCP access token for [serviceAccountEmail=${serviceAccountEmail}]`
        });
      }

      credentials.token = tokenResponse.token;
      delete credentials.serviceAccountKeyJson;
    }

    const sessionStarted = session.status === PamSessionStatus.Starting;

    if (sessionStarted) {
      await pamSessionDAL.activateSession(sessionId);
    }

    const templateSettingsParsed = account.templateSettings
      ? PamTemplateSettingsSchema.safeParse(account.templateSettings)
      : null;
    const resolvedBackend =
      templateSettingsParsed?.success && templateSettingsParsed.data.recordingStorageBackend
        ? templateSettingsParsed.data.recordingStorageBackend
        : PamRecordingStorageBackend.Postgres;

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
        storageBackend: resolvedBackend,
        projectId: session.projectId,
        sessionId
      };
    } else {
      // On re-fetch (e.g. gateway restart) return the existing key; empty token since the gateway
      // restores its own from disk and the server only keeps the token hash.
      const sessionKey = await decryptSessionKey({
        projectId: session.projectId,
        sessionId,
        encryptedSessionKey: session.encryptedSessionKey,
        kmsService
      });

      recording = {
        sessionKey: sessionKey.toString("base64"),
        uploadToken: "",
        storageBackend: resolvedBackend,
        projectId: session.projectId,
        sessionId
      };
    }

    const commandBlockingPatterns = policyAppliesTo(
      PamPolicyType.CommandBlocking,
      account.accountType as PamAccountType
    )
      ? splitPatternString(resolvePolicy(account.templatePolicies, PamPolicyType.CommandBlocking))
      : [];

    const parsedSettings = PamTemplateSettingsSchema.safeParse(account.templateSettings ?? {});
    const maskingPatterns = parsedSettings.success
      ? splitPatternString(parsedSettings.data.sessionLogMaskingPatterns)
      : [];

    const policyRules =
      commandBlockingPatterns.length > 0 || maskingPatterns.length > 0
        ? {
            ...(commandBlockingPatterns.length > 0
              ? { [PamPolicyType.CommandBlocking]: { patterns: commandBlockingPatterns } }
              : {}),
            ...(maskingPatterns.length > 0 ? { [PamSettingType.SessionLogMasking]: { patterns: maskingPatterns } } : {})
          }
        : null;

    const normalizedConnectionDetails = buildSessionGatewayConnectionDetails(
      account.accountType as PamAccountType,
      connectionDetails,
      session.selectedHost
    );

    return {
      credentials: { ...normalizedConnectionDetails, ...credentials },
      recording,
      policyRules,
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

  const resolveAccountByPath = (projectId: string, path: string) =>
    resolveAccountByPathFn({ pamFolderDAL, pamAccountDAL }, projectId, path);

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
    mfaSessionId,
    accessMethod = PamAccessMethod.Cli,
    targetHost
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
    accessMethod?: PamAccessMethod;
    targetHost?: string;
  }) => {
    const account = await resolveAccountByPath(projectId, path);

    const policy = resolveAccessControls(account.templatePolicies);
    const { requiresApproval } = policy;

    // Approval is a layer on top of standing access: gated accounts require LaunchSessions AND an
    // approved grant, so losing LaunchSessions blocks launch even while a grant is still active.
    await checkAccount(
      account.id,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.LaunchSessions,
      actor
    );

    const trimmedReason = reason?.trim() || null;

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

    // The approval gate comes before the launch-reason check: a user without a grant should be
    // guided into requesting access (where the request reason is collected) rather than being
    // blocked on a launch reason for a session they cannot start yet.
    if (requiresApproval) {
      const grant = await pamAccessRequestService.checkGrant({
        userId: actor.actorId,
        accountId: account.id,
        accountFolderId: account.folderId,
        projectId
      });
      if (!grant) {
        // Distinguish "no request yet" from "request awaiting review" and from "folder has no
        // approvers", so the CLI can guide the user instead of prompting into a 400
        const [statusMap, foldersWithApprovalPolicy] = await Promise.all([
          pamAccessRequestService.getAccessStatusBatch(actor.actorId, [account.id], projectId),
          pamAccessRequestService.getFolderPolicyConfigured(account.folderId ? [account.folderId] : [])
        ]);
        throw new ForbiddenRequestError({
          name: "PAM_APPROVAL_REQUIRED",
          message: "Access request required",
          details: {
            requireReason: policy.requireReason,
            hasPendingRequest: statusMap.get(account.id)?.accessStatus === PamAccessStatus.Pending,
            hasApprovalPolicy: Boolean(account.folderId && foldersWithApprovalPolicy.has(account.folderId))
          }
        });
      }
      // A null expiresAt means a never-expiring grant per the checkGrant contract
      if (grant.expiresAt) {
        const grantRemainingMs = new Date(grant.expiresAt).getTime() - Date.now();
        if (grantRemainingMs <= 0) {
          throw new ForbiddenRequestError({
            name: "PAM_GRANT_EXPIRED",
            message: "Your approved access has expired",
            details: { requireReason: policy.requireReason }
          });
        }
        sessionDurationMs = Math.min(sessionDurationMs, grantRemainingMs);
      }
    }

    if (policy.requireReason && !trimmedReason) {
      throw new BadRequestError({
        name: "PAM_REASON_REQUIRED",
        message: "A reason is required to access this account"
      });
    }

    // AWS IAM: no gateway, no proxy -- generate STS credentials directly
    if (account.accountType === PamAccountType.AwsIam) {
      const stsDurationSeconds = Math.floor(sessionDurationMs / 1000);

      if (stsDurationSeconds < AWS_STS_MIN_DURATION_SECONDS) {
        throw new BadRequestError({
          message: `AWS IAM sessions require a minimum duration of ${AWS_STS_MIN_DURATION_SECONDS} seconds (15 minutes)`
        });
      }

      const rawConnectionDetails = await decrypt(projectId, account.encryptedConnectionDetails);
      const rawCredentials = await decrypt(projectId, account.encryptedCredentials);

      const stsCredentials = await generateAwsIamSessionCredentials({
        connectionDetails: { roleArn: rawConnectionDetails.roleArn as string },
        targetRoleArn: rawCredentials.targetRoleArn as string,
        roleSessionName: actorEmail.replace(new RE2(/[^\w+=,.@-]/g), "_").substring(0, 64),
        projectId,
        sessionDuration: stsDurationSeconds
      });

      const { expiresAt } = stsCredentials;

      const metadata: Record<string, string> = {};

      if (accessMethod === PamAccessMethod.Web) {
        const consoleUrl = await exchangeCredentialsForConsoleUrl({
          accessKeyId: stsCredentials.accessKeyId,
          secretAccessKey: stsCredentials.secretAccessKey,
          sessionToken: stsCredentials.sessionToken
        });
        metadata.consoleUrl = consoleUrl;
      } else {
        metadata.accessKeyId = stsCredentials.accessKeyId;
        metadata.secretAccessKey = stsCredentials.secretAccessKey;
        metadata.sessionToken = stsCredentials.sessionToken;
        metadata.expiresAt = expiresAt.toISOString();
        metadata.targetRoleArn = rawCredentials.targetRoleArn as string;
        metadata.federatedUsername = actorEmail;

        const awsAccountId = extractAwsAccountIdFromArn(rawConnectionDetails.roleArn as string);
        if (awsAccountId) {
          metadata.awsAccountId = awsAccountId;
        }
      }

      const session = await pamSessionDAL.create({
        status: PamSessionStatus.Active,
        accessMethod,
        expiresAt,
        startedAt: new Date(),
        accountName: account.name,
        accountType: account.accountType,
        actorEmail,
        actorIp,
        actorName,
        actorUserAgent,
        projectId,
        accountId: account.id,
        userId: actor.actorId,
        reason: trimmedReason,
        folderName: account.folderName
      });

      await pamSessionExpirationService.scheduleSessionExpiration(session.id, expiresAt);

      return {
        sessionId: session.id,
        accountId: account.id,
        accountType: account.accountType as PamAccountType,
        accountName: account.name,
        metadata,
        sessionDurationMs
      };
    }

    enforceRecordingConfig(account);

    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: account.gatewayId ?? account.templateGatewayId,
      gatewayPoolId: account.gatewayPoolId ?? account.templateGatewayPoolId
    });
    if (!effectiveGatewayId) {
      throw new BadRequestError({ message: "Gateway not configured for this account" });
    }

    const rawConnectionDetails = await decrypt(projectId, account.encryptedConnectionDetails);
    const rawCredentials = await decrypt(projectId, account.encryptedCredentials);
    const gatewayTarget = await extractGatewayTarget(account.accountType as PamAccountType, rawConnectionDetails);

    const connectHost =
      resolveSelectedHost(account.accountType as PamAccountType, rawConnectionDetails, targetHost) ??
      gatewayTarget.host;

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
      selectedHost: connectHost
    });

    await pamSessionDAL.activateSession(session.id);
    await pamSessionExpirationService.scheduleSessionExpiration(session.id, expiresAt);

    const certs = await gatewayV2Service.getPAMConnectionDetails({
      gatewayId: effectiveGatewayId,
      sessionId: session.id,
      accountType: resolveGatewayAccountType(account.accountType as PamAccountType),
      host: connectHost,
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

    if (account.accountType === PamAccountType.GcpServiceAccount) {
      metadata.serviceAccountEmail = rawConnectionDetails.serviceAccountEmail as string;
      metadata.authMethod = rawCredentials.authMethod as string;
    } else if (account.accountType === PamAccountType.Kubernetes) {
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
        (account.accountType === PamAccountType.Postgres ||
          account.accountType === PamAccountType.MySQL ||
          account.accountType === PamAccountType.MongoDB ||
          account.accountType === PamAccountType.MsSQL) &&
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
      const user = await userDAL.findById(ctx.actorId);
      sendPamSessionCancellationSignal({
        sessionId,
        gatewayId: session.gatewayId,
        accountType: session.accountType,
        actorId: ctx.actorId,
        actorEmail: user?.email ?? "",
        gatewayV2Service
      });
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
