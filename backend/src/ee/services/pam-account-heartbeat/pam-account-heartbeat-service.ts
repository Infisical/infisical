import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { testConnectionWithGateway } from "@app/ee/services/gateway-v2/gateway-v2-fns";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ResourcePermissionPamResourceActions } from "@app/ee/services/permission/resource-permission";
import { NotFoundError } from "@app/lib/errors";
import { GatewayFailureKind } from "@app/lib/gateway-v2/test-connection-rpc";
import { logger } from "@app/lib/logger";
import { createSshCert, createSshKeyPair, SshCertKeyAlgorithm, SshCertType } from "@app/lib/ssh";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { PamAccountType, PamHeartbeatStatus, PamSshAuthMethod } from "../pam/pam-enums";
import { checkAccountAccess, TActorContext } from "../pam/pam-permission";
import {
  buildGatewayConnectionTest,
  CLOUD_CONNECTION_VALIDATORS,
  TestConnectionMode
} from "../pam-account/pam-account-connection-test";
import { TPamAccountDALFactory, TPamAccountDetail } from "../pam-account/pam-account-dal";
import {
  parseInternalMetadata,
  validateConnectionDetails,
  validateCredentials
} from "../pam-account/pam-account-schemas";
import { isWindowsRotatableType, redactRotationError, TRotatableType } from "../pam-account-rotation/pam-rotation-fns";
import { PAM_ROTATION_FACTORY_MAP, winrmConnectUsername } from "../pam-account-rotation/pam-rotation-handlers";
import { PamTemplateSettingsSchema } from "../pam-account-template/pam-account-template-schemas";
import { TCheckAccountHeartbeatDTO, TPamHeartbeatResult } from "./pam-account-heartbeat-types";
import {
  classifyCloudProbeError,
  computeNextHeartbeatAt,
  HEARTBEAT_SSH_CERT_TTL_SECONDS,
  HEARTBEAT_TIMEOUT_MS,
  isHeartbeatScheduled,
  statusForFailureKind,
  stopsSchedule
} from "./pam-heartbeat-fns";

type TPamAccountHeartbeatServiceFactoryDep = {
  pamAccountDAL: TPamAccountDALFactory;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  permissionService: TPermissionServiceFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  rotationHandlers?: typeof PAM_ROTATION_FACTORY_MAP;
};

export type TPamAccountHeartbeatServiceFactory = ReturnType<typeof pamAccountHeartbeatServiceFactory>;

export const pamAccountHeartbeatServiceFactory = ({
  pamAccountDAL,
  gatewayService,
  gatewayV2Service,
  gatewayPoolService,
  kmsService,
  permissionService,
  projectDAL,
  rotationHandlers = PAM_ROTATION_FACTORY_MAP
}: TPamAccountHeartbeatServiceFactoryDep) => {
  const withCipher = async (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  const decrypt = async (projectId: string, blob: Buffer): Promise<Record<string, unknown>> => {
    const { decryptor } = await withCipher(projectId);
    return JSON.parse(decryptor({ cipherTextBlob: blob }).toString()) as Record<string, unknown>;
  };

  const encryptMessage = async (projectId: string, message: string): Promise<Buffer> => {
    const { encryptor } = await withCipher(projectId);
    return encryptor({ plainText: Buffer.from(JSON.stringify({ message })) }).cipherTextBlob;
  };

  // Certificate accounts hold no long-lived secret: what can break is the host no longer trusting our CA, or the
  // principal no longer existing. Minting a very short-lived certificate and logging in tests exactly that.
  const mintEphemeralSshCertificate = async (
    account: TPamAccountDetail,
    credentials: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    if (credentials.authMethod !== PamSshAuthMethod.Certificate || !account.encryptedInternalMetadata) {
      return credentials;
    }

    const internalMetadata = parseInternalMetadata(
      account.accountType as PamAccountType,
      await decrypt(account.projectId as string, account.encryptedInternalMetadata)
    );
    if (!internalMetadata?.caPrivateKey) return credentials;

    const keyAlgorithm = (internalMetadata.caKeyAlgorithm as SshCertKeyAlgorithm) || SshCertKeyAlgorithm.ED25519;
    const { publicKey: clientPublicKey, privateKey: clientPrivateKey } = await createSshKeyPair(keyAlgorithm);
    const { signedPublicKey } = await createSshCert({
      caPrivateKey: internalMetadata.caPrivateKey,
      clientPublicKey,
      keyId: `pam-hb-${account.id}`,
      principals: [credentials.username as string],
      requestedTtl: `${HEARTBEAT_SSH_CERT_TTL_SECONDS}s`,
      certType: SshCertType.USER
    });

    return { ...credentials, privateKey: clientPrivateKey, certificate: signedPublicKey };
  };

  // A delegated Windows local account usually cannot WinRM in as itself, so the rotator validates its credential on
  // the box the same way rotation does. AD binds with its own credential, so it never needs this.
  const resolveWindowsVerifier = async (
    account: TPamAccountDetail,
    accountType: PamAccountType
  ): Promise<{ username: string; password: string } | undefined> => {
    if (accountType !== PamAccountType.Windows) return undefined;
    if (!account.rotationAccountId || account.rotationAccountId === account.id) return undefined;

    const rotator = await pamAccountDAL.findByIdWithDetails(account.rotationAccountId);
    if (!rotator || rotator.projectId !== account.projectId) return undefined;

    const rotatorCredentials = (await decrypt(account.projectId as string, rotator.encryptedCredentials)) as {
      username?: string;
      password?: string;
    };
    if (!rotatorCredentials.username || !rotatorCredentials.password) return undefined;

    return { username: rotatorCredentials.username, password: rotatorCredentials.password };
  };

  // Runs the account's own auth probe and classifies the outcome. Never throws for a target-side problem: a thrown
  // error from here means we could not run the check at all, which is not a statement about the credential.
  // Collected as the probe decrypts them, so any message we persist can be scrubbed of the credential itself.
  const probe = async (
    account: TPamAccountDetail,
    usedSecrets: string[]
  ): Promise<{ status: PamHeartbeatStatus; message?: string }> => {
    const projectId = account.projectId as string;
    const accountType = account.accountType as PamAccountType;
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: "Project not found" });
    const { orgId } = project;

    if (!account.credentialConfigured) {
      return { status: PamHeartbeatStatus.Unknown, message: "No credential is stored for this account" };
    }

    const connectionDetails = validateConnectionDetails(
      accountType,
      await decrypt(projectId, account.encryptedConnectionDetails)
    ) as Record<string, unknown>;
    const credentials = validateCredentials(
      accountType,
      await decrypt(projectId, account.encryptedCredentials)
    ) as Record<string, unknown>;
    for (const field of ["password", "privateKey", "serviceAccountKeyJson", "clientSecret", "serviceAccountToken"]) {
      const value = credentials[field];
      if (typeof value === "string" && value) usedSecrets.push(value);
    }

    const validateCloud = CLOUD_CONNECTION_VALIDATORS[accountType];
    if (validateCloud) {
      try {
        await validateCloud({ connectionDetails, credentials, orgId });
        return { status: PamHeartbeatStatus.Healthy };
      } catch (err) {
        const status = classifyCloudProbeError(err);
        return { status, message: err instanceof Error ? err.message : "Unable to validate credentials" };
      }
    }

    // Windows and AD have a real credential probe already (WinRM, or an LDAP bind for AD), but only through the
    // rotation handlers; the shared connection test still falls back to a TCP check for them.
    if (isWindowsRotatableType(accountType)) {
      const handler = rotationHandlers[accountType as TRotatableType];
      const { username, password } = credentials as { username: string; password?: string };
      if (!password) {
        return { status: PamHeartbeatStatus.Unknown, message: "No password is stored for this account" };
      }

      const verifyVia = await resolveWindowsVerifier(account, accountType);
      if (verifyVia?.password) usedSecrets.push(verifyVia.password);

      // A self-checked Windows account surfaces a rejected password as a thrown 401 rather than `false`, so
      // without this branch it would read as unreachable and keep retrying into a lockout.
      let authenticated: boolean;
      try {
        authenticated = await handler.testCredential(
          {
            accountType: accountType as TRotatableType,
            connectionDetails,
            auth: {
              username: winrmConnectUsername(accountType as TRotatableType, connectionDetails, username),
              password
            },
            verifyVia,
            gatewayId: account.gatewayId ?? account.templateGatewayId,
            gatewayPoolId: account.gatewayPoolId ?? account.templateGatewayPoolId
          },
          { gatewayService, gatewayV2Service, gatewayPoolService }
        );
      } catch (err) {
        const kind = (err as { gatewayFailureKind?: GatewayFailureKind | null }).gatewayFailureKind ?? null;
        if (kind === "auth") {
          return {
            status: PamHeartbeatStatus.InvalidCredentials,
            message: "The target rejected this credential"
          };
        }
        throw err;
      }

      return authenticated
        ? { status: PamHeartbeatStatus.Healthy }
        : { status: PamHeartbeatStatus.InvalidCredentials, message: "The target rejected this credential" };
    }

    const probeCredentials =
      accountType === PamAccountType.SSH ? await mintEphemeralSshCertificate(account, credentials) : credentials;

    const test = await buildGatewayConnectionTest(accountType, connectionDetails, probeCredentials, orgId, {
      allowWindowsAuthSql: true
    });
    if (!test) {
      return { status: PamHeartbeatStatus.Unknown, message: "This account type cannot be checked yet" };
    }

    // Every account type has a login-based check, so a TCP fallback here means the stored credential is incomplete
    // (an SSH certificate account with no CA, a Kubernetes account missing its auth fields). Reaching the host proves
    // nothing about the credential, so it can never read as Healthy.
    if (test.request.mode === TestConnectionMode.Tcp) {
      return {
        status: PamHeartbeatStatus.Unknown,
        message: "This account is missing the credential details needed to sign in"
      };
    }

    const gatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: account.gatewayId ?? account.templateGatewayId,
      gatewayPoolId:
        (account.gatewayId ?? account.templateGatewayId)
          ? null
          : (account.gatewayPoolId ?? account.templateGatewayPoolId)
    });
    if (!gatewayId) {
      return { status: PamHeartbeatStatus.CannotCheck, message: "No gateway is attached to this account" };
    }

    const result = await testConnectionWithGateway(
      test.host,
      test.port,
      gatewayId,
      gatewayV2Service,
      test.request,
      HEARTBEAT_TIMEOUT_MS
    );

    // A null result is our own gateway failing to answer, never the target refusing the credential.
    if (!result) {
      return { status: PamHeartbeatStatus.CannotCheck, message: "The gateway could not be reached" };
    }
    if (!result.ok) {
      return { status: statusForFailureKind(result.kind), message: result.errorMessage };
    }
    return { status: PamHeartbeatStatus.Healthy };
  };

  const recordResult = async (
    account: TPamAccountDetail,
    outcome: { status: PamHeartbeatStatus; message?: string },
    now: Date
  ) => {
    const projectId = account.projectId as string;
    const heartbeat = PamTemplateSettingsSchema.safeParse(account.templateSettings).data?.heartbeat;

    const nextHeartbeatAt =
      isHeartbeatScheduled(heartbeat) && !stopsSchedule(outcome.status)
        ? computeNextHeartbeatAt({ anchor: now, intervalSeconds: heartbeat.intervalSeconds as number, now })
        : null;

    await pamAccountDAL.updateById(account.id, {
      heartbeatStatus: outcome.status,
      lastHeartbeatAt: now,
      ...(outcome.status === PamHeartbeatStatus.Healthy ? { lastHeartbeatHealthyAt: now } : {}),
      encryptedLastHeartbeatMessage: outcome.message ? await encryptMessage(projectId, outcome.message) : null,
      nextHeartbeatAt
    });
  };

  const runCheck = async (account: TPamAccountDetail): Promise<TPamHeartbeatResult> => {
    const now = new Date();
    // A target can echo the credential back in its error (the WinRM path interpolates it into a script), and
    // this message is persisted and audited, so everything the probe used gets scrubbed out of it.
    const usedSecrets: string[] = [];
    let outcome: { status: PamHeartbeatStatus; message?: string };
    try {
      outcome = await probe(account, usedSecrets);
    } catch (err) {
      logger.warn(err, `PAM heartbeat could not complete [accountId=${account.id}]`);
      outcome = {
        status: PamHeartbeatStatus.CannotCheck,
        message: redactRotationError(err, usedSecrets)
      };
    }
    if (outcome.message) {
      outcome = { ...outcome, message: redactRotationError(new Error(outcome.message), usedSecrets) };
    }

    await recordResult(account, outcome, now);

    return {
      accountId: account.id,
      projectId: account.projectId as string,
      accountType: account.accountType as PamAccountType,
      status: outcome.status,
      ...(outcome.message ? { message: outcome.message } : {})
    };
  };

  const checkScheduledAccount = async (accountId: string): Promise<TPamHeartbeatResult | null> => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account) return null;
    return runCheck(account);
  };

  const checkAccount = async ({ accountId, projectId }: TCheckAccountHeartbeatDTO, ctx: TActorContext) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    await checkAccountAccess(
      permissionService,
      account.id,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.EditAccounts,
      ctx
    );

    return runCheck(account);
  };

  const getHeartbeat = async ({ accountId, projectId }: TCheckAccountHeartbeatDTO, ctx: TActorContext) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    await checkAccountAccess(
      permissionService,
      account.id,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.ReadAccounts,
      ctx
    );

    const heartbeat = PamTemplateSettingsSchema.safeParse(account.templateSettings).data?.heartbeat;

    let lastMessage: string | null = null;
    if (account.encryptedLastHeartbeatMessage) {
      const decrypted = await decrypt(projectId, account.encryptedLastHeartbeatMessage);
      lastMessage = (decrypted as { message?: string }).message ?? null;
    }

    return {
      enabled: heartbeat?.enabled ?? false,
      intervalSeconds: heartbeat?.intervalSeconds ?? null,
      status: (account.heartbeatStatus as PamHeartbeatStatus | null) ?? null,
      lastCheckedAt: account.lastHeartbeatAt ?? null,
      lastHealthyAt: account.lastHeartbeatHealthyAt ?? null,
      nextCheckAt: account.nextHeartbeatAt ?? null,
      templateName: account.templateName,
      lastMessage
    };
  };

  return { checkAccount, checkScheduledAccount, getHeartbeat };
};
