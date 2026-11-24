import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, TDynamicSecretLeases } from "@app/db/schemas";
import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import { TAgentVaultDynamicSecretConfig } from "../agent-vault/agent-vault-credential-schemas";
import { AgentVaultCredentialType } from "../agent-vault/agent-vault-enums";
import { EventType, TAuditLogServiceFactory } from "../audit-log/audit-log-types";
import { decryptLeaseData } from "../dynamic-secret-lease/dynamic-secret-lease-fns";
import { TDynamicSecretLeaseQueueServiceFactory } from "../dynamic-secret-lease/dynamic-secret-lease-queue";
import { TDynamicSecretLeaseServiceFactory } from "../dynamic-secret-lease/dynamic-secret-lease-types";
import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretStatus } from "../dynamic-secret/dynamic-secret-types";
import { DynamicSecretProviders } from "../dynamic-secret/providers/models";
import { TAgentVaultDynamicSecretDALFactory } from "./agent-vault-dynamic-secret-dal";
import {
  CLIENT_CERTIFICATE_LEASE_FIELDS,
  clientCertificateFromLeaseData,
  isLeaseFresh,
  MIN_DYNAMIC_SECRET_TTL_MS,
  MIN_FALLBACK_REMAINING_MS,
  TLeasedClientCertificate
} from "./agent-vault-dynamic-secret-fns";

const LEASE_LOCK_DURATION_MS = 90 * 1000;
const LEASE_LOCK_SETTINGS = { retryCount: 12, retryDelay: 200, retryJitter: 50 };
// The revocation worker reads the lease on a replica, which skips a lease it can't see yet.
const LEASE_REVOCATION_DELAY_MS = 60 * 1000;
// After a failed lease, the next one waits 30 s, doubling per failure up to 10 minutes, so an outage
// doesn't turn every proxy poll into a provider call. The failure count resets after an hour without one.
const LEASE_BACKOFF_BASE_MS = 30 * 1000;
const LEASE_BACKOFF_MAX_MS = 10 * 60 * 1000;
const LEASE_BACKOFF_RESET_MS = 60 * 60 * 1000;

const AGENT_VAULT_LEASE_IDENTITY_NAME = "agent-vault";

type TAgentVaultDynamicSecretServiceFactoryDep = {
  agentVaultDynamicSecretDAL: TAgentVaultDynamicSecretDALFactory;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findOne">;
  agentVaultServiceDAL: Pick<TAgentVaultServiceDALFactory, "findByIdPrimary">;
  folderDAL: Pick<TSecretFolderDALFactory, "findById" | "findSecretPathByFolderIds">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "transaction">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  dynamicSecretLeaseService: Pick<TDynamicSecretLeaseServiceFactory, "createSystemLease">;
  dynamicSecretQueueService: Pick<TDynamicSecretLeaseQueueServiceFactory, "setLeaseRevocation">;
  kmsDataKeyService: Pick<TKmsDataKeyService, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "getItemPrimary" | "setItemWithExpiry" | "deleteItem">;
  licenseService: Pick<TLicenseService, "getPlan">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TAgentVaultDynamicSecretServiceFactory = ReturnType<typeof agentVaultDynamicSecretServiceFactory>;

type TClientCertificateCredential = {
  type: AgentVaultCredentialType.ClientCertificate;
  certificate: string;
  privateKey: string;
};

export type TResolvedDynamicSecretCredential = { credential: TClientCertificateCredential } | { problem: string };

export const agentVaultDynamicSecretServiceFactory = ({
  agentVaultDynamicSecretDAL,
  dynamicSecretDAL,
  agentVaultServiceDAL,
  folderDAL,
  projectDAL,
  permissionService,
  dynamicSecretLeaseService,
  dynamicSecretQueueService,
  kmsDataKeyService,
  keyStore,
  licenseService,
  auditLogService
}: TAgentVaultDynamicSecretServiceFactoryDep) => {
  const prepareReference = async ({
    dynamicSecretId,
    ctx
  }: {
    dynamicSecretId: string;
    ctx: TGenericPermission;
  }): Promise<TAgentVaultDynamicSecretConfig> => {
    const dynamicSecret = await dynamicSecretDAL.findOne({ id: dynamicSecretId });
    const folder = dynamicSecret ? await folderDAL.findById(dynamicSecret.folderId) : undefined;
    const project = folder ? await projectDAL.findById(folder.projectId) : undefined;
    if (!dynamicSecret || !folder || !project || project.orgId !== ctx.actorOrgId) {
      throw new NotFoundError({ message: `Dynamic secret with ID '${dynamicSecretId}' not found` });
    }
    const plan = await licenseService.getPlan(project.orgId);
    plan.assert(PlanFeature.DynamicSecret);
    if ((dynamicSecret.status as DynamicSecretStatus | null) === DynamicSecretStatus.Deleting) {
      throw new BadRequestError({
        message: `The dynamic secret '${dynamicSecret.name}' is being deleted, so it can't issue credentials. Choose another.`
      });
    }
    if (dynamicSecret.type !== DynamicSecretProviders.Namespace) {
      throw new BadRequestError({
        message: `The dynamic secret '${dynamicSecret.name}' is a '${dynamicSecret.type}' dynamic secret, which doesn't issue client certificates. A TLS service can only lease from a '${DynamicSecretProviders.Namespace}' dynamic secret.`
      });
    }
    const defaultTtlMs = ms(dynamicSecret.defaultTTL);
    if (!(defaultTtlMs >= MIN_DYNAMIC_SECRET_TTL_MS)) {
      throw new BadRequestError({
        message: `The dynamic secret '${dynamicSecret.name}' has a default TTL of ${dynamicSecret.defaultTTL}, under the 10 minutes a TLS service needs: Agent Vault proxies poll up to every 300 seconds and each certificate must outlive the poll it is sent in. Raise its default TTL to 10m or more.`
      });
    }

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(folder.projectId, [folder.id]);
    const reference = {
      dynamicSecretId: dynamicSecret.id,
      projectId: folder.projectId,
      environment: folder.environment.envSlug,
      secretPath: folderWithPath?.path ?? "/",
      name: dynamicSecret.name
    };

    const { permission } = await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId: folder.projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: reference.environment,
        secretPath: reference.secretPath,
        metadata: dynamicSecret.metadata
      })
    );
    return reference;
  };

  const findExistingDynamicSecretIds = (ids: string[]) =>
    agentVaultDynamicSecretDAL.findExistingDynamicSecretIds([...new Set(ids)]);

  // The lease id is already the job id of its expiry.
  const queueLeaseRevocation = (lease: Pick<TDynamicSecretLeases, "id" | "dynamicSecretId">) =>
    dynamicSecretQueueService.setLeaseRevocation(
      lease.id,
      lease.dynamicSecretId,
      new Date(Date.now() + LEASE_REVOCATION_DELAY_MS),
      `${lease.id}-agent-vault-revoke`
    );

  const resolveClientCertificate = async ({
    serviceId,
    serviceName,
    agentVaultProjectId,
    reference,
    pollIntervalSeconds,
    onFallback
  }: {
    serviceId: string;
    serviceName: string;
    agentVaultProjectId: string;
    reference: TAgentVaultDynamicSecretConfig;
    pollIntervalSeconds: number;
    onFallback?: (credential: TClientCertificateCredential) => void;
  }): Promise<TResolvedDynamicSecretCredential> => {
    const label = `[serviceId=${serviceId}] [dynamicSecretId=${reference.dynamicSecretId}]`;
    const toCredential = (certificate: TLeasedClientCertificate): { credential: TClientCertificateCredential } => ({
      credential: {
        type: AgentVaultCredentialType.ClientCertificate,
        certificate: certificate.certificate,
        privateKey: certificate.privateKey
      }
    });

    let decryptor: ((input: { cipherTextBlob: Buffer }) => Buffer) | undefined;
    const openLease = async (lease: TDynamicSecretLeases) => {
      decryptor ??= (
        await kmsDataKeyService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: reference.projectId
        })
      ).decryptor;
      return clientCertificateFromLeaseData(decryptLeaseData(decryptor, lease.encryptedLeaseData));
    };

    let fallback: { credential: TClientCertificateCredential } | null = null;
    const fallbackOr = (problem: string): TResolvedDynamicSecretCredential => fallback ?? { problem };

    const backoffKey = KeyStorePrefixes.AgentVaultDynamicSecretLeaseBackoff(serviceId);
    const readBackoff = async () => {
      try {
        const stored = await keyStore.getItemPrimary(backoffKey);
        return stored ? (JSON.parse(stored) as { failures: number; retryAt: number; problem: string }) : null;
      } catch (error) {
        logger.warn(error, `agentVaultDynamicSecret: failed to read the lease backoff ${label}`);
        return null;
      }
    };
    const backingOff = async (): Promise<TResolvedDynamicSecretCredential | null> => {
      const backoff = await readBackoff();
      if (!backoff || backoff.retryAt <= Date.now()) return null;
      return fallbackOr(`${backoff.problem} The next attempt is after ${new Date(backoff.retryAt).toISOString()}.`);
    };
    // Called with the lease lock held, so resolves on other replicas can't count the same failure twice.
    const failLease = async (problem: string): Promise<TResolvedDynamicSecretCredential> => {
      const failures = ((await readBackoff())?.failures ?? 0) + 1;
      const delayMs = Math.min(LEASE_BACKOFF_BASE_MS * 2 ** (failures - 1), LEASE_BACKOFF_MAX_MS);
      await keyStore
        .setItemWithExpiry(
          backoffKey,
          Math.ceil((delayMs + LEASE_BACKOFF_RESET_MS) / 1000),
          JSON.stringify({ failures, retryAt: Date.now() + delayMs, problem })
        )
        .catch((error) => logger.warn(error, `agentVaultDynamicSecret: failed to store the lease backoff ${label}`));
      return fallbackOr(problem);
    };

    const findFresh = async (): Promise<TResolvedDynamicSecretCredential | null> => {
      const now = new Date();
      const leases = (
        await agentVaultDynamicSecretDAL.findLeasesForService({
          serviceId,
          dynamicSecretId: reference.dynamicSecretId
        })
      )
        .filter((lease) => lease.expireAt.getTime() - now.getTime() > MIN_FALLBACK_REMAINING_MS)
        .sort((a, b) => b.expireAt.getTime() - a.expireAt.getTime());
      for (const lease of leases) {
        const leaseFresh = isLeaseFresh(
          { issuedAt: lease.createdAt, expiresAt: lease.expireAt, pollIntervalSeconds },
          now
        );
        // eslint-disable-next-line no-await-in-loop
        const opened = await openLease(lease);
        if ("problem" in opened) {
          if (leaseFresh) return opened;
          // eslint-disable-next-line no-continue
          continue;
        }
        const expiresAt = new Date(Math.min(lease.expireAt.getTime(), opened.certificate.notAfter.getTime()));
        if (leaseFresh && isLeaseFresh({ issuedAt: lease.createdAt, expiresAt, pollIntervalSeconds }, now)) {
          return toCredential(opened.certificate);
        }
        if (!fallback && expiresAt.getTime() - now.getTime() > MIN_FALLBACK_REMAINING_MS) {
          fallback = toCredential(opened.certificate);
          onFallback?.(fallback.credential);
        }
      }
      return null;
    };

    try {
      const fresh = await findFresh();
      if (fresh) return fresh;

      const backedOff = await backingOff();
      if (backedOff) return backedOff;

      let lock;
      try {
        lock = await keyStore.acquireLock(
          [KeyStorePrefixes.AgentVaultDynamicSecretLeaseLock(serviceId)],
          LEASE_LOCK_DURATION_MS,
          LEASE_LOCK_SETTINGS
        );
      } catch {
        return (
          (await findFresh()) ??
          fallbackOr(
            "Another resolve is still leasing this service's client certificate; it goes out on the next poll."
          )
        );
      }

      try {
        const leasedMeanwhile = await findFresh();
        if (leasedMeanwhile) return leasedMeanwhile;
        const backedOffMeanwhile = await backingOff();
        if (backedOffMeanwhile) return backedOffMeanwhile;

        let created;
        try {
          created = await dynamicSecretLeaseService.createSystemLease({
            dynamicSecretId: reference.dynamicSecretId,
            config: { agentVaultServiceId: serviceId },
            identityName: AGENT_VAULT_LEASE_IDENTITY_NAME,
            persistedLeaseFields: CLIENT_CERTIFICATE_LEASE_FIELDS
          });
        } catch (error) {
          return failLease(
            `Couldn't lease a client certificate from the dynamic secret '${reference.name}': ${error instanceof Error ? error.message : String(error)}`
          );
        }
        const { lease, data, dynamicSecret, projectId, environment, secretPath } = created;
        logger.info(`agentVaultDynamicSecret: leased a client certificate ${label} [leaseId=${lease.id}]`);

        await auditLogService
          .createAuditLog({
            projectId,
            actor: { type: ActorType.PLATFORM, metadata: {} },
            event: {
              type: EventType.CREATE_DYNAMIC_SECRET_LEASE,
              metadata: {
                dynamicSecretName: dynamicSecret.name,
                dynamicSecretType: dynamicSecret.type,
                dynamicSecretId: dynamicSecret.id,
                projectId,
                environment,
                secretPath,
                leaseId: lease.id,
                leaseExternalEntityId: lease.externalEntityId,
                leaseExpireAt: lease.expireAt,
                agentVaultServiceId: serviceId,
                agentVaultServiceName: serviceName,
                agentVaultProjectId
              }
            }
          })
          .catch((error) =>
            logger.error(error, `agentVaultDynamicSecret: failed to audit a lease ${label} [leaseId=${lease.id}]`)
          );

        const giveBack = () =>
          queueLeaseRevocation(lease).catch((error) =>
            logger.error(
              error,
              `agentVaultDynamicSecret: failed to queue a lease's revocation, it is revoked when it expires ${label} [leaseId=${lease.id}]`
            )
          );

        // A delete or credential change during the provider call revoked the service's leases without this one.
        // The service row outlives a project deletion, so the project is also read, on the primary.
        const service = await agentVaultServiceDAL.findByIdPrimary(serviceId);
        const project = service && (await projectDAL.transaction((tx) => projectDAL.findById(service.projectId, tx)));
        if (
          !project ||
          service?.credentialType !== AgentVaultCredentialType.DynamicSecret ||
          (service.credentialConfig as TAgentVaultDynamicSecretConfig).dynamicSecretId !== reference.dynamicSecretId
        ) {
          await giveBack();
          return { problem: "The service was deleted or no longer leases from this dynamic secret." };
        }

        const read = clientCertificateFromLeaseData(data);
        if ("problem" in read) return fallbackOr(read.problem);
        // The default TTL is only checked on save, so it may have been shortened since.
        const expiresAt = new Date(Math.min(lease.expireAt.getTime(), read.certificate.notAfter.getTime()));
        if (!isLeaseFresh({ issuedAt: lease.createdAt, expiresAt, pollIntervalSeconds })) {
          await giveBack();
          return failLease(
            `The dynamic secret '${reference.name}' issued a client certificate that expires before Agent Vault proxies poll for its replacement. Raise its default TTL to 10m or more.`
          );
        }
        await keyStore
          .deleteItem(backoffKey)
          .catch((error) => logger.warn(error, `agentVaultDynamicSecret: failed to clear the lease backoff ${label}`));
        return toCredential(read.certificate);
      } finally {
        await lock
          .release()
          .catch((error) => logger.warn(error, `agentVaultDynamicSecret: lock release failed ${label}`));
      }
    } catch (error) {
      return fallbackOr(
        `Couldn't lease a client certificate from the dynamic secret '${reference.name}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const revokeServiceLeases = async ({
    serviceId,
    dynamicSecretId
  }: {
    serviceId: string;
    dynamicSecretId: string;
  }) => {
    try {
      const leases = await agentVaultDynamicSecretDAL.findLeasesForService({ serviceId, dynamicSecretId });
      const queued = await Promise.allSettled(leases.map(queueLeaseRevocation));
      queued.forEach((result, index) => {
        if (result.status === "rejected") {
          logger.error(
            result.reason,
            `agentVaultDynamicSecret: failed to queue a lease's revocation, it is revoked when it expires [serviceId=${serviceId}] [leaseId=${leases[index].id}]`
          );
        }
      });
    } catch (error) {
      logger.error(
        error,
        `agentVaultDynamicSecret: failed to revoke a service's leases, they are revoked when they expire [serviceId=${serviceId}]`
      );
    }
  };

  return { prepareReference, findExistingDynamicSecretIds, resolveClientCertificate, revokeServiceLeases };
};
