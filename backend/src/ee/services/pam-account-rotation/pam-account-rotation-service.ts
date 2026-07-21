import pLimit from "p-limit";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ResourcePermissionPamResourceActions } from "@app/ee/services/permission/resource-permission";
import { generatePassword } from "@app/ee/services/secret-rotation-v2/shared/utils";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { WinRmRpcEndpoint } from "@app/lib/gateway-v2/winrm-rpc";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { PamAccountType } from "../pam/pam-enums";
import { checkAccountAccess, getResourceIdsWithActions, TActorContext } from "../pam/pam-permission";
import { TPamAccountDALFactory, TPamAccountDetail } from "../pam-account/pam-account-dal";
import { validateConnectionDetails, validateCredentials } from "../pam-account/pam-account-schemas";
import { PamTemplateSettingsSchema } from "../pam-account-template/pam-account-template-schemas";
import { TPamAccountDependencyDALFactory } from "../pam-discovery/pam-account-dependency-dal";
import { winrmRpcWithGateway } from "../pam-discovery/pam-discovery-fns";
import {
  TGetPamAccountRotationDTO,
  TListPamRotationCandidatesDTO,
  TPamAccountRotationView,
  TRotatePamAccountDTO,
  TSetPamRotationAccountDTO
} from "./pam-account-rotation-types";
import {
  computeNextRotationAt,
  getRotationReadiness,
  isRotatableAccountType,
  isWindowsRotatableType,
  PamRotationReadinessIssue,
  redactRotationError,
  ROTATION_FAILURE_RETRY_CAP_SECONDS
} from "./pam-rotation-fns";
import { PAM_ROTATION_FACTORY_MAP } from "./pam-rotation-handlers";

export const ROTATION_STATUS = { Success: "success", Failed: "failed" } as const;

const ROTATION_IN_PROGRESS_MESSAGE = "A rotation is already in progress for this account";

const ROTATION_NOT_READY_MESSAGE: Record<PamRotationReadinessIssue, string> = {
  [PamRotationReadinessIssue.UnsupportedType]: "Rotation is not supported for this account type",
  [PamRotationReadinessIssue.NotConfigured]: "No rotation account is configured for this account",
  [PamRotationReadinessIssue.SelfRotationNoCredential]:
    "This account has no stored credential to rotate its own password"
};

type TPamAccountRotationServiceFactoryDep = {
  pamAccountDAL: Pick<
    TPamAccountDALFactory,
    | "findById"
    | "findByIdWithDetails"
    | "updateById"
    | "findRotationCandidates"
    | "reconcileRotationScheduleForAccount"
    | "transaction"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  pamAccountDependencyDAL: Pick<TPamAccountDependencyDALFactory, "findByAccountId" | "updateById">;
  rotationHandlers?: typeof PAM_ROTATION_FACTORY_MAP;
};

export type TPamAccountRotationServiceFactory = ReturnType<typeof pamAccountRotationServiceFactory>;

export const pamAccountRotationServiceFactory = (deps: TPamAccountRotationServiceFactoryDep) => {
  const {
    pamAccountDAL,
    permissionService,
    membershipDAL,
    membershipRoleDAL,
    kmsService,
    keyStore,
    gatewayService,
    gatewayV2Service,
    gatewayPoolService,
    pamAccountDependencyDAL,
    rotationHandlers = PAM_ROTATION_FACTORY_MAP
  } = deps;

  const gatewayDeps = { gatewayService, gatewayV2Service, gatewayPoolService };

  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  const encrypt = async (projectId: string, data: Record<string, unknown>) => {
    const { encryptor } = await getProjectCipher(projectId);
    return encryptor({ plainText: Buffer.from(JSON.stringify(data)) }).cipherTextBlob;
  };

  const decrypt = async (projectId: string, blob: Buffer): Promise<Record<string, unknown>> => {
    const { decryptor } = await getProjectCipher(projectId);
    return JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf-8")) as Record<string, unknown>;
  };

  type TSqlAccountCredentials = { username: string; password?: string; authMethod?: string };

  const decryptSqlCredentials = async (
    projectId: string,
    accountType: PamAccountType,
    blob: Buffer
  ): Promise<TSqlAccountCredentials> =>
    validateCredentials(accountType, await decrypt(projectId, blob)) as TSqlAccountCredentials;

  const checkAccount = (
    accountId: string,
    folderId: string | null | undefined,
    projectId: string,
    action: ResourcePermissionPamResourceActions,
    ctx: TActorContext
  ) => checkAccountAccess(permissionService, accountId, folderId, projectId, action, ctx);

  const getRotationConfig = (templateSettings: unknown) =>
    PamTemplateSettingsSchema.safeParse(templateSettings).data?.rotation;

  const getPasswordRequirements = (templateSettings: unknown) =>
    PamTemplateSettingsSchema.safeParse(templateSettings).data?.passwordRequirements;

  const nextRotationAfter = (templateSettings: unknown, now: Date): Date | null => {
    const rotation = getRotationConfig(templateSettings);
    if (!rotation?.enabled || rotation.intervalSeconds == null) return null;
    return computeNextRotationAt({ anchor: now, intervalSeconds: rotation.intervalSeconds, now });
  };

  const markRotated = (account: TPamAccountDetail, encryptedBlob: Buffer, now: Date) =>
    pamAccountDAL.updateById(account.id, {
      encryptedCredentials: encryptedBlob,
      encryptedPendingCredentials: null,
      credentialConfigured: true,
      lastRotatedAt: now,
      rotationStatus: ROTATION_STATUS.Success,
      encryptedLastRotationMessage: null,
      nextRotationAt: nextRotationAfter(account.templateSettings, now)
    });

  const resolveConnectionDetails = (
    accountType: PamAccountType,
    raw: Record<string, unknown>
  ): Record<string, unknown> => validateConnectionDetails(accountType, raw) as Record<string, unknown>;

  // Windows dependencies have no per-machine WinRM port; use the WinRM HTTP default like discovery/rotation.
  const WINRM_DEPENDENCY_SYNC_PORT = 5985;
  const DEPENDENCY_SYNC_CONCURRENCY = 5;

  // postRotate: push the new password into every service / scheduled task / IIS app pool that runs as the
  // account, connecting to each dependency's machine as the (delegated admin) rotator. Best-effort: a per-
  // dependency failure is recorded on the row and never fails the account rotation.
  const syncDependenciesAfterRotation = async ({
    accountId,
    projectId,
    accountType,
    targetUsername,
    newPassword,
    connectAuth,
    gatewayId,
    gatewayPoolId
  }: {
    accountId: string;
    projectId: string;
    accountType: PamAccountType;
    targetUsername: string;
    newPassword: string;
    connectAuth: { username: string; password: string };
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
  }) => {
    // Dependencies are detected only for domain accounts today.
    if (accountType !== PamAccountType.WindowsAd) return;

    const dependencies = await pamAccountDependencyDAL.findByAccountId(accountId);
    if (!dependencies.length) return;

    const resolvedGatewayId = gatewayPoolId
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId, gatewayPoolId })
      : gatewayId;
    if (!resolvedGatewayId) {
      logger.warn(`PAM dependency sync skipped, no gateway available [accountId=${accountId}]`);
      return;
    }

    const { encryptor } = await getProjectCipher(projectId);
    const limit = pLimit(DEPENDENCY_SYNC_CONCURRENCY);

    await Promise.all(
      dependencies.map((dep) =>
        limit(async () => {
          await pamAccountDependencyDAL.updateById(dep.id, { rotationStatus: "pending" });
          try {
            const depData = dep.data as { runAsAccount?: string; resolvedIp?: string };
            const runAsAccount = depData?.runAsAccount ?? targetUsername;
            // Prefer the IP resolved at scan time: the gateway can't always resolve AD hostnames directly.
            const targetHost = depData?.resolvedIp || dep.machine;
            await winrmRpcWithGateway<{ ok: boolean }>({
              targetHost,
              targetPort: WINRM_DEPENDENCY_SYNC_PORT,
              gatewayId: resolvedGatewayId,
              gatewayV2Service,
              endpoint: WinRmRpcEndpoint.SyncDependency,
              credentials: { username: connectAuth.username, password: connectAuth.password },
              params: { type: dep.type, name: dep.name, runAsUsername: runAsAccount, newPassword }
            });
            await pamAccountDependencyDAL.updateById(dep.id, {
              rotationStatus: "success",
              lastRotatedAt: new Date(),
              encryptedLastRotationMessage: null
            });
          } catch (err) {
            const message = redactRotationError(err, [newPassword, connectAuth.password]);
            logger.warn(err, `PAM dependency sync failed [accountId=${accountId}] [dependencyId=${dep.id}]`);
            await pamAccountDependencyDAL.updateById(dep.id, {
              rotationStatus: "failed",
              encryptedLastRotationMessage: encryptor({ plainText: Buffer.from(message) }).cipherTextBlob
            });
          }
        })
      )
    );
  };

  // A delegated rotator must sit on the same resource as its target so its credential can reach it: same
  // host for SQL / local Windows, same domain controller for Windows AD.
  const isSameResource = (
    accountType: PamAccountType,
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): boolean => {
    if (accountType === PamAccountType.WindowsAd) return a.dcAddress === b.dcAddress && a.domain === b.domain;
    if (isWindowsRotatableType(accountType)) return a.host === b.host;
    return a.host === b.host && a.port === b.port;
  };

  const assertRotatorSameResource = (
    accountType: PamAccountType,
    rotatorConn: Record<string, unknown>,
    targetConn: Record<string, unknown>
  ) => {
    if (isSameResource(accountType, rotatorConn, targetConn)) return;
    let detail = "on the same resource (host and port) as";
    if (accountType === PamAccountType.WindowsAd) detail = "in the same domain as";
    else if (isWindowsRotatableType(accountType)) detail = "on the same host as";
    throw new BadRequestError({ message: `Rotation account is no longer ${detail} this account` });
  };

  const resolveRotator = async (
    account: TPamAccountDetail,
    targetCredentials: TSqlAccountCredentials,
    targetConnectionDetails: Record<string, unknown>,
    targetGateway: { gatewayId?: string | null; gatewayPoolId?: string | null }
  ): Promise<{
    auth: { username: string; password: string };
    connectionDetails: Record<string, unknown>;
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
  }> => {
    const projectId = account.projectId as string;

    if (account.rotationAccountId === account.id) {
      if (!targetCredentials.password) {
        throw new BadRequestError({ message: "Account has no stored password to self-rotate" });
      }
      return {
        auth: { username: targetCredentials.username, password: targetCredentials.password },
        connectionDetails: targetConnectionDetails,
        ...targetGateway
      };
    }

    const rotator = await pamAccountDAL.findByIdWithDetails(account.rotationAccountId as string);
    if (!rotator || rotator.projectId !== projectId) {
      throw new BadRequestError({ message: "Rotation account no longer exists" });
    }
    // Rotator is enforced same-type as the target at set time, so validate with the target's type.
    const rotatorCredentials = await decryptSqlCredentials(
      projectId,
      account.accountType as PamAccountType,
      rotator.encryptedCredentials
    );
    if (!rotatorCredentials.password) {
      throw new BadRequestError({ message: "Rotation account has no stored password" });
    }
    const rotatorConnectionDetails = resolveConnectionDetails(
      account.accountType as PamAccountType,
      await decrypt(projectId, rotator.encryptedConnectionDetails)
    );
    return {
      auth: { username: rotatorCredentials.username, password: rotatorCredentials.password },
      connectionDetails: rotatorConnectionDetails,
      gatewayId: rotator.gatewayId ?? rotator.templateGatewayId,
      gatewayPoolId: rotator.gatewayPoolId ?? rotator.templateGatewayPoolId
    };
  };

  const rotateWithinLock = async (account: TPamAccountDetail) => {
    const projectId = account.projectId as string;
    const accountType = account.accountType as PamAccountType;

    if (!isRotatableAccountType(accountType)) {
      throw new BadRequestError({ message: `Rotation is not supported for ${accountType} accounts` });
    }
    if (!account.rotationAccountId) {
      throw new BadRequestError({ message: "No rotation account configured for this account" });
    }

    const targetCredentials = await decryptSqlCredentials(projectId, accountType, account.encryptedCredentials);
    const targetUsername = targetCredentials.username;
    const handler = rotationHandlers[accountType];

    handler.validateTarget({ accountType, authMethod: targetCredentials.authMethod });

    const connectionDetails = resolveConnectionDetails(
      accountType,
      await decrypt(projectId, account.encryptedConnectionDetails)
    );
    const gatewayId = account.gatewayId ?? account.templateGatewayId;
    const gatewayPoolId = account.gatewayPoolId ?? account.templateGatewayPoolId;
    const now = new Date();

    if (account.rotationAccountId !== account.id) {
      const rotator = await pamAccountDAL.findByIdWithDetails(account.rotationAccountId);
      if (!rotator || rotator.projectId !== projectId) {
        throw new BadRequestError({ message: "Rotation account no longer exists" });
      }
      const rotatorConnection = resolveConnectionDetails(
        accountType,
        await decrypt(projectId, rotator.encryptedConnectionDetails)
      );
      assertRotatorSameResource(accountType, rotatorConnection, connectionDetails);
    }

    // Recovery from an interrupted rotation: probe the candidate then the current credential, acting only on a
    // definitive answer so a transient failure never discards a possibly-live credential.
    if (account.encryptedPendingCredentials) {
      const pending = await decryptSqlCredentials(projectId, accountType, account.encryptedPendingCredentials);
      const gatewayTarget = { accountType, connectionDetails, gatewayId, gatewayPoolId };

      const pendingWorks = await handler.testCredential(
        { ...gatewayTarget, auth: { username: targetUsername, password: pending.password ?? "" } },
        gatewayDeps
      );
      if (pendingWorks) {
        await markRotated(account, account.encryptedPendingCredentials, now);
        return;
      }

      const currentPassword = targetCredentials.password;
      const currentWorks = currentPassword
        ? await handler.testCredential(
            { ...gatewayTarget, auth: { username: targetUsername, password: currentPassword } },
            gatewayDeps
          )
        : false;
      if (!currentWorks && currentPassword) {
        // Both credentials exist but neither authenticates: defer rather than risk discarding a live one. A
        // delegated target (no stored current password) instead falls through, since its rotator re-sets below.
        throw new BadRequestError({ message: "Could not verify account credentials; rotation deferred" });
      }
      await pamAccountDAL.updateById(account.id, { encryptedPendingCredentials: null });
    }

    const {
      auth,
      connectionDetails: rotatorConnectionDetails,
      gatewayId: rotatorGatewayId,
      gatewayPoolId: rotatorGatewayPoolId
    } = await resolveRotator(account, targetCredentials, connectionDetails, { gatewayId, gatewayPoolId });
    const requirements = getPasswordRequirements(account.templateSettings);
    const newPassword = generatePassword(requirements);
    const encryptedPending = await encrypt(projectId, { ...targetCredentials, password: newPassword });

    // Stage before applying, so an apply interrupted mid-change leaves a credential the recovery probe can promote.
    await pamAccountDAL.updateById(account.id, { encryptedPendingCredentials: encryptedPending });

    try {
      await handler.applyPasswordChange(
        {
          accountType,
          connectionDetails: rotatorConnectionDetails,
          auth,
          targetUsername,
          newPassword,
          gatewayId: rotatorGatewayId,
          gatewayPoolId: rotatorGatewayPoolId
        },
        gatewayDeps
      );
    } catch (err) {
      await pamAccountDAL.updateById(account.id, { encryptedPendingCredentials: null });
      throw err;
    }

    const verified = await handler.testCredential(
      {
        accountType,
        connectionDetails,
        auth: { username: targetUsername, password: newPassword },
        gatewayId,
        gatewayPoolId
      },
      gatewayDeps
    );
    if (!verified) {
      // Applied but unconfirmed: keep the candidate staged (don't discard) so the next probe can promote it.
      throw new BadRequestError({ message: "Password was changed on the target but could not be verified" });
    }

    await markRotated(account, encryptedPending, now);

    // postRotate: propagate the new password to the account's dependent services. Best-effort and fully
    // guarded so a dependency-sync failure never undoes the already-committed account rotation.
    try {
      await syncDependenciesAfterRotation({
        accountId: account.id,
        projectId,
        accountType,
        targetUsername,
        newPassword,
        // For self-rotation the account's old password is now dead, so connect with the new one; a delegated
        // rotator authenticates with its own (unchanged) password.
        connectAuth:
          account.rotationAccountId === account.id ? { username: auth.username, password: newPassword } : auth,
        gatewayId,
        gatewayPoolId
      });
    } catch (err) {
      logger.warn(err, `PAM dependency sync errored after rotation [accountId=${account.id}]`);
    }
  };

  // Advance nextRotationAt to a capped retry, but only when the account is schedulable: a ready account's early
  // failure still can't be re-selected on every cron tick, and a not-ready account is never given a due-date it
  // cannot act on.
  const recordRotationFailure = async (account: TPamAccountDetail, err: unknown) => {
    const projectId = account.projectId as string;
    const rotation = getRotationConfig(account.templateSettings);
    const now = new Date();
    const { ready } = getRotationReadiness({
      accountId: account.id,
      accountType: account.accountType,
      rotationAccountId: account.rotationAccountId,
      credentialConfigured: account.credentialConfigured
    });
    const nextRotationAt =
      ready && rotation?.enabled && rotation.intervalSeconds != null
        ? computeNextRotationAt({
            anchor: now,
            intervalSeconds: Math.min(rotation.intervalSeconds, ROTATION_FAILURE_RETRY_CAP_SECONDS),
            now
          })
        : null;
    await pamAccountDAL.updateById(account.id, {
      rotationStatus: ROTATION_STATUS.Failed,
      encryptedLastRotationMessage: await encrypt(projectId, { message: (err as Error).message }),
      nextRotationAt
    });
  };

  const performRotation = async (account: TPamAccountDetail) => {
    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;
    try {
      // TTL must exceed the worst-case rotation (recovery probe + apply + verify) so it can't expire mid-rotation.
      lock = await keyStore.acquireLock([KeyStorePrefixes.PamAccountRotationLock(account.id)], 5 * 60 * 1000);
    } catch {
      // Held lock: another run owns the schedule bookkeeping, so don't record a failure here.
      throw new BadRequestError({ message: ROTATION_IN_PROGRESS_MESSAGE });
    }
    try {
      await rotateWithinLock(account);
    } catch (err) {
      await recordRotationFailure(account, err);
      throw err;
    } finally {
      await lock.release();
    }
  };

  const loadAccount = async (accountId: string, projectId: string): Promise<TPamAccountDetail> => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }
    return account;
  };

  const getRotation = async ({
    accountId,
    projectId,
    ...ctx
  }: TGetPamAccountRotationDTO & TActorContext): Promise<TPamAccountRotationView> => {
    const account = await loadAccount(accountId, projectId);
    await checkAccount(accountId, account.folderId, projectId, ResourcePermissionPamResourceActions.ReadAccounts, ctx);

    const settings = PamTemplateSettingsSchema.safeParse(account.templateSettings).data;
    const readiness = getRotationReadiness({
      accountId: account.id,
      accountType: account.accountType,
      rotationAccountId: account.rotationAccountId,
      credentialConfigured: account.credentialConfigured
    });

    let rotationAccountName: string | null = null;
    let rotationAccountId: string | null = account.rotationAccountId ?? null;
    if (account.rotationAccountId === account.id) {
      // Self-rotation: the rotation account is this account, which the caller already reads.
      rotationAccountName = account.name;
    } else if (account.rotationAccountId) {
      const rotator = await pamAccountDAL.findById(account.rotationAccountId);
      const canReadRotator =
        !!rotator &&
        (await checkAccount(
          rotator.id,
          rotator.folderId,
          projectId,
          ResourcePermissionPamResourceActions.ReadAccounts,
          ctx
        )
          .then(() => true)
          .catch(() => false));
      if (rotator && canReadRotator) {
        rotationAccountName = rotator.name;
      } else {
        rotationAccountId = null;
      }
    }

    let lastRotationError: string | null = null;
    if (account.rotationStatus === ROTATION_STATUS.Failed && account.encryptedLastRotationMessage) {
      const decrypted = await decrypt(projectId, account.encryptedLastRotationMessage);
      lastRotationError = (decrypted as { message?: string }).message ?? null;
    }

    return {
      enabled: settings?.rotation?.enabled ?? false,
      intervalSeconds: settings?.rotation?.intervalSeconds ?? null,
      passwordRequirements: settings?.passwordRequirements ?? null,
      rotationAccountId,
      rotationAccountName,
      lastRotatedAt: account.lastRotatedAt ?? null,
      rotationStatus: account.rotationStatus ?? null,
      lastRotationError,
      isReady: readiness.ready
    };
  };

  const setRotationAccount = async ({
    accountId,
    rotationAccountId,
    projectId,
    ...ctx
  }: TSetPamRotationAccountDTO & TActorContext) => {
    const account = await loadAccount(accountId, projectId);
    await checkAccount(
      accountId,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.ManageRotation,
      ctx
    );

    if (!isRotatableAccountType(account.accountType)) {
      throw new BadRequestError({ message: "Credential rotation is not supported for this account type" });
    }

    if (rotationAccountId) {
      const targetCredentials = await decryptSqlCredentials(
        projectId,
        account.accountType,
        account.encryptedCredentials
      );
      rotationHandlers[account.accountType].validateTarget({
        accountType: account.accountType,
        authMethod: targetCredentials.authMethod
      });

      if (rotationAccountId !== accountId) {
        const rotator = await pamAccountDAL.findByIdWithDetails(rotationAccountId);
        if (!rotator || rotator.projectId !== projectId) {
          throw new BadRequestError({ message: "Rotation account not found in this project" });
        }
        if (rotator.accountType !== account.accountType) {
          throw new BadRequestError({ message: "Rotation account must be the same type as this account" });
        }
        // A delegated rotator authenticates with its own stored password, so it must have one, else every rotation
        // fails in resolveAuthCredential and the account is scheduled into a permanent failure state.
        if (!rotator.credentialConfigured) {
          throw new BadRequestError({ message: "Rotation account has no stored credential to perform rotations" });
        }
        const targetConn = resolveConnectionDetails(
          account.accountType,
          await decrypt(projectId, account.encryptedConnectionDetails)
        );
        const rotatorConn = resolveConnectionDetails(
          account.accountType,
          await decrypt(projectId, rotator.encryptedConnectionDetails)
        );
        assertRotatorSameResource(account.accountType as PamAccountType, rotatorConn, targetConn);
        // Binding a rotator causes its credential to be used to authenticate rotations, so require credential access
        // to it (not just metadata read): otherwise a caller could leverage a privileged account they can only see.
        await checkAccount(
          rotationAccountId,
          rotator.folderId,
          projectId,
          ResourcePermissionPamResourceActions.ViewCredentials,
          ctx
        );
      }
    }

    // Set the rotation account and re-derive the schedule atomically, so a crash can't leave the account bound
    // but unscheduled (or cleared but still scheduled).
    await pamAccountDAL.transaction(async (tx) => {
      await pamAccountDAL.updateById(accountId, { rotationAccountId }, tx);
      await pamAccountDAL.reconcileRotationScheduleForAccount(accountId, tx);
    });
    return { rotationAccountId };
  };

  // performRotation already records the failure; report the outcome (never throw) so the caller can audit it.
  const runRotation = async (account: TPamAccountDetail): Promise<{ rotationStatus: string; message?: string }> => {
    try {
      await performRotation(account);
      return { rotationStatus: ROTATION_STATUS.Success };
    } catch (err) {
      const message = err instanceof BadRequestError ? err.message : `Rotation failed: ${(err as Error).message}`;
      return { rotationStatus: ROTATION_STATUS.Failed, message };
    }
  };

  const rotateNow = async ({
    accountId,
    projectId,
    ...ctx
  }: TRotatePamAccountDTO & TActorContext): Promise<{
    accountType: string;
    rotationAccountId: string | null;
    rotationStatus: string;
    message?: string;
  }> => {
    const account = await loadAccount(accountId, projectId);
    await checkAccount(
      accountId,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.ManageRotation,
      ctx
    );
    const readiness = getRotationReadiness({
      accountId: account.id,
      accountType: account.accountType,
      rotationAccountId: account.rotationAccountId,
      credentialConfigured: account.credentialConfigured
    });
    if (!readiness.ready && readiness.issue) {
      throw new BadRequestError({ message: ROTATION_NOT_READY_MESSAGE[readiness.issue] });
    }
    return {
      accountType: account.accountType,
      rotationAccountId: account.rotationAccountId ?? null,
      ...(await runRotation(account))
    };
  };

  const listRotationCandidates = async ({
    accountId,
    projectId,
    ...ctx
  }: TListPamRotationCandidatesDTO & TActorContext) => {
    const account = await loadAccount(accountId, projectId);
    await checkAccount(accountId, account.folderId, projectId, ResourcePermissionPamResourceActions.ReadAccounts, ctx);

    const { folderIds, accountIds } = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      { allOf: [ResourcePermissionPamResourceActions.ViewCredentials] },
      ctx
    );

    const candidates = await pamAccountDAL.findRotationCandidates(
      projectId,
      folderIds,
      accountIds,
      account.accountType
    );

    const { decryptor } = await getProjectCipher(projectId);
    const accountType = account.accountType as PamAccountType;
    const detailsOf = (blob: Buffer) =>
      resolveConnectionDetails(
        accountType,
        JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf-8")) as Record<string, unknown>
      );
    const target = detailsOf(account.encryptedConnectionDetails);
    const withHost = candidates
      .map((candidate) => ({ ...candidate, details: detailsOf(candidate.encryptedConnectionDetails) }))
      .filter((candidate) => isSameResource(accountType, candidate.details, target));

    // The resource label shown per candidate: the DC for a domain account, otherwise the host.
    const displayHost = (details: Record<string, unknown>) =>
      String((accountType === PamAccountType.WindowsAd ? details.dcAddress : details.host) ?? "");

    const groupsByFolder = new Map<
      string,
      { folderId: string | null; folderName: string | null; accounts: { id: string; name: string; host: string }[] }
    >();
    for (const candidate of withHost) {
      const key = candidate.folderId ?? "__none__";
      if (!groupsByFolder.has(key)) {
        groupsByFolder.set(key, { folderId: candidate.folderId, folderName: candidate.folderName, accounts: [] });
      }
      groupsByFolder
        .get(key)!
        .accounts.push({ id: candidate.id, name: candidate.name, host: displayHost(candidate.details) });
    }

    return { candidates: Array.from(groupsByFolder.values()) };
  };

  // Re-reads state (rotation may have been disabled since enqueue); returns null when skipped.
  const rotateScheduledAccount = async (
    accountId: string
  ): Promise<{
    accountType: string;
    projectId: string;
    rotationAccountId: string | null;
    rotationStatus: string;
    message?: string;
  } | null> => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account) return null;
    const rotation = getRotationConfig(account.templateSettings);
    if (!rotation?.enabled) return null;
    const result = await runRotation(account);
    // A concurrent run (manual, or a still-running prior tick) holds the lock; it will finish and reschedule, so
    // skip rather than audit a spurious failure.
    if (result.rotationStatus === ROTATION_STATUS.Failed && result.message === ROTATION_IN_PROGRESS_MESSAGE) {
      return null;
    }
    return {
      accountType: account.accountType,
      projectId: account.projectId as string,
      rotationAccountId: account.rotationAccountId ?? null,
      ...result
    };
  };

  return { getRotation, setRotationAccount, rotateNow, listRotationCandidates, rotateScheduledAccount };
};
