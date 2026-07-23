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

import { PamAccountType, PamProductRole } from "../pam/pam-enums";
import {
  checkAccountAccess,
  getResourceIdsWithActions,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import { TPamAccountDALFactory, TPamAccountDetail } from "../pam-account/pam-account-dal";
import { validateConnectionDetails, validateCredentials } from "../pam-account/pam-account-schemas";
import { PamTemplateSettingsSchema } from "../pam-account-template/pam-account-template-schemas";
import { TPamAccountDependencyDALFactory } from "../pam-discovery/pam-account-dependency-dal";
import { resolveHostsViaDcDns, winrmRpcWithGateway } from "../pam-discovery/pam-discovery-fns";
import { TPamDiscoverySourceDALFactory } from "../pam-discovery/pam-discovery-source-dal";
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
  isSqlRotatableType,
  isWindowsRotatableType,
  PamRotationReadinessIssue,
  redactRotationError,
  ROTATION_FAILURE_RETRY_CAP_SECONDS,
  toBareAccountName,
  withGatewayRetry
} from "./pam-rotation-fns";
import {
  PAM_ROTATION_FACTORY_MAP,
  winrmConnectUsername,
  winrmPortFromConn,
  winrmTransportFromConn
} from "./pam-rotation-handlers";

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
    | "findByIdsWithDetails"
    | "find"
    | "updateById"
    | "findRotationCandidates"
    | "reconcileRotationScheduleForAccount"
    | "transaction"
  >;
  pamDiscoverySourceDAL: Pick<TPamDiscoverySourceDALFactory, "find">;
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
    pamDiscoverySourceDAL,
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

  const DEPENDENCY_SYNC_CONCURRENCY = 5;

  // The account-rotation phase (recovery probe + apply + verify) is bounded by a handful of WinRM/LDAP calls,
  // each capped at the RPC deadline; this TTL covers the worst-case pile-up so the lock can't expire mid-run.
  const ROTATION_LOCK_TTL_MS = 15 * 60 * 1000;

  // Everything needed to run dependency sync after the account rotation commits (and after the lock releases).
  type TPostRotate = {
    accountId: string;
    projectId: string;
    accountType: PamAccountType;
    connectionDetails: Record<string, unknown>;
    targetUsername: string;
    newPassword: string;
    connectAuth: { username: string; password: string };
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
  };

  // postRotate: push the new password into every dependency, connecting as the rotator. Best-effort: a
  // per-dependency failure is recorded on the row and never fails the account rotation.
  const syncDependenciesAfterRotation = async ({
    accountId,
    projectId,
    accountType,
    connectionDetails,
    targetUsername,
    newPassword,
    connectAuth,
    gatewayId,
    gatewayPoolId
  }: TPostRotate) => {
    if (!isWindowsRotatableType(accountType)) return;

    const dependencies = await pamAccountDependencyDAL.findByAccountId(accountId);
    if (!dependencies.length) return;

    const resolvedGatewayId = gatewayPoolId
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId, gatewayPoolId })
      : gatewayId;
    if (!resolvedGatewayId) {
      logger.warn(`PAM dependency sync skipped, no gateway available [accountId=${accountId}]`);
      return;
    }

    // Machines share the account's WinRM settings (HTTPS / port / CA), populated from the source on import.
    const winrmPort = winrmPortFromConn(connectionDetails);
    const winrmTransport = winrmTransportFromConn(connectionDetails);
    // A domain rotator must connect as a UPN over WinRM (NTLM 401s on a bare name); local stays bare.
    const connectUsername = winrmConnectUsername(accountType, connectionDetails, connectAuth.username);

    // Re-resolve each machine via the DC's DNS at sync time so a scan-time IP that went stale (DHCP) can't
    // target the wrong host. Domain accounts only (a local account has no DC); fall back to the scan-time IP.
    const { dcAddress } = connectionDetails as { dcAddress?: string };
    const freshIpByMachine =
      accountType === PamAccountType.WindowsAd && dcAddress
        ? await resolveHostsViaDcDns(
            [...new Set(dependencies.map((d) => d.machine))],
            dcAddress,
            resolvedGatewayId,
            gatewayV2Service
          ).catch(() => new Map<string, string>())
        : new Map<string, string>();

    const { encryptor } = await getProjectCipher(projectId);
    const limit = pLimit(DEPENDENCY_SYNC_CONCURRENCY);

    await Promise.all(
      dependencies.map((dep) =>
        // Only terminal states are written: a crash mid-sync leaves the prior status (self-corrects on the next
        // rotation) rather than a "pending" that could stick forever.
        limit(async () => {
          try {
            const depData = dep.data as { runAsAccount?: string; resolvedIp?: string };
            const runAsAccount = depData?.runAsAccount ?? targetUsername;
            const targetHost = freshIpByMachine.get(dep.machine) || depData?.resolvedIp || dep.machine;
            // Retry a transient tunnel/WinRM blip so it doesn't strand the dependency on the old password.
            await withGatewayRetry(async () => {
              await winrmRpcWithGateway<{ ok: boolean }>({
                targetHost,
                targetPort: winrmPort,
                gatewayId: resolvedGatewayId,
                gatewayV2Service,
                endpoint: WinRmRpcEndpoint.SyncDependency,
                credentials: { username: connectUsername, password: connectAuth.password, ...winrmTransport },
                params: { type: dep.type, name: dep.name, runAsUsername: runAsAccount, newPassword }
              });
              return true;
            }, "dependency sync");
            await pamAccountDependencyDAL.updateById(dep.id, {
              rotationStatus: ROTATION_STATUS.Success,
              lastRotatedAt: new Date(),
              encryptedLastRotationMessage: null
            });
          } catch (err) {
            const message = redactRotationError(err, [newPassword, connectAuth.password]);
            logger.warn(err, `PAM dependency sync failed [accountId=${accountId}] [dependencyId=${dep.id}]`);
            await pamAccountDependencyDAL.updateById(dep.id, {
              rotationStatus: ROTATION_STATUS.Failed,
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

  // Stable key for the identity an account authenticates as, to detect two PAM objects on the same credential:
  // domain accounts on domain, local Windows on host, SQL on host+port, all on the bare name. Null if not rotatable.
  const identityKey = (accountType: PamAccountType, conn: Record<string, unknown>, username: string): string | null => {
    const user = toBareAccountName(username).toLowerCase();
    if (accountType === PamAccountType.WindowsAd) {
      const domain = (conn.domain as string | undefined)?.toLowerCase();
      return domain ? `ad|${domain}|${user}` : null;
    }
    if (isWindowsRotatableType(accountType)) {
      const host = (conn.host as string | undefined)?.toLowerCase();
      return host ? `win|${host}|${user}` : null;
    }
    if (isSqlRotatableType(accountType)) {
      const host = (conn.host as string | undefined)?.toLowerCase();
      return host ? `sql|${host}|${String(conn.port)}|${user}` : null;
    }
    return null;
  };

  // Other managed accounts on this same identity (same AD object, or a discovery-source credential), so the UI
  // can warn that rotating changes their shared password too. Each is annotated with the sources that use it.
  const getSharedIdentityReferences = async (
    account: TPamAccountDetail,
    projectId: string,
    ctx: TActorContext
  ): Promise<{ id: string; name: string; discoverySources: string[] }[]> => {
    if (!isRotatableAccountType(account.accountType)) return [];

    const creds = await decryptSqlCredentials(projectId, account.accountType, account.encryptedCredentials);
    const conn = resolveConnectionDetails(
      account.accountType,
      await decrypt(projectId, account.encryptedConnectionDetails)
    );
    const key = identityKey(account.accountType, conn, creds.username);
    if (!key) return [];

    // Same AD object = identical discovery fingerprint (cheap, indexed); excludes this account itself.
    const siblings = account.discoveryFingerprint
      ? (await pamAccountDAL.find({ projectId, discoveryFingerprint: account.discoveryFingerprint }))
          .filter((sibling) => sibling.id !== account.id)
          .map((sibling) => ({ id: sibling.id, name: sibling.name, folderId: sibling.folderId }))
      : [];

    // A source whose credential is the account itself is fine (it updates in place); only a *different*
    // same-identity account breaks. Only a same-type credential can share this identity (identityKey is
    // type-prefixed), so filter by type in the query and decrypt each distinct credential account at most once.
    const sources = await pamDiscoverySourceDAL.find({ projectId });
    const externalSources = sources.filter((source) => source.credentialAccountId !== account.id);
    const credentialAccountIds = [...new Set(externalSources.map((source) => source.credentialAccountId))];
    const credentialAccounts = await pamAccountDAL.findByIdsWithDetails(credentialAccountIds, account.accountType);

    const matches = (
      await Promise.all(
        credentialAccounts.map(async (cred) => {
          if (!isRotatableAccountType(cred.accountType)) return null;
          try {
            const credCreds = await decryptSqlCredentials(projectId, cred.accountType, cred.encryptedCredentials);
            const credConn = resolveConnectionDetails(
              cred.accountType,
              await decrypt(projectId, cred.encryptedConnectionDetails)
            );
            if (identityKey(cred.accountType, credConn, credCreds.username) !== key) return null;
            return { id: cred.id, name: cred.name, folderId: cred.folderId ?? null };
          } catch {
            // a credential we can't decrypt/parse can't be compared, so it drops out
            return null;
          }
        })
      )
    ).filter((c): c is { id: string; name: string; folderId: string | null } => c !== null);
    const matchingById = new Map(matches.map((c) => [c.id, c]));

    const sourceMatches = externalSources.flatMap((source) => {
      const match = matchingById.get(source.credentialAccountId);
      return match
        ? [{ accountId: match.id, accountName: match.name, folderId: match.folderId, sourceName: source.name }]
        : [];
    });

    // Merge into one list keyed by account, collecting the discovery sources each is a credential for.
    const byAccount = new Map<
      string,
      { id: string; name: string; folderId?: string | null; discoverySources: string[] }
    >();
    siblings.forEach((s) =>
      byAccount.set(s.id, { id: s.id, name: s.name, folderId: s.folderId, discoverySources: [] })
    );
    sourceMatches.forEach((m) => {
      const existing = byAccount.get(m.accountId);
      if (existing) existing.discoverySources.push(m.sourceName);
      else
        byAccount.set(m.accountId, {
          id: m.accountId,
          name: m.accountName,
          folderId: m.folderId,
          discoverySources: [m.sourceName]
        });
    });

    // Only surface what the caller may already see: accounts they can read, and source names only for a PAM
    // Admin, so the warning can't leak resources behind folder or product authorization they don't hold.
    const { hasRole } = await verifyProductMembership(permissionService, projectId, ctx);
    const canViewSources = hasRole(PamProductRole.Admin);
    const visible = await Promise.all(
      [...byAccount.values()].map(async (ref) => {
        const canRead = await checkAccount(
          ref.id,
          ref.folderId,
          projectId,
          ResourcePermissionPamResourceActions.ReadAccounts,
          ctx
        )
          .then(() => true)
          .catch(() => false);
        if (!canRead) return null;
        return { id: ref.id, name: ref.name, discoverySources: canViewSources ? ref.discoverySources : [] };
      })
    );
    return visible.filter((v): v is { id: string; name: string; discoverySources: string[] } => v !== null);
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

  // Runs the account rotation under the per-account lock and returns the postRotate work (or null when nothing
  // to sync); dependency sync itself runs outside the lock (see performRotation).
  const rotateWithinLock = async (account: TPamAccountDetail): Promise<TPostRotate | null> => {
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

    // Resolve the rotator (self or delegated) up front: its identity is needed to apply the change and, for a
    // delegated local account, to verify the credential on the box (the account itself can't be logged in as).
    const isDelegated = account.rotationAccountId !== account.id;
    const {
      auth,
      connectionDetails: rotatorConnectionDetails,
      gatewayId: rotatorGatewayId,
      gatewayPoolId: rotatorGatewayPoolId
    } = await resolveRotator(account, targetCredentials, connectionDetails, { gatewayId, gatewayPoolId });
    if (isDelegated) assertRotatorSameResource(accountType, rotatorConnectionDetails, connectionDetails);
    // A delegated local account can't be logged in as to verify, so validate via the admin rotator instead.
    const verifyVia = isDelegated && accountType === PamAccountType.Windows ? auth : undefined;

    // Recovery from an interrupted rotation. A live pending credential means a prior rotation actually succeeded
    // before it could be recorded, so promote it (both self and delegated). Past that, the two paths diverge.
    if (account.encryptedPendingCredentials) {
      const pending = await decryptSqlCredentials(projectId, accountType, account.encryptedPendingCredentials);
      // Verify uses the rotator's gateway, not the target's: a delegated target often has no gateway of its own
      // (self-rotation makes them the same).
      const gatewayTarget = {
        accountType,
        connectionDetails,
        gatewayId: rotatorGatewayId,
        gatewayPoolId: rotatorGatewayPoolId,
        verifyVia
      };

      // Probe a candidate credential against the target. Returns true/false definitively, or throws when the
      // check can't complete (transient transport error, already retried inside the handler).
      const probe = (password: string) =>
        handler.testCredential({ ...gatewayTarget, auth: { username: targetUsername, password } }, gatewayDeps);

      let pendingWorks = false;
      let pendingThrew = false;
      try {
        pendingWorks = await probe(pending.password ?? "");
      } catch {
        pendingThrew = true;
      }
      if (pendingWorks) {
        await markRotated(account, account.encryptedPendingCredentials, now);
        return null;
      }

      if (isDelegated) {
        // The rotator resets the target unconditionally, so a stale pending (or a stored credential that no longer
        // matches the target) never blocks rotation: discard the dead pending and re-rotate below, which heals the
        // drift. The self-rotation deferral does not apply, because the rotator, not the target credential, is the
        // way in. A genuinely unreachable target surfaces as an error when the rotator's own apply fails.
        await pamAccountDAL.updateById(account.id, { encryptedPendingCredentials: null });
      } else {
        // Self-rotation can only change the password by authenticating as the account itself, so if neither the
        // pending nor the current credential works it cannot proceed. A successful current-credential probe also
        // proves the target is reachable, telling a dead pending from a transport blip.
        const currentPassword = targetCredentials.password;
        let currentWorks = false;
        if (currentPassword) {
          try {
            currentWorks = await probe(currentPassword);
          } catch {
            throw new BadRequestError({
              message: "Could not reach the target to verify its credentials; rotation deferred and will retry"
            });
          }
        }
        if (pendingThrew && !currentWorks) {
          // Pending was inconclusive (transport) and the current credential didn't prove reachability: can't tell a
          // dead pending from an unreachable target, so defer rather than risk discarding a live pending.
          throw new BadRequestError({
            message: "Could not reach the target to verify its credentials; rotation deferred and will retry"
          });
        }
        if (!currentWorks && currentPassword) {
          // Both credentials are definitively rejected. A self-rotating account has no other way to authenticate,
          // so it cannot rotate until its stored password is corrected.
          throw new BadRequestError({
            message:
              "This account's stored password no longer works on the target, and it rotates its own password, so it cannot authenticate to rotate. Update the stored password to the account's current one, or assign a delegated rotation account, then try again."
          });
        }
        await pamAccountDAL.updateById(account.id, { encryptedPendingCredentials: null });
      }
    }

    const requirements = getPasswordRequirements(account.templateSettings);
    const newPassword = generatePassword(requirements);
    const encryptedPending = await encrypt(projectId, { ...targetCredentials, password: newPassword });

    // Stage before applying, so an apply interrupted mid-change leaves a credential the recovery probe can promote.
    await pamAccountDAL.updateById(account.id, { encryptedPendingCredentials: encryptedPending });

    // Do NOT discard pending on an apply error: an apply can succeed on the host after the client deadline, and
    // for self-rotation pending is the only copy of the now-live password. The recovery probe resolves it next run.
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

    let verified: boolean;
    try {
      verified = await handler.testCredential(
        {
          accountType,
          connectionDetails,
          auth: { username: targetUsername, password: newPassword },
          verifyVia,
          // Reach the target through the rotator's gateway (the one that just applied the change), not the
          // target's; a delegated target often has no gateway of its own.
          gatewayId: rotatorGatewayId,
          gatewayPoolId: rotatorGatewayPoolId
        },
        gatewayDeps
      );
    } catch (err) {
      logger.warn(
        err,
        `PAM rotation verify could not complete [accountId=${account.id}] [error=${
          err instanceof Error ? err.message : String(err)
        }]`
      );
      // Applied, but verification couldn't complete (transient gateway error). The new password stays pending so
      // the recovery probe promotes it next run; a tunnel blip must not leave a live-but-unrecorded password.
      throw new BadRequestError({
        message:
          "Password was changed on the target but verification could not complete due to a transient network error; it will be reconciled on the next rotation attempt"
      });
    }
    if (!verified) {
      // Applied but the credential was definitively rejected: keep the candidate staged (don't discard) so the
      // next probe can promote it if this was a false negative.
      throw new BadRequestError({ message: "Password was changed on the target but could not be verified" });
    }

    await markRotated(account, encryptedPending, now);

    return {
      accountId: account.id,
      projectId,
      accountType,
      connectionDetails,
      targetUsername,
      newPassword,
      // For self-rotation the account's old password is now dead, so connect with the new one; a delegated
      // rotator authenticates with its own (unchanged) password.
      connectAuth: isDelegated ? auth : { username: auth.username, password: newPassword },
      // Dependency sync reaches each machine through the rotator's gateway (same as apply/verify); a delegated
      // target account often has none of its own.
      gatewayId: rotatorGatewayId,
      gatewayPoolId: rotatorGatewayPoolId
    };
  };

  // Windows throws a bare InvalidPasswordException with no reason on a policy violation. Append the one thing we
  // know (the configured format length) plus what to try, so the opaque error becomes actionable.
  const augmentWindowsPolicyError = (account: TPamAccountDetail, message: string): string => {
    if (!isWindowsRotatableType(account.accountType) || !message.includes("InvalidPasswordException")) {
      return message;
    }
    const length = getPasswordRequirements(account.templateSettings)?.length;
    const lengthHint = length
      ? ` This account's rotation format is ${length} character${length === 1 ? "" : "s"}; try increasing it.`
      : "";
    return `${message}\nNote: the host rejected the new password against its local password policy (minimum length, complexity, or history).${lengthHint}`;
  };

  // Advance nextRotationAt to a capped retry, but only when the account is schedulable: keeps a ready account's
  // failure off every cron tick without handing a not-ready account a due-date it can't act on.
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
      encryptedLastRotationMessage: await encrypt(projectId, {
        message: augmentWindowsPolicyError(account, (err as Error).message)
      }),
      nextRotationAt
    });
  };

  const performRotation = async (account: TPamAccountDetail) => {
    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;
    try {
      lock = await keyStore.acquireLock([KeyStorePrefixes.PamAccountRotationLock(account.id)], ROTATION_LOCK_TTL_MS);
    } catch {
      // Held lock: another run owns the schedule bookkeeping, so don't record a failure here.
      throw new BadRequestError({ message: ROTATION_IN_PROGRESS_MESSAGE });
    }
    let postRotate: TPostRotate | null = null;
    try {
      postRotate = await rotateWithinLock(account);
    } catch (err) {
      await recordRotationFailure(account, err);
      throw err;
    } finally {
      // A long rotation can outlive the TTL; releasing an expired lock throws, so tolerate it rather than
      // report a rotation that actually succeeded as failed.
      try {
        await lock.release();
      } catch (err) {
        logger.warn(err, `PAM rotation lock release failed [accountId=${account.id}]`);
      }
    }

    // Dependency sync runs OUTSIDE the lock: it can fan out to many machines (unbounded) and must not hold the
    // per-account lock long enough to expire. Best-effort; the account rotation is already committed.
    if (postRotate) {
      try {
        await syncDependenciesAfterRotation(postRotate);
      } catch (err) {
        logger.warn(err, `PAM dependency sync errored after rotation [accountId=${account.id}]`);
      }
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

    const sharedIdentity = await getSharedIdentityReferences(account, projectId, ctx);

    return {
      enabled: settings?.rotation?.enabled ?? false,
      intervalSeconds: settings?.rotation?.intervalSeconds ?? null,
      passwordRequirements: settings?.passwordRequirements ?? null,
      rotationAccountId,
      rotationAccountName,
      lastRotatedAt: account.lastRotatedAt ?? null,
      rotationStatus: account.rotationStatus ?? null,
      lastRotationError,
      isReady: readiness.ready,
      sharedIdentity
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
        // A delegated rotator resolving to the SAME identity as the target is a footgun: rotating would invalidate
        // the rotator's own stored credential. Require a different identity; self-rotation is a separate path.
        const rotatorCredentials = await decryptSqlCredentials(
          projectId,
          account.accountType,
          rotator.encryptedCredentials
        );
        if (
          toBareAccountName(rotatorCredentials.username).toLowerCase() ===
          toBareAccountName(targetCredentials.username).toLowerCase()
        ) {
          throw new BadRequestError({
            message:
              "Rotation account is the same identity as this account, so rotating it would invalidate its own credential. Set this account to rotate itself, or choose a different privileged account."
          });
        }
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
