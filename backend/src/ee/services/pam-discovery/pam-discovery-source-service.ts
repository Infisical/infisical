import pLimit from "p-limit";

import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ResourcePermissionPamResourceActions } from "@app/ee/services/permission/resource-permission";
import { createSshCert, createSshKeyPair } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { SshCertType } from "@app/ee/services/ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { PamAccountType, PamProductRole, PamSshAuthMethod } from "../pam/pam-enums";
import { checkAccountAccess, TActorContext, verifyProductMembership } from "../pam/pam-permission";
import { validateGatewayAttachment } from "../pam/pam-validators";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamAccountServiceFactory } from "../pam-account/pam-account-service";
import { TPamAccountDependencyDALFactory } from "./pam-account-dependency-dal";
import { TPamDiscoveredAccountDALFactory } from "./pam-discovered-account-dal";
import {
  PamDiscoveryImportStatus,
  PamDiscoveryRunStatus,
  PamDiscoveryRunTrigger,
  PamDiscoverySchedule,
  PamDiscoveryType
} from "./pam-discovery-enums";
import { PAM_DISCOVERY_FACTORY_MAP } from "./pam-discovery-factory";
import {
  getCredentialAccountType,
  getDiscoveryTypeConfig,
  validateDiscoveryConfiguration
} from "./pam-discovery-schemas";
import { TPamDiscoverySourceDALFactory } from "./pam-discovery-source-dal";
import { TPamDiscoverySourceRunDALFactory } from "./pam-discovery-source-run-dal";
import {
  TCreateDiscoverySourceDTO,
  TDeleteDiscoverySourceDTO,
  TGetDiscoverySourceDTO,
  TImportDiscoveredDTO,
  TListAccountDependenciesDTO,
  TListDiscoveredDTO,
  TListDiscoverySourcesDTO,
  TListRunsDTO,
  TTriggerScanDTO,
  TUpdateDiscoverySourceDTO
} from "./pam-discovery-types";

type TPamDiscoverySourceServiceFactoryDep = {
  pamDiscoverySourceDAL: TPamDiscoverySourceDALFactory;
  pamDiscoverySourceRunDAL: TPamDiscoverySourceRunDALFactory;
  pamDiscoveredAccountDAL: TPamDiscoveredAccountDALFactory;
  pamAccountDependencyDAL: TPamAccountDependencyDALFactory;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findById" | "findByIdWithDetails">;
  pamAccountService: Pick<TPamAccountServiceFactory, "create">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getResourcePermission" | "getOrgPermission"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<
    TGatewayPoolServiceFactory,
    "resolveEffectiveGatewayId" | "resolveAttachableGatewayFromPool"
  >;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  cronJob: TCronJobFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

// hard ceiling on how long a single scan may run
const MAX_SCAN_DURATION_MS = 45 * 60 * 1000;

// bound concurrent discovered-account upserts so a large result set can't exhaust the DB connection pool
const DISCOVERED_UPSERT_CONCURRENCY = 8;

const withScanTimeout = async <T>(scan: Promise<T>, controller: AbortController, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new BadRequestError({
          message: `Scan exceeded the maximum duration of ${Math.round(timeoutMs / 60000)} minutes`
        })
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([scan, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    // wait for the aborted scan to actually stop before finalizing the run
    await scan.catch(() => {});
  }
};

export type TPamDiscoverySourceServiceFactory = ReturnType<typeof pamDiscoverySourceServiceFactory>;

export const pamDiscoverySourceServiceFactory = (deps: TPamDiscoverySourceServiceFactoryDep) => {
  const {
    pamDiscoverySourceDAL,
    pamDiscoverySourceRunDAL,
    pamDiscoveredAccountDAL,
    pamAccountDependencyDAL,
    pamAccountDAL,
    pamAccountService,
    permissionService,
    kmsService,
    gatewayV2Service,
    gatewayPoolService,
    queueService,
    cronJob,
    auditLogService
  } = deps;

  const enqueueScan = (sourceId: string, triggeredBy: PamDiscoveryRunTrigger) =>
    queueService.queue(
      QueueName.PamDiscoveryScan,
      QueueJobs.PamDiscoverySourceScan,
      { sourceId, triggeredBy },
      { jobId: `pam-discovery-scan-${sourceId}`, removeOnComplete: true, removeOnFail: true }
    );

  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  const decryptToObject = (blob: Buffer, decryptor: (i: { cipherTextBlob: Buffer }) => Buffer) =>
    JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf-8")) as Record<string, unknown>;

  // one cert is minted per scan and reused for every host, so it must outlive the whole run
  const SSH_CERT_TTL = "1h";

  // certificate accounts can't be presented by an ssh client, so sign an ephemeral user cert the gateway will present;
  // password/private-key accounts pass through unchanged
  const buildGatewaySshCredentials = async (
    account: {
      accountType: string;
      encryptedCredentials: Buffer;
      encryptedInternalMetadata?: Buffer | null;
      id: string;
    },
    decryptor: (i: { cipherTextBlob: Buffer }) => Buffer
  ): Promise<Record<string, unknown>> => {
    const credentials = decryptToObject(account.encryptedCredentials, decryptor) as {
      authMethod: string;
      username: string;
      privateKey?: string;
      certificate?: string;
    };

    if (
      account.accountType === PamAccountType.SSH &&
      credentials.authMethod === PamSshAuthMethod.Certificate &&
      account.encryptedInternalMetadata
    ) {
      const metadata = decryptToObject(account.encryptedInternalMetadata, decryptor) as {
        caPrivateKey?: string;
        caKeyAlgorithm?: string;
      };
      if (metadata.caPrivateKey) {
        const keyAlgorithm = (metadata.caKeyAlgorithm as SshCertKeyAlgorithm) || SshCertKeyAlgorithm.ED25519;
        const { publicKey, privateKey } = await createSshKeyPair(keyAlgorithm);
        const { signedPublicKey } = await createSshCert({
          caPrivateKey: metadata.caPrivateKey,
          clientPublicKey: publicKey,
          keyId: `pam-discovery-${account.id}`,
          principals: [credentials.username],
          requestedTtl: SSH_CERT_TTL,
          certType: SshCertType.USER
        });
        credentials.privateKey = privateKey;
        credentials.certificate = signedPublicKey;
      }
    }

    return credentials as Record<string, unknown>;
  };

  const verifyAdmin = async (projectId: string, ctx: TActorContext) => {
    const { hasRole } = await verifyProductMembership(permissionService, projectId, ctx);
    if (!hasRole(PamProductRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Discovery requires the PAM product Admin role" });
    }
  };

  // unix sources scan with several ssh accounts, stored in the per-type configuration; other types use the single column
  const getCredentialAccountIds = (credentialAccountId: string, configuration: Record<string, unknown>) => {
    const configIds = Array.isArray(configuration.credentialAccountIds)
      ? (configuration.credentialAccountIds as string[])
      : [];
    return Array.from(new Set([credentialAccountId, ...configIds]));
  };

  const resolveCredentialAccount = async (
    projectId: string,
    discoveryType: PamDiscoveryType,
    credentialAccountId: string,
    ctx: TActorContext
  ) => {
    const account = await pamAccountDAL.findByIdWithDetails(credentialAccountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Credential account with ID '${credentialAccountId}' not found` });
    }
    await checkAccountAccess(
      permissionService,
      credentialAccountId,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.LaunchSessions,
      ctx
    );
    const expectedType = getCredentialAccountType(discoveryType);
    if (account.accountType !== expectedType) {
      throw new BadRequestError({ message: `Credential account must be of type '${expectedType}'` });
    }

    // discovery transmits an SSH password to every scanned host, so a password account may only be used by an actor
    // allowed to view its secret
    if (account.accountType === PamAccountType.SSH) {
      const { decryptor } = await getProjectCipher(projectId);
      const { authMethod } = decryptToObject(account.encryptedCredentials, decryptor) as { authMethod?: string };
      if (authMethod === PamSshAuthMethod.Password) {
        await checkAccountAccess(
          permissionService,
          credentialAccountId,
          account.folderId,
          projectId,
          ResourcePermissionPamResourceActions.ViewCredentials,
          ctx
        );
      }
    }

    return account;
  };

  const mapDbError = (err: unknown, name?: string): never => {
    if (err instanceof DatabaseError) {
      const code = (err.error as { code?: string })?.code;
      if (code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `A discovery source named "${name}" already exists` });
      }
      if (code === DatabaseErrorCode.ForeignKeyViolation) {
        throw new BadRequestError({
          message: "Invalid reference: the specified gateway, pool, or account does not exist"
        });
      }
    }
    throw err;
  };

  const withLastRunStatus = async <T extends { id: string }>(sources: T[]) => {
    if (sources.length === 0) {
      return sources.map((s) => ({
        ...s,
        lastRunStatus: null as PamDiscoveryRunStatus | null,
        lastRunError: null as string | null
      }));
    }
    const runs = await pamDiscoverySourceRunDAL.find(
      { $in: { discoverySourceId: sources.map((s) => s.id) } },
      { sort: [["createdAt", "desc"]] }
    );
    const latestBySource = new Map<string, { status: PamDiscoveryRunStatus; errorMessage?: string | null }>();
    runs.forEach((r) => {
      if (!latestBySource.has(r.discoverySourceId)) {
        latestBySource.set(r.discoverySourceId, {
          status: r.status as PamDiscoveryRunStatus,
          errorMessage: r.errorMessage
        });
      }
    });
    return sources.map((s) => {
      const latest = latestBySource.get(s.id);
      return { ...s, lastRunStatus: latest?.status ?? null, lastRunError: latest?.errorMessage ?? null };
    });
  };

  const list = async ({ projectId, search, ...ctx }: TListDiscoverySourcesDTO) => {
    await verifyAdmin(projectId, ctx);
    const sources = await pamDiscoverySourceDAL.find(
      { projectId, ...(search ? { $search: { name: search } } : {}) },
      { sort: [["name", "asc"]] }
    );
    return withLastRunStatus(sources);
  };

  const getById = async ({ projectId, sourceId, discoveryType, ...ctx }: TGetDiscoverySourceDTO) => {
    await verifyAdmin(projectId, ctx);
    const source = await pamDiscoverySourceDAL.findById(sourceId);
    if (!source || source.projectId !== projectId || source.discoveryType !== discoveryType) {
      throw new NotFoundError({ message: `Discovery source with ID '${sourceId}' not found` });
    }
    const [withStatus] = await withLastRunStatus([source]);
    return withStatus;
  };

  const create = async ({
    projectId,
    discoveryType,
    name,
    credentialAccountId,
    gatewayId,
    gatewayPoolId,
    schedule,
    configuration,
    ...ctx
  }: TCreateDiscoverySourceDTO) => {
    await verifyAdmin(projectId, ctx);
    getDiscoveryTypeConfig(discoveryType);

    if (!gatewayId && !gatewayPoolId) {
      throw new BadRequestError({ message: "A gateway or gateway pool is required" });
    }
    await validateGatewayAttachment(deps, gatewayId, gatewayPoolId, ctx);

    const discoveryConfiguration = validateDiscoveryConfiguration(discoveryType, configuration);
    await Promise.all(
      getCredentialAccountIds(credentialAccountId, discoveryConfiguration).map((id) =>
        resolveCredentialAccount(projectId, discoveryType, id, ctx)
      )
    );

    try {
      return await pamDiscoverySourceDAL.create({
        projectId,
        discoveryType,
        name,
        credentialAccountId,
        gatewayId,
        gatewayPoolId,
        schedule,
        discoveryConfiguration
      });
    } catch (err) {
      return mapDbError(err, name);
    }
  };

  const update = async ({
    projectId,
    sourceId,
    discoveryType,
    name,
    credentialAccountId,
    gatewayId,
    gatewayPoolId,
    schedule,
    configuration,
    ...ctx
  }: TUpdateDiscoverySourceDTO) => {
    await verifyAdmin(projectId, ctx);
    const source = await pamDiscoverySourceDAL.findById(sourceId);
    if (!source || source.projectId !== projectId || source.discoveryType !== discoveryType) {
      throw new NotFoundError({ message: `Discovery source with ID '${sourceId}' not found` });
    }

    if (gatewayId !== undefined || gatewayPoolId !== undefined) {
      await validateGatewayAttachment(deps, gatewayId, gatewayPoolId, ctx);
    }

    const discoveryConfiguration =
      configuration !== undefined
        ? validateDiscoveryConfiguration(discoveryType, configuration)
        : ((source.discoveryConfiguration as Record<string, unknown>) ?? {});
    if (credentialAccountId !== undefined || configuration !== undefined) {
      await Promise.all(
        getCredentialAccountIds(credentialAccountId ?? source.credentialAccountId, discoveryConfiguration).map((id) =>
          resolveCredentialAccount(projectId, discoveryType, id, ctx)
        )
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (credentialAccountId !== undefined) updateData.credentialAccountId = credentialAccountId;
    if (gatewayId !== undefined) updateData.gatewayId = gatewayId;
    if (gatewayPoolId !== undefined) updateData.gatewayPoolId = gatewayPoolId;
    if (schedule !== undefined) updateData.schedule = schedule;
    if (configuration !== undefined) updateData.discoveryConfiguration = discoveryConfiguration;

    try {
      return await pamDiscoverySourceDAL.updateById(sourceId, updateData);
    } catch (err) {
      return mapDbError(err, name ?? source.name);
    }
  };

  const deleteSource = async ({ projectId, sourceId, discoveryType, ...ctx }: TDeleteDiscoverySourceDTO) => {
    await verifyAdmin(projectId, ctx);
    const source = await pamDiscoverySourceDAL.findById(sourceId);
    if (!source || source.projectId !== projectId || source.discoveryType !== discoveryType) {
      throw new NotFoundError({ message: `Discovery source with ID '${sourceId}' not found` });
    }
    return pamDiscoverySourceDAL.deleteById(sourceId);
  };

  const runScan = async (sourceId: string, triggeredBy: PamDiscoveryRunTrigger) => {
    const source = await pamDiscoverySourceDAL.findById(sourceId);
    if (!source) return;

    const run = await pamDiscoverySourceRunDAL.create({
      discoverySourceId: sourceId,
      status: PamDiscoveryRunStatus.Running,
      triggeredBy,
      startedAt: new Date()
    });

    try {
      const configuration = (source.discoveryConfiguration as Record<string, unknown>) ?? {};
      const { encryptor, decryptor } = await getProjectCipher(source.projectId);

      const resolvedAccounts = await Promise.all(
        getCredentialAccountIds(source.credentialAccountId, configuration).map((id) =>
          pamAccountDAL.findByIdWithDetails(id)
        )
      );
      const credentialAccounts = await Promise.all(
        resolvedAccounts
          .filter((account): account is NonNullable<typeof account> => Boolean(account))
          .map(async (account) => ({
            accountType: account.accountType as PamAccountType,
            connectionDetails: decryptToObject(account.encryptedConnectionDetails, decryptor),
            credentials: await buildGatewaySshCredentials(account, decryptor)
          }))
      );
      if (!credentialAccounts.length) throw new BadRequestError({ message: "No credential accounts available" });

      const gatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
        gatewayId: source.gatewayId,
        gatewayPoolId: source.gatewayPoolId
      });
      if (!gatewayId) throw new BadRequestError({ message: "No healthy gateway available for this source" });

      const provider = PAM_DISCOVERY_FACTORY_MAP[source.discoveryType as PamDiscoveryType]({
        projectId: source.projectId,
        gatewayId,
        configuration,
        credentialAccounts,
        gatewayV2Service
      });

      const controller = new AbortController();
      const { accounts, machineErrors, dependencies, scannedDependencyMachines } = await withScanTimeout(
        provider.scan(controller.signal),
        controller,
        MAX_SCAN_DURATION_MS
      );
      const upsertLimit = pLimit(DISCOVERED_UPSERT_CONCURRENCY);
      const results = await Promise.all(
        accounts.map((d) =>
          upsertLimit(() =>
            pamDiscoveredAccountDAL.upsertByFingerprint(sourceId, d.fingerprint, {
              accountType: d.accountType,
              name: d.name,
              encryptedDetails: encryptor({ plainText: Buffer.from(JSON.stringify(d.details)) }).cipherTextBlob
            })
          )
        )
      );

      // Persist dependencies found during the per-machine sweep, anchoring each to its run-as account by
      // fingerprint: point at the staged discovered account, or its imported managed account once imported.
      // null = dependency discovery did not run this scan, so the summary omits the dependencies clause.
      let dependencyCount: number | null = null;
      let newDependencyCount: number | null = null;
      if (scannedDependencyMachines.length) {
        const sourceAccounts = await pamDiscoveredAccountDAL.findFingerprintLinks(sourceId);
        const accountByFingerprint = new Map(
          sourceAccounts.map((a) => [
            a.fingerprint,
            { discoveredAccountId: a.id, importedAccountId: a.importedAccountId ?? null }
          ])
        );

        const depLimit = pLimit(DISCOVERED_UPSERT_CONCURRENCY);
        const depResults = (
          await Promise.all(
            dependencies.map((dep) => {
              const match = accountByFingerprint.get(dep.fingerprint);
              if (!match) return Promise.resolve(null); // run-as isn't an account this source discovered
              const accountId = match.importedAccountId;
              return depLimit(() =>
                pamAccountDependencyDAL.upsertByIdentity({
                  projectId: source.projectId,
                  fingerprint: dep.fingerprint,
                  machine: dep.machine,
                  type: dep.type,
                  name: dep.name,
                  data: dep.data,
                  accountId,
                  discoveredAccountId: accountId ? null : match.discoveredAccountId
                })
              );
            })
          )
        ).filter((r): r is { id: string; isNew: boolean } => Boolean(r));

        // Count only anchored dependencies (those matching an account this source knows); un-anchored run-as
        // values aren't persisted or shown, so counting them would inflate the "found" number.
        dependencyCount = depResults.length;
        newDependencyCount = depResults.filter((r) => r.isNew).length;

        await pamAccountDependencyDAL.deleteStaleForSource({
          projectId: source.projectId,
          accountIds: sourceAccounts.map((a) => a.importedAccountId).filter((v): v is string => Boolean(v)),
          discoveredAccountIds: sourceAccounts.map((a) => a.id),
          scannedMachines: scannedDependencyMachines,
          keepIds: depResults.map((r) => r.id)
        });
      }

      const newCount = results.filter((r) => r.isNew).length;
      await pamDiscoverySourceRunDAL.updateById(run.id, {
        status: PamDiscoveryRunStatus.Completed,
        discoveredCount: accounts.length,
        newCount,
        dependencyCount,
        newDependencyCount,
        machineErrors: machineErrors.length ? JSON.stringify(machineErrors) : null,
        completedAt: new Date()
      });

      await auditLogService.createAuditLog({
        projectId: source.projectId,
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.PAM_DISCOVERY_SCAN,
          metadata: {
            sourceId,
            discoveryType: source.discoveryType,
            runId: run.id,
            status: PamDiscoveryRunStatus.Completed,
            triggeredBy,
            discoveredCount: accounts.length,
            newCount
          }
        }
      });
    } catch (err) {
      logger.error(err, `PAM discovery scan failed [sourceId=${sourceId}]`);
      const errorMessage = err instanceof Error ? err.message : "Scan failed";
      await pamDiscoverySourceRunDAL.updateById(run.id, {
        status: PamDiscoveryRunStatus.Failed,
        errorMessage,
        completedAt: new Date()
      });

      await auditLogService.createAuditLog({
        projectId: source.projectId,
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.PAM_DISCOVERY_SCAN,
          metadata: {
            sourceId,
            discoveryType: source.discoveryType,
            runId: run.id,
            status: PamDiscoveryRunStatus.Failed,
            triggeredBy,
            errorMessage
          }
        }
      });
    } finally {
      await pamDiscoverySourceDAL.updateById(sourceId, { lastRunAt: new Date() });
    }
  };

  const triggerScan = async ({ projectId, sourceId, discoveryType, ...ctx }: TTriggerScanDTO) => {
    await verifyAdmin(projectId, ctx);
    const source = await pamDiscoverySourceDAL.findById(sourceId);
    if (!source || source.projectId !== projectId || source.discoveryType !== discoveryType) {
      throw new NotFoundError({ message: `Discovery source with ID '${sourceId}' not found` });
    }
    const running = await pamDiscoverySourceRunDAL.findOne({
      discoverySourceId: sourceId,
      status: PamDiscoveryRunStatus.Running
    });
    if (running) throw new BadRequestError({ message: "A scan is already in progress for this source" });

    await enqueueScan(sourceId, PamDiscoveryRunTrigger.Manual);
    return { message: "Scan started" };
  };

  const listRuns = async ({ projectId, sourceId, offset = 0, limit = 20, ...ctx }: TListRunsDTO) => {
    await verifyAdmin(projectId, ctx);
    const source = await pamDiscoverySourceDAL.findById(sourceId);
    if (!source || source.projectId !== projectId) {
      throw new NotFoundError({ message: `Discovery source with ID '${sourceId}' not found` });
    }
    const runs = await pamDiscoverySourceRunDAL.find(
      { discoverySourceId: sourceId },
      { sort: [["createdAt", "desc"]], offset, limit }
    );
    return runs;
  };

  const listDiscovered = async ({ projectId, sourceId, search, offset, limit, ...ctx }: TListDiscoveredDTO) => {
    await verifyAdmin(projectId, ctx);
    const source = await pamDiscoverySourceDAL.findById(sourceId);
    if (!source || source.projectId !== projectId) {
      throw new NotFoundError({ message: `Discovery source with ID '${sourceId}' not found` });
    }
    const { accounts, totalCount } = await pamDiscoveredAccountDAL.listStaged(sourceId, { search, offset, limit });

    const dependencies = await pamAccountDependencyDAL.findByDiscoveredAccountIds(accounts.map((a) => a.id));
    const dependenciesByAccount = new Map<string, { id: string; type: string; name: string; machine: string }[]>();
    for (const dep of dependencies) {
      if (dep.discoveredAccountId) {
        const depList = dependenciesByAccount.get(dep.discoveredAccountId) ?? [];
        depList.push({ id: dep.id, type: dep.type, name: dep.name, machine: dep.machine });
        dependenciesByAccount.set(dep.discoveredAccountId, depList);
      }
    }

    return {
      discoveredAccounts: accounts.map((a) => {
        const accountDependencies = dependenciesByAccount.get(a.id) ?? [];
        return {
          id: a.id,
          accountType: a.accountType as PamAccountType,
          name: a.name,
          fingerprint: a.fingerprint,
          createdAt: a.createdAt,
          dependencyCount: accountDependencies.length,
          dependencies: accountDependencies
        };
      }),
      totalCount
    };
  };

  const listAccountDependencies = async ({ accountId, projectId, ...ctx }: TListAccountDependenciesDTO) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }
    await checkAccountAccess(
      permissionService,
      accountId,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.ReadAccounts,
      ctx
    );

    const dependencies = await pamAccountDependencyDAL.findByAccountId(accountId);
    const needsDecrypt = dependencies.some((d) => d.rotationStatus === "failed" && d.encryptedLastRotationMessage);
    const decryptor = needsDecrypt ? (await getProjectCipher(projectId)).decryptor : null;

    return dependencies.map((d) => ({
      id: d.id,
      type: d.type,
      name: d.name,
      machine: d.machine,
      data: d.data,
      rotationStatus: d.rotationStatus ?? null,
      lastRotatedAt: d.lastRotatedAt ?? null,
      lastRotationMessage:
        d.rotationStatus === "failed" && d.encryptedLastRotationMessage && decryptor
          ? decryptor({ cipherTextBlob: d.encryptedLastRotationMessage }).toString("utf-8")
          : null
    }));
  };

  const importAccounts = async ({ projectId, sourceId, folderId, accounts, ...ctx }: TImportDiscoveredDTO) => {
    await verifyAdmin(projectId, ctx);
    const source = await pamDiscoverySourceDAL.findById(sourceId);
    if (!source || source.projectId !== projectId) {
      throw new NotFoundError({ message: `Discovery source with ID '${sourceId}' not found` });
    }

    const { decryptor } = await getProjectCipher(projectId);

    const results = await Promise.all(
      accounts.map(async (item) => {
        try {
          const discovered = await pamDiscoveredAccountDAL.findById(item.discoveredAccountId);
          if (!discovered || discovered.discoverySourceId !== sourceId) {
            throw new NotFoundError({ message: "Discovered account not found" });
          }
          if (discovered.importedAccountId) {
            // Already imported. The account is created, marked, and its deps backfilled in three separate writes
            // (create runs its own transaction, so they can't share one). Re-run the idempotent backfill here so
            // a retry heals a prior import whose backfill didn't complete, flipping any still-staged deps onto
            // the account instead of leaving them stranded behind this early return.
            await pamAccountDependencyDAL.backfillImported(discovered.id, discovered.importedAccountId);
            return {
              discoveredAccountId: item.discoveredAccountId,
              status: PamDiscoveryImportStatus.Imported,
              accountId: discovered.importedAccountId,
              name: item.name ?? discovered.name
            };
          }

          const details = decryptToObject(discovered.encryptedDetails, decryptor) as {
            connectionDetails: Record<string, unknown>;
            credentials: Record<string, unknown>;
          };

          const account = await pamAccountService.create({
            projectId,
            accountType: discovered.accountType as PamAccountType,
            name: item.name ?? discovered.name,
            folderId,
            templateId: item.templateId,
            connectionDetails: details.connectionDetails,
            credentials: details.credentials,
            ...ctx
          });

          await pamDiscoveredAccountDAL.updateById(discovered.id, { importedAccountId: account.id });
          // Flip this account's staged dependencies onto the managed account so they're rotation-eligible
          // immediately, without waiting for the next scan.
          await pamAccountDependencyDAL.backfillImported(discovered.id, account.id);
          return {
            discoveredAccountId: item.discoveredAccountId,
            status: PamDiscoveryImportStatus.Imported,
            accountId: account.id,
            name: item.name ?? discovered.name
          };
        } catch (err) {
          return {
            discoveredAccountId: item.discoveredAccountId,
            status: PamDiscoveryImportStatus.Error,
            message: err instanceof Error ? err.message : "Import failed"
          };
        }
      })
    );

    return { results };
  };

  // Runs on boot: processes scan jobs and registers the daily fan-out for scheduled sources
  const init = () => {
    const appCfg = getConfig();
    if (appCfg.isSecondaryInstance) return;

    queueService.start(QueueName.PamDiscoveryScan, async (job) => {
      await runScan(job.data.sourceId, job.data.triggeredBy as PamDiscoveryRunTrigger);
    });

    cronJob.register({
      name: CronJobName.PamDiscoveryScheduledScan,
      pattern: "0 3 * * *",
      runHashTtlS: 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        const sources = await pamDiscoverySourceDAL.findScheduled();
        const now = Date.now();
        const due = sources.filter((s) => {
          const windowMs = (s.schedule === PamDiscoverySchedule.Weekly ? 7 : 1) * 24 * 60 * 60 * 1000;
          return !s.lastRunAt || now - new Date(s.lastRunAt).getTime() >= windowMs;
        });
        await Promise.all(due.map((s) => enqueueScan(s.id, PamDiscoveryRunTrigger.Schedule)));
      }
    });
  };

  return {
    init,
    list,
    getById,
    create,
    update,
    deleteSource,
    triggerScan,
    runScan,
    listRuns,
    listDiscovered,
    importAccounts,
    listAccountDependencies
  };
};
