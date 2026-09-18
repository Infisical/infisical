import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, ResourceType, TCertificateSyncs } from "@app/db/schemas";
import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionCertificateActions,
  ResourcePermissionPkiSyncActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { deepEqual } from "@app/lib/fn/object";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";
import { TPkiApplicationProfileDALFactory } from "@app/services/pki-application/pki-application-profile-dal";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";

import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { CertStatus } from "../certificate/certificate-types";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "../certificate-sync/certificate-sync-enums";
import { TSyncMetadata } from "../certificate-sync/certificate-sync-schemas";
import { encryptPkiSyncCredentials } from "./pki-sync-credentials-fns";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { HEALTH_CHECK_COMMAND_OPTION_KEY, PkiSync, PkiSyncStatus } from "./pki-sync-enums";
import { PkiSyncExportFormat } from "./pki-sync-export-fns";
import { hasAnyPkiSyncFilter, PKI_SYNC_FILTER_KINDS, PKI_SYNC_PREVIEW_PAGE_SIZE } from "./pki-sync-filter-fns";
import {
  applyPkiSyncCertificateDiff,
  assertPkiSyncCanHoldMatchedCertificates,
  computePkiSyncCertificateDiff,
  TPkiSyncReconcileTarget,
  withPkiSyncFilterLock
} from "./pki-sync-filter-reconcile-fns";
import {
  assertFiltersCannotExceedCertificateCap,
  assertPkiSyncCertificateCapsAllowCount,
  assertPkiSyncLicense,
  getPkiSyncProviderCapabilities,
  listPkiSyncOptions,
  resolvePkiSyncDestinationConfigUpdate
} from "./pki-sync-fns";
import {
  applyHealthCheckCommandUpdate,
  getHealthCheckCommand,
  normalizeNewHealthCheckCommand,
  toHealthCheckApiResult
} from "./pki-sync-health-check-command-fns";
import { TPkiSyncHealthCheckQueueFactory } from "./pki-sync-health-check-queue";
import { HostCommandKind } from "./pki-sync-host-command-fns";
import { getPkiSyncConnectionApps, PKI_SYNC_NAME_MAP } from "./pki-sync-maps";
import {
  applyPostSyncCommandUpdate,
  normalizeNewPostSyncCommand,
  POST_SYNC_COMMAND_OPTION_KEY
} from "./pki-sync-post-sync-command-fns";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";
import {
  assertTargetHostMatchesConnection,
  getPkiSyncTargetHost,
  TPkiSyncDeliveryTarget
} from "./pki-sync-target-host-fns";
import {
  TAddCertificatesToPkiSyncDTO,
  TClearDefaultCertificateDTO,
  TCreatePkiSyncDTO,
  TDeletePkiSyncDTO,
  TFindPkiSyncByIdDTO,
  TListPkiSyncCertificatesDTO,
  TListPkiSyncsByProjectId,
  TPkiSync,
  TPkiSyncCertificate,
  TPkiSyncCertificateOrder,
  TPkiSyncCertificateRef,
  TPkiSyncFilterPreview,
  TPkiSyncFilters,
  TPkiSyncRaw,
  TPreviewPkiSyncFiltersDTO,
  TRemoveCertificatesFromPkiSyncDTO,
  TSearchPkiSyncCertificateOrdersDTO,
  TSetCertificateAsDefaultDTO,
  TTriggerPkiSyncImportCertificatesByIdDTO,
  TTriggerPkiSyncRemoveCertificatesByIdDTO,
  TTriggerPkiSyncSyncCertificatesByIdDTO,
  TUpdatePkiSyncDTO
} from "./pki-sync-types";

type TPkiSyncServiceFactoryDep = {
  pkiSyncDAL: Pick<
    TPkiSyncDALFactory,
    | "findById"
    | "findByProjectIdWithSubscribers"
    | "findByNameAndProjectId"
    | "create"
    | "updateById"
    | "deleteById"
    | "primaryNode"
  >;
  certificateDAL: Pick<
    TCertificateDALFactory,
    | "find"
    | "findCertificatesMatchingSyncFilters"
    | "countCertificatesMatchingSyncFilters"
    | "findReadableCertificateIds"
    | "findLatestCertificatesByOrderIds"
    | "primaryNode"
  >;
  pkiApplicationProfileDAL: Pick<TPkiApplicationProfileDALFactory, "findByApplicationId">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "findByPkiSyncId"
    | "findByCertificateId"
    | "findByPkiSyncAndCertificate"
    | "findCertificateIdsByPkiSyncId"
    | "addCertificates"
    | "removeCertificates"
    | "findWithDetails"
    | "updateSyncMetadata"
    | "clearSyncMetadataFlag"
    | "transaction"
    | "primaryNode"
  >;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById">;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  pkiSyncHealthCheckQueue: Pick<
    TPkiSyncHealthCheckQueueFactory,
    "runHealthCheckNow" | "testHealthCheckCommand" | "testTargetHostReachable"
  >;
  pkiSyncQueue: Pick<
    TPkiSyncQueueFactory,
    "queuePkiSyncSyncCertificatesById" | "queuePkiSyncImportCertificatesById" | "queuePkiSyncRemoveCertificatesById"
  >;
};

const $assertSyncAcceptsFilters = (pkiSync: Pick<TPkiSyncRaw, "applicationId">) => {
  if (!pkiSync.applicationId) {
    throw new BadRequestError({
      message:
        "This PKI sync is not attached to an Application, so its certificates cannot be changed. Create a sync inside an Application to select certificates by filter."
    });
  }
};

export type TPkiSyncServiceFactory = ReturnType<typeof pkiSyncServiceFactory>;

export const pkiSyncServiceFactory = ({
  pkiSyncDAL,
  certificateDAL,
  pkiApplicationProfileDAL,
  certificateSyncDAL,
  pkiSubscriberDAL,
  pkiApplicationDAL,
  appConnectionService,
  permissionService,
  licenseService,
  keyStore,
  kmsService,
  pkiSyncQueue,
  pkiSyncHealthCheckQueue,
  auditLogService
}: TPkiSyncServiceFactoryDep) => {
  const $resourceFallback = async (
    action: ResourcePermissionPkiSyncActions,
    projectId: string,
    applicationId: string | null | undefined,
    actor: OrgServiceActor
  ) => {
    if (!applicationId) return false;
    const { permission } = await permissionService.getResourcePermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId: applicationId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    return permission.can(action, ResourcePermissionSub.PkiSyncs);
  };

  const $assertHostCommandsAreSupported = (
    destination: PkiSync,
    syncOptions: Record<string, unknown> | undefined,
    connection: { gatewayId?: string | null; gatewayPoolId?: string | null } | undefined
  ) => {
    const capabilities = getPkiSyncProviderCapabilities(destination);
    const hasGateway = Boolean(connection?.gatewayId || connection?.gatewayPoolId);

    const configuredCommands = [
      {
        kind: HostCommandKind.HealthCheck,
        command: syncOptions?.[HEALTH_CHECK_COMMAND_OPTION_KEY],
        isSupportedByDestination: capabilities.canRunHealthCheckCommand
      },
      {
        kind: HostCommandKind.PostSync,
        command: syncOptions?.[POST_SYNC_COMMAND_OPTION_KEY],
        isSupportedByDestination: capabilities.canRunPostSyncCommand
      }
    ].filter(({ command }) => Boolean(command));

    configuredCommands.forEach(({ kind, isSupportedByDestination }) => {
      if (!isSupportedByDestination) {
        throw new BadRequestError({
          message: `A ${kind} cannot be set for ${PKI_SYNC_NAME_MAP[destination]} PKI sync destination`
        });
      }

      if (!hasGateway) {
        throw new BadRequestError({
          message: `A ${kind} runs through a gateway. Configure the sync's App Connection to use a gateway, or clear the command.`
        });
      }
    });
  };

  const $assertSyncAction = async (
    projectAction: ProjectPermissionPkiSyncActions,
    resourceAction: ResourcePermissionPkiSyncActions,
    pkiSync: { projectId: string; applicationId?: string | null; name: string },
    subscriberName: string | undefined,
    actor: OrgServiceActor
  ) => {
    if (pkiSync.applicationId) {
      const allowedByResource = await $resourceFallback(
        resourceAction,
        pkiSync.projectId,
        pkiSync.applicationId,
        actor
      );
      if (allowedByResource) return null;
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId: pkiSync.projectId
    });
    const projectSubject = subject(ProjectPermissionSub.PkiSyncs, {
      subscriberName,
      name: pkiSync.name
    });
    ForbiddenError.from(permission).throwUnlessCan(projectAction, projectSubject);
    return permission;
  };

  const $assertMaySetHostCommand = async (
    actions: { project: ProjectPermissionPkiSyncActions; resource: ResourcePermissionPkiSyncActions },
    nextCommand: unknown,
    currentCommand: unknown,
    pkiSync: { projectId: string; applicationId?: string | null; name: string },
    subscriberName: string | undefined,
    actor: OrgServiceActor,
    isExecutionTargetChanging: boolean
  ) => {
    const isCommandChanging = nextCommand !== currentCommand && Boolean(nextCommand || currentCommand);
    const isCommandBeingRetargeted = Boolean(nextCommand) && isExecutionTargetChanging;
    if (!isCommandChanging && !isCommandBeingRetargeted) return;

    await $assertSyncAction(actions.project, actions.resource, pkiSync, subscriberName, actor);
  };

  const $deliveryTarget = (destinationConfig: Record<string, unknown> | null | undefined) => {
    const config = destinationConfig as TPkiSyncDeliveryTarget | undefined;
    return JSON.stringify([
      config?.host?.toLowerCase(),
      config?.port,
      config?.sslEnabled,
      config?.sslRejectUnauthorized,
      config?.sslCertificate,
      config?.sshHostKeys
    ]);
  };

  const $assertMaySetTargetHost = async ({
    nextConfig,
    currentConfig,
    pkiSync,
    subscriberName,
    actor,
    isRetargetedByConnection = false
  }: {
    nextConfig: Record<string, unknown> | null | undefined;
    currentConfig: Record<string, unknown> | null | undefined;
    pkiSync: { projectId: string; applicationId?: string | null; name: string };
    subscriberName: string | undefined;
    actor: OrgServiceActor;
    isRetargetedByConnection?: boolean;
  }) => {
    if (!isRetargetedByConnection && $deliveryTarget(nextConfig) === $deliveryTarget(currentConfig)) return;

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.SetTargetHost,
      ResourcePermissionPkiSyncActions.SetTargetHost,
      pkiSync,
      subscriberName,
      actor
    );
  };

  const $assertTargetHostReachable = async ({
    destination,
    connection,
    destinationConfig
  }: {
    destination: PkiSync;
    connection: { id: string; app: AppConnection };
    destinationConfig: Record<string, unknown> | null | undefined;
  }) => {
    if (connection.app !== AppConnection.LDAP) return;
    if (!getPkiSyncTargetHost(destinationConfig)) return;

    await pkiSyncHealthCheckQueue.testTargetHostReachable({
      destination,
      connectionId: connection.id,
      destinationConfig: destinationConfig as Record<string, unknown>
    });
  };

  const HOST_COMMAND_ACTIONS = {
    [HEALTH_CHECK_COMMAND_OPTION_KEY]: {
      project: ProjectPermissionPkiSyncActions.SetHealthCheckCommand,
      resource: ResourcePermissionPkiSyncActions.SetHealthCheckCommand
    },
    [POST_SYNC_COMMAND_OPTION_KEY]: {
      project: ProjectPermissionPkiSyncActions.SetPostSyncCommand,
      resource: ResourcePermissionPkiSyncActions.SetPostSyncCommand
    }
  } as const;

  const $assertHostCommandWrite = async (args: {
    destination: PkiSync;
    nextSyncOptions: Record<string, unknown> | undefined;
    storedSyncOptions: Record<string, unknown> | undefined;
    pkiSync: { projectId: string; applicationId?: string | null; name: string };
    subscriberName: string | undefined;
    actor: OrgServiceActor;
    isExecutionTargetChanging?: boolean;
    resolveConnection: () => Promise<{ gatewayId?: string | null; gatewayPoolId?: string | null } | undefined>;
  }) => {
    const {
      destination,
      nextSyncOptions,
      storedSyncOptions,
      pkiSync,
      subscriberName,
      actor,
      isExecutionTargetChanging = false,
      resolveConnection
    } = args;

    await Promise.all(
      Object.entries(HOST_COMMAND_ACTIONS).map(([optionKey, actions]) =>
        $assertMaySetHostCommand(
          actions,
          nextSyncOptions?.[optionKey],
          storedSyncOptions?.[optionKey],
          pkiSync,
          subscriberName,
          actor,
          isExecutionTargetChanging
        )
      )
    );

    const hasCommand = Object.keys(HOST_COMMAND_ACTIONS).some((optionKey) => nextSyncOptions?.[optionKey]);
    if (!hasCommand) return;

    $assertHostCommandsAreSupported(destination, nextSyncOptions, await resolveConnection());
  };

  const $certificateReadFilters = async (projectId: string, applicationId: string, actor: OrgServiceActor) => {
    const { permission: resourcePermission } = await permissionService.getResourcePermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId: applicationId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    if (resourcePermission.can(ResourcePermissionCertificateActions.Read, ResourcePermissionSub.Certificates)) {
      return undefined;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    return getProcessedPermissionRules(
      permission,
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );
  };

  const $assertActorCanReadFilterMatches = async (
    projectId: string,
    applicationId: string | null | undefined,
    filters: TPkiSyncFilters | null | undefined,
    actor: OrgServiceActor
  ) => {
    if (!applicationId || !hasAnyPkiSyncFilter(filters)) return;

    const permissionFilters = await $certificateReadFilters(projectId, applicationId, actor);
    if (!permissionFilters) return;

    const growingKinds = PKI_SYNC_FILTER_KINDS.filter(
      (kind) => kind !== "certificateOrderIds" && filters?.[kind] !== undefined
    );

    if (growingKinds.length > 0) {
      throw new ForbiddenRequestError({
        message:
          "Certificate profile and metadata filters also take certificates issued later, so they need access to read every certificate in this Application. Name the certificates instead, or ask for broader access."
      });
    }

    const scope = { projectId, applicationId };
    const [matchedCount, readableCount] = await Promise.all([
      certificateDAL.countCertificatesMatchingSyncFilters(filters, scope),
      certificateDAL.countCertificatesMatchingSyncFilters(filters, scope, permissionFilters)
    ]);

    if (matchedCount !== readableCount) {
      throw new ForbiddenRequestError({
        message: `These filters match ${matchedCount - readableCount} certificate${
          matchedCount - readableCount === 1 ? "" : "s"
        } you do not have access to read. Narrow the filters to the certificates you can access.`
      });
    }
  };

  const $assertActorCanReadCertificates = async (
    certificateIds: string[],
    projectId: string,
    applicationId: string | null | undefined,
    actor: OrgServiceActor
  ) => {
    if (!applicationId || certificateIds.length === 0) return;

    const permissionFilters = await $certificateReadFilters(projectId, applicationId, actor);
    if (!permissionFilters) return;

    const readableIds = new Set(
      await certificateDAL.findReadableCertificateIds(certificateIds, projectId, permissionFilters)
    );
    const hiddenIds = certificateIds.filter((id) => !readableIds.has(id));

    if (hiddenIds.length > 0) {
      throw new NotFoundError({ message: `Certificates not found: ${hiddenIds.join(", ")}` });
    }
  };

  const $findApplicationCertificates = async (
    certificateIds: string[],
    expectedProjectId: string,
    expectedApplicationId: string | null | undefined
  ) => {
    const certificates = await certificateDAL.find({ projectId: expectedProjectId, $in: { id: certificateIds } });

    const foundIds = new Set(certificates.map((cert) => cert.id));
    const missingIds = certificateIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundError({ message: `Certificates not found: ${missingIds.join(", ")}` });
    }

    if (expectedApplicationId) {
      const outsideApplication = certificates.filter((cert) => cert.applicationId !== expectedApplicationId);
      if (outsideApplication.length > 0) {
        throw new NotFoundError({
          message: `Certificates not found in this Application: ${outsideApplication.map((cert) => cert.id).join(", ")}`
        });
      }
    }

    return certificates;
  };

  const $resolveCertificateOrderIds = async (
    certificateIds: string[],
    expectedProjectId: string,
    expectedApplicationId: string | null | undefined,
    { requireSyncable, actor }: { requireSyncable: boolean; actor?: OrgServiceActor }
  ): Promise<string[]> => {
    if (certificateIds.length === 0) return [];

    const certificates = await $findApplicationCertificates(certificateIds, expectedProjectId, expectedApplicationId);

    if (actor) {
      await $assertActorCanReadCertificates(certificateIds, expectedProjectId, expectedApplicationId, actor);
    }

    const orderIds = [...new Set(certificates.map((cert) => cert.orderId))];

    if (requireSyncable && expectedApplicationId) {
      const syncable = await certificateDAL.findCertificatesMatchingSyncFilters(
        { certificateOrderIds: orderIds },
        { projectId: expectedProjectId, applicationId: expectedApplicationId }
      );
      const liveOrderIds = new Set(syncable.map((cert) => cert.orderId));
      const dead = certificates.filter((cert) => !liveOrderIds.has(cert.orderId));

      if (dead.length > 0) {
        throw new BadRequestError({
          message: `Certificate orders with no active certificate cannot be synced: ${dead
            .map((cert) => `'${cert.commonName}'`)
            .join(", ")}`
        });
      }
    }

    return orderIds;
  };

  const validateCertificatesForSync = async (
    certificateIds: string[],
    expectedProjectId: string,
    expectedApplicationId: string | null | undefined,
    actor?: OrgServiceActor
  ) => {
    if (certificateIds.length === 0) return [];

    const certificates = await $findApplicationCertificates(certificateIds, expectedProjectId, expectedApplicationId);

    if (actor) {
      await $assertActorCanReadCertificates(certificateIds, expectedProjectId, expectedApplicationId, actor);
    }

    const now = new Date();
    const ineligibleReasons = certificates
      .filter(
        (cert) => cert.status !== CertStatus.ACTIVE || cert.notAfter <= now || Boolean(cert.renewedByCertificateId)
      )
      .map((cert) => {
        if (cert.status === CertStatus.REVOKED) return `'${cert.commonName}' is revoked`;
        if (cert.renewedByCertificateId)
          return `'${cert.commonName}' has been renewed, so link the certificate that replaced it instead`;
        if (cert.notAfter <= now) return `'${cert.commonName}' has expired`;
        return `'${cert.commonName}' is not active`;
      });
    if (ineligibleReasons.length > 0) {
      throw new BadRequestError({
        message: `Only active certificates can be linked to a PKI sync: ${ineligibleReasons.join("; ")}`
      });
    }

    return certificates;
  };

  const $assertFilterProfilesInApplication = async (
    filters: TPkiSyncFilters | null | undefined,
    applicationId: string | null | undefined
  ) => {
    const profileIds = filters?.profileIds;
    if (!profileIds?.length || !applicationId) return;

    const applicationProfiles = await pkiApplicationProfileDAL.findByApplicationId(applicationId);
    const profileIdsInApplication = new Set(applicationProfiles.map(({ profileId }) => profileId));
    const profileIdsOutsideApplication = profileIds.filter((id) => !profileIdsInApplication.has(id));
    if (profileIdsOutsideApplication.length > 0) {
      throw new NotFoundError({
        message: `Certificate profiles not found in this Application: ${profileIdsOutsideApplication.join(", ")}`
      });
    }
  };

  const $withFilterLock = <T>(syncId: string, run: () => Promise<T>): Promise<T> =>
    withPkiSyncFilterLock(keyStore, syncId, run);

  const $reconcileFilters = async (
    pkiSync: TPkiSyncReconcileTarget,
    filters: TPkiSyncFilters | null | undefined,
    opts: { auditLogInfo?: AuditLogInfo; writeFilters?: (tx: Knex) => Promise<void> } = {}
  ): Promise<{ linked: TPkiSyncCertificateRef[]; unlinked: TPkiSyncCertificateRef[] }> => {
    const diff = await computePkiSyncCertificateDiff(pkiSync, filters, { certificateDAL, certificateSyncDAL });
    assertPkiSyncCanHoldMatchedCertificates(pkiSync, diff.matched.length);
    return applyPkiSyncCertificateDiff(
      pkiSync,
      diff,
      { certificateDAL, certificateSyncDAL, pkiSyncQueue, auditLogService, pkiApplicationDAL },
      opts.auditLogInfo,
      opts.writeFilters
    );
  };

  const createPkiSync = async (
    {
      name,
      description,
      destination,
      isAutoSyncEnabled = true,
      destinationConfig,
      syncOptions = {},
      subscriberId,
      connectionId,
      projectId,
      applicationId,
      certificateIds,
      filters,
      credentials,
      auditLogInfo
    }: TCreatePkiSyncDTO,
    actor: OrgServiceActor
  ): Promise<TPkiSync> => {
    if (!applicationId) {
      throw new BadRequestError({
        message:
          "Certificate Syncs must be created inside an Application. Open the Application's Certificate Syncs tab and click Add Sync."
      });
    }

    await assertPkiSyncLicense(licenseService, actor.orgId);

    let subscriber;
    if (subscriberId) {
      subscriber = await pkiSubscriberDAL.findById(subscriberId);
      if (!subscriber || subscriber.projectId !== projectId) {
        throw new NotFoundError({ message: "PKI subscriber not found" });
      }
    }

    const allowedByResource = await $resourceFallback(
      ResourcePermissionPkiSyncActions.Create,
      projectId,
      applicationId,
      actor
    );
    if (!allowedByResource) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    const destinationApps = getPkiSyncConnectionApps(destination);

    // Validates permission to connect and app is valid for sync destination
    const connection = await appConnectionService.validateAppConnectionUsageById(
      destinationApps,
      { connectionId, projectId },
      actor
    );

    assertTargetHostMatchesConnection({ destination, connection, destinationConfig });

    await $assertMaySetTargetHost({
      nextConfig: destinationConfig,
      currentConfig: undefined,
      pkiSync: { projectId, applicationId, name },
      subscriberName: undefined,
      actor
    });

    const providerCapabilities = getPkiSyncProviderCapabilities(destination);
    const resolvedSyncOptions = normalizeNewHealthCheckCommand(
      normalizeNewPostSyncCommand({
        ...providerCapabilities,
        ...syncOptions
      })
    );

    await $assertHostCommandWrite({
      destination,
      nextSyncOptions: resolvedSyncOptions,
      storedSyncOptions: undefined,
      pkiSync: { projectId, applicationId, name },
      subscriberName: undefined,
      actor,
      resolveConnection: async () => connection
    });

    if (filters !== undefined && certificateIds !== undefined) {
      throw new BadRequestError({
        message: "Pass certificates as either 'certificateIds' or the 'certificateOrderIds' filter, not both."
      });
    }

    const resolvedFilters =
      filters !== undefined
        ? filters
        : {
            certificateOrderIds: await $resolveCertificateOrderIds(certificateIds ?? [], projectId, applicationId, {
              requireSyncable: true,
              actor
            })
          };

    await $assertFilterProfilesInApplication(resolvedFilters, applicationId);
    await $assertActorCanReadFilterMatches(projectId, applicationId, resolvedFilters, actor);
    assertFiltersCannotExceedCertificateCap(destination, resolvedSyncOptions, destinationConfig, resolvedFilters);

    if (hasAnyPkiSyncFilter(resolvedFilters)) {
      const matched = await certificateDAL.findCertificatesMatchingSyncFilters(resolvedFilters, {
        projectId,
        applicationId
      });
      assertPkiSyncCanHoldMatchedCertificates(
        { destination, destinationConfig, syncOptions: resolvedSyncOptions } as TPkiSyncReconcileTarget,
        matched.length
      );
    }

    await $assertTargetHostReachable({ destination, connection, destinationConfig });

    const encryptedCredentials = credentials?.exportPassword
      ? await encryptPkiSyncCredentials({ orgId: actor.orgId, projectId, credentials, kmsService })
      : undefined;

    try {
      const pkiSync = await pkiSyncDAL.create({
        name,
        description,
        destination,
        isAutoSyncEnabled,
        destinationConfig,
        syncOptions: resolvedSyncOptions,
        encryptedCredentials,
        subscriberId,
        connectionId,
        projectId,
        applicationId: applicationId ?? null,
        filters: resolvedFilters ?? null,
        ...(isAutoSyncEnabled && { syncStatus: PkiSyncStatus.Pending })
      });

      const { linked: linkedCertificates } = await $reconcileFilters(
        pkiSync as TPkiSyncReconcileTarget,
        resolvedFilters,
        {
          auditLogInfo
        }
      );

      if (pkiSync.isAutoSyncEnabled && linkedCertificates.length === 0) {
        await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSync.id });
      }

      return pkiSync as TPkiSync;
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === "23505") {
        throw new BadRequestError({
          message: `A PKI Sync with the name "${name}" already exists for the project with ID "${projectId}"`
        });
      }
      throw err;
    }
  };

  const updatePkiSync = async (
    {
      id,
      applicationId,
      name,
      description,
      isAutoSyncEnabled,
      destinationConfig,
      syncOptions,
      subscriberId,
      connectionId,
      filters,
      credentials,
      auditLogInfo
    }: Omit<TUpdatePkiSyncDTO, "projectId">,
    actor: OrgServiceActor
  ): Promise<TPkiSync> => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });
    if (applicationId && pkiSync.applicationId !== applicationId) {
      throw new NotFoundError({
        message: `PKI sync with id "${id}" is not scoped to application "${applicationId}".`
      });
    }

    let currentSubscriber;
    if (pkiSync.subscriberId) {
      currentSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    if (pkiSync.applicationId) {
      const editAllowedByResource = await $resourceFallback(
        ResourcePermissionPkiSyncActions.Edit,
        pkiSync.projectId,
        pkiSync.applicationId,
        actor
      );
      if (!editAllowedByResource) {
        throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
      }
    } else {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.CertificateManager,
        projectId: pkiSync.projectId
      });
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPkiSyncActions.Edit,
        subject(ProjectPermissionSub.PkiSyncs, {
          subscriberName: currentSubscriber?.name,
          name: pkiSync.name
        })
      );
    }

    if (name && name !== pkiSync.name) {
      const existingPkiSync = await pkiSyncDAL.findByNameAndProjectId(name, pkiSync.projectId);
      if (existingPkiSync) {
        throw new BadRequestError({ message: "PKI sync with this name already exists" });
      }
    }

    if (subscriberId) {
      const subscriber = await pkiSubscriberDAL.findById(subscriberId);
      if (!subscriber || subscriber.projectId !== pkiSync.projectId) {
        throw new NotFoundError({ message: "PKI subscriber not found" });
      }
    }

    // main's per-destination merge hook; a passthrough for every destination except GCP
    const resolvedDestinationConfig = destinationConfig
      ? resolvePkiSyncDestinationConfigUpdate(
          pkiSync.destination as PkiSync,
          pkiSync.destinationConfig ?? {},
          destinationConfig
        )
      : undefined;

    // Swapping the connection re-runs the App Connection Connect check, as it always has. Editing the
    // sync's own fields must not: the delivery target is gated by SetTargetHost below, and the sync row
    // already carries enough of its current connection to validate against.
    let resolvedConnection: Awaited<ReturnType<typeof appConnectionService.validateAppConnectionUsageById>> | undefined;
    const resolveConnection = async () => {
      resolvedConnection ??= await appConnectionService.validateAppConnectionUsageById(
        getPkiSyncConnectionApps(pkiSync.destination),
        { connectionId: connectionId ?? pkiSync.connectionId, projectId: pkiSync.projectId },
        actor
      );
      return resolvedConnection;
    };

    const isConnectionChanging = Boolean(connectionId && connectionId !== pkiSync.connectionId);

    // Compared structurally, not by JSON text: the stored value comes back from a jsonb column with its
    // keys reordered, so stringify never matches once the config has more than one key.
    const isDestinationConfigChanging =
      Boolean(destinationConfig) && !deepEqual(resolvedDestinationConfig, pkiSync.destinationConfig);

    const effectiveDestinationConfig = (resolvedDestinationConfig ?? pkiSync.destinationConfig) as
      | (Record<string, unknown> & { host?: string })
      | undefined;

    if (isConnectionChanging || destinationConfig !== undefined) {
      assertTargetHostMatchesConnection({
        destination: pkiSync.destination,
        connection: isConnectionChanging
          ? await resolveConnection()
          : { ...pkiSync.connection, app: pkiSync.connection.app as AppConnection },
        destinationConfig: effectiveDestinationConfig
      });
    }

    await $assertMaySetTargetHost({
      nextConfig: effectiveDestinationConfig,
      currentConfig: pkiSync.destinationConfig as Record<string, unknown> | undefined,
      pkiSync,
      subscriberName: currentSubscriber?.name,
      actor,
      isRetargetedByConnection:
        isConnectionChanging &&
        (pkiSync.connection.app === AppConnection.LDAP || (await resolveConnection()).app === AppConnection.LDAP)
    });

    const storedSyncOptions = pkiSync.syncOptions as Record<string, unknown> | undefined;
    let resolvedSyncOptions = syncOptions;
    if (syncOptions) {
      const providerCapabilities = getPkiSyncProviderCapabilities(pkiSync.destination);

      if (syncOptions.canImportCertificates && !providerCapabilities.canImportCertificates) {
        throw new BadRequestError({
          message: `Certificate import is not supported for ${PKI_SYNC_NAME_MAP[pkiSync.destination]} PKI sync destination`
        });
      }

      if (syncOptions.canRemoveCertificates && !providerCapabilities.canRemoveCertificates) {
        throw new BadRequestError({
          message: `Certificate removal cannot be enabled for ${PKI_SYNC_NAME_MAP[pkiSync.destination]} PKI sync destination`
        });
      }

      resolvedSyncOptions = applyHealthCheckCommandUpdate(
        applyPostSyncCommandUpdate({ ...providerCapabilities, ...syncOptions }, storedSyncOptions?.postSyncCommand),
        storedSyncOptions?.healthCheckCommand
      );
    }

    if (isConnectionChanging || isDestinationConfigChanging) {
      await $assertTargetHostReachable({
        destination: pkiSync.destination,
        connection: isConnectionChanging
          ? await resolveConnection()
          : { id: pkiSync.connectionId, app: pkiSync.connection.app as AppConnection },
        destinationConfig: effectiveDestinationConfig
      });
    }

    const effectiveSyncOptions = (resolvedSyncOptions ?? pkiSync.syncOptions) as Record<string, unknown> | undefined;

    await $assertFilterProfilesInApplication(filters, pkiSync.applicationId);
    await $assertActorCanReadFilterMatches(pkiSync.projectId, pkiSync.applicationId, filters, actor);

    await $assertHostCommandWrite({
      destination: pkiSync.destination,
      nextSyncOptions: effectiveSyncOptions,
      storedSyncOptions,
      pkiSync,
      subscriberName: currentSubscriber?.name,
      actor,
      isExecutionTargetChanging: isConnectionChanging || isDestinationConfigChanging,
      resolveConnection
    });

    if (syncOptions || destinationConfig) {
      const existingCount = (await certificateSyncDAL.findByPkiSyncId(id)).length;
      assertPkiSyncCertificateCapsAllowCount(
        pkiSync.destination,
        effectiveSyncOptions,
        effectiveDestinationConfig,
        existingCount
      );
      assertFiltersCannotExceedCertificateCap(
        pkiSync.destination,
        effectiveSyncOptions,
        effectiveDestinationConfig,
        filters === undefined ? (pkiSync.filters as TPkiSyncFilters | null) : filters
      );
    }

    if (
      effectiveSyncOptions?.exportFormat === PkiSyncExportFormat.Pkcs12 &&
      !credentials?.exportPassword &&
      !pkiSync.encryptedCredentials
    ) {
      throw new BadRequestError({ message: "A password is required when the export format is PKCS#12" });
    }

    const encryptedCredentials = credentials?.exportPassword
      ? await encryptPkiSyncCredentials({ orgId: actor.orgId, projectId: pkiSync.projectId, credentials, kmsService })
      : undefined;

    const isHealthCheckBeingCleared =
      resolvedSyncOptions !== undefined &&
      !getHealthCheckCommand(resolvedSyncOptions) &&
      Boolean(getHealthCheckCommand(storedSyncOptions));

    const update = {
      name,
      description,
      isAutoSyncEnabled,
      destinationConfig: resolvedDestinationConfig,
      syncOptions: resolvedSyncOptions,
      subscriberId,
      connectionId,
      ...(filters === undefined ? {} : { filters }),
      ...(encryptedCredentials ? { encryptedCredentials } : {}),
      ...(isHealthCheckBeingCleared
        ? { lastHealthCheckRanAt: null, lastHealthCheckStatus: null, lastHealthCheckMessage: null }
        : {})
    };

    if (Object.values(update).every((value) => value === undefined)) {
      return pkiSync as TPkiSync;
    }

    const storedFilters = pkiSync.filters as TPkiSyncFilters | null;
    const areFiltersChanging =
      filters !== undefined && JSON.stringify(filters ?? null) !== JSON.stringify(storedFilters ?? null);

    if (areFiltersChanging) $assertSyncAcceptsFilters(pkiSync);

    if (!areFiltersChanging) {
      const written = await pkiSyncDAL.updateById(id, update);
      return written as TPkiSync;
    }

    const { updatedPkiSync } = await $withFilterLock(id, async () => {
      const current = await pkiSyncDAL.findById(id, pkiSyncDAL.primaryNode());
      if (!current) throw new NotFoundError({ message: `Could not find PKI sync with ID ${id}` });

      const changedFields = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
      const target = { ...current, ...changedFields, syncOptions: effectiveSyncOptions } as TPkiSyncReconcileTarget;
      assertFiltersCannotExceedCertificateCap(
        current.destination as PkiSync,
        effectiveSyncOptions,
        effectiveDestinationConfig,
        filters
      );

      await $reconcileFilters(target, filters, {
        auditLogInfo,
        writeFilters: async (tx) => {
          await pkiSyncDAL.updateById(id, update, tx);
        }
      });

      const written = await pkiSyncDAL.findById(id, pkiSyncDAL.primaryNode());

      return { updatedPkiSync: written ?? current };
    });

    return updatedPkiSync as TPkiSync;
  };

  const deletePkiSync = async (
    { id, applicationId }: Omit<TDeletePkiSyncDTO, "auditLogInfo" | "projectId">,
    actor: OrgServiceActor
  ) => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });
    if (applicationId && pkiSync.applicationId !== applicationId) {
      throw new NotFoundError({
        message: `PKI sync with id "${id}" is not scoped to application "${applicationId}".`
      });
    }

    let pkiSyncSubscriber;
    if (pkiSync.subscriberId) {
      pkiSyncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    if (pkiSync.applicationId) {
      const deleteAllowedByResource = await $resourceFallback(
        ResourcePermissionPkiSyncActions.Delete,
        pkiSync.projectId,
        pkiSync.applicationId,
        actor
      );
      if (!deleteAllowedByResource) {
        throw new ForbiddenRequestError({
          message: "You do not have permission to delete this Application's certificate sync"
        });
      }
    } else {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.CertificateManager,
        projectId: pkiSync.projectId
      });
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPkiSyncActions.Delete,
        subject(ProjectPermissionSub.PkiSyncs, {
          subscriberName: pkiSyncSubscriber?.name,
          name: pkiSync.name
        })
      );
    }

    const deleted = await pkiSyncDAL.deleteById(id);
    return { ...deleted, applicationName: pkiSync.applicationName };
  };

  const listPkiSyncsByProjectId = async (
    { projectId, certificateId, applicationId, destination }: TListPkiSyncsByProjectId,
    actor: OrgServiceActor
  ): Promise<TPkiSync[]> => {
    let processedRules: ReturnType<typeof getProcessedPermissionRules> | undefined;

    if (applicationId) {
      const allowedByResource = await $resourceFallback(
        ResourcePermissionPkiSyncActions.Read,
        projectId,
        applicationId,
        actor
      );
      if (!allowedByResource) {
        throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
      }
    } else {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.CertificateManager,
        projectId
      });
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPkiSyncActions.Read,
        ProjectPermissionSub.PkiSyncs
      );
      processedRules = getProcessedPermissionRules(
        permission,
        ProjectPermissionPkiSyncActions.Read,
        ProjectPermissionSub.PkiSyncs
      );
    }

    const pkiSyncsWithSubscribers = await pkiSyncDAL.findByProjectIdWithSubscribers(
      projectId,
      processedRules,
      undefined,
      {
        ...(applicationId !== undefined ? { applicationId } : {}),
        ...(destination ? { destination } : {})
      }
    );

    if (certificateId) {
      const syncsWithCertificateInfo = await Promise.all(
        pkiSyncsWithSubscribers.map(async (sync) => {
          try {
            const certificateSyncs = await certificateSyncDAL.findByPkiSyncId(sync.id);
            const hasCertificate = certificateSyncs.some((certSync) => certSync.certificateId === certificateId);

            return {
              ...sync,
              hasCertificate
            };
          } catch (error) {
            return {
              ...sync,
              hasCertificate: false
            };
          }
        })
      );

      return syncsWithCertificateInfo as TPkiSync[];
    }

    return pkiSyncsWithSubscribers as TPkiSync[];
  };

  const findPkiSyncById = async ({ id, projectId, applicationId }: TFindPkiSyncByIdDTO, actor: OrgServiceActor) => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (
      !pkiSync ||
      (projectId && pkiSync.projectId !== projectId) ||
      (applicationId && pkiSync.applicationId !== applicationId)
    ) {
      throw new NotFoundError({
        message: `Could not find PKI Sync with ID "${id}"`
      });
    }

    let findSubscriber;
    if (pkiSync.subscriberId) {
      findSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    if (pkiSync.applicationId) {
      const allowedByResource = await $resourceFallback(
        ResourcePermissionPkiSyncActions.Read,
        pkiSync.projectId,
        pkiSync.applicationId,
        actor
      );
      if (!allowedByResource) {
        throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
      }
    } else {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.CertificateManager,
        projectId: pkiSync.projectId
      });
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPkiSyncActions.Read,
        subject(ProjectPermissionSub.PkiSyncs, {
          subscriberName: findSubscriber?.name,
          name: pkiSync.name
        })
      );
    }

    const result = {
      ...pkiSync,
      subscriber: findSubscriber ? { id: findSubscriber.id, name: findSubscriber.name } : null
    } as TPkiSync;

    return result;
  };

  const triggerPkiSyncSyncCertificatesById = async (
    { id }: Omit<TTriggerPkiSyncSyncCertificatesByIdDTO, "auditLogInfo" | "projectId">,
    actor: OrgServiceActor
  ) => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    let syncSubscriber;
    if (pkiSync.subscriberId) {
      syncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.SyncCertificates,
      ResourcePermissionPkiSyncActions.SyncCertificates,
      pkiSync,
      syncSubscriber?.name,
      actor
    );

    await pkiSyncDAL.updateById(id, { syncStatus: PkiSyncStatus.Pending, lastSyncMessage: null });
    await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: id });

    return { message: "PKI sync job added to queue successfully" };
  };

  const $resolveHealthCheckTestTarget = async (args: {
    projectId: string;
    applicationId?: string;
    syncId?: string;
  }) => {
    if (args.syncId) {
      const pkiSync = await pkiSyncDAL.findById(args.syncId);
      if (!pkiSync || pkiSync.projectId !== args.projectId) {
        throw new NotFoundError({ message: `PKI sync with id "${args.syncId}" not found` });
      }

      return {
        projectId: pkiSync.projectId,
        applicationId: pkiSync.applicationId,
        name: pkiSync.name,
        destinationConfig: pkiSync.destinationConfig as Record<string, unknown> | undefined
      };
    }

    if (!args.applicationId) {
      throw new BadRequestError({
        message:
          "Provide the Application the sync belongs to, or the id of the sync being edited, so the command can be authorized."
      });
    }

    return { projectId: args.projectId, applicationId: args.applicationId, name: "", destinationConfig: undefined };
  };

  const testPkiSyncHealthCheckCommand = async (
    args: {
      destination: PkiSync;
      connectionId: string;
      applicationId?: string;
      syncId?: string;
      certificateIds?: string[];
      filters?: TPkiSyncFilters | null;
      destinationConfig: Record<string, unknown>;
      syncOptions: Record<string, unknown>;
      projectId: string;
    },
    actor: OrgServiceActor,
    auditLogInfo?: AuditLogInfo
  ) => {
    const testTarget = await $resolveHealthCheckTestTarget(args);

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.SetHealthCheckCommand,
      ResourcePermissionPkiSyncActions.SetHealthCheckCommand,
      testTarget,
      undefined,
      actor
    );

    const command = getHealthCheckCommand(args.syncOptions);
    if (!command) {
      throw new BadRequestError({ message: "Enter a health check command to test." });
    }

    if (args.certificateIds?.length) {
      await validateCertificatesForSync(args.certificateIds, args.projectId, args.applicationId, actor);
    }

    await $assertFilterProfilesInApplication(args.filters, args.applicationId);
    await $assertActorCanReadFilterMatches(args.projectId, args.applicationId, args.filters, actor);

    const connection = await appConnectionService.validateAppConnectionUsageById(
      getPkiSyncConnectionApps(args.destination),
      { connectionId: args.connectionId, projectId: args.projectId },
      actor
    );

    assertTargetHostMatchesConnection({
      destination: args.destination,
      connection,
      destinationConfig: args.destinationConfig
    });

    await $assertMaySetTargetHost({
      nextConfig: args.destinationConfig,
      currentConfig: testTarget.destinationConfig,
      pkiSync: testTarget,
      subscriberName: undefined,
      actor
    });

    $assertHostCommandsAreSupported(args.destination, args.syncOptions, connection);

    const result = await pkiSyncHealthCheckQueue.testHealthCheckCommand({
      destination: args.destination,
      connectionId: args.connectionId,
      syncId: args.syncId,
      applicationId: args.applicationId,
      certificateIds: args.certificateIds,
      filters: args.filters,
      projectId: args.projectId,
      destinationConfig: args.destinationConfig,
      syncOptions: args.syncOptions
    });

    await auditLogService.createAuditLog({
      ...(auditLogInfo ?? { actor: { type: ActorType.PLATFORM, metadata: {} } }),
      projectId: args.projectId,
      event: {
        type: EventType.PKI_SYNC_TEST_HEALTH_CHECK,
        metadata: {
          connectionId: args.connectionId,
          connectionName: connection.name,
          destination: args.destination,
          command,
          result
        }
      }
    });

    return toHealthCheckApiResult(result);
  };

  const runPkiSyncHealthCheckById = async (
    { id }: { id: string },
    actor: OrgServiceActor,
    auditLogInfo?: AuditLogInfo
  ) => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.SyncCertificates,
      ResourcePermissionPkiSyncActions.SyncCertificates,
      pkiSync,
      undefined,
      actor
    );

    if (!getHealthCheckCommand(pkiSync.syncOptions)) {
      throw new BadRequestError({
        message: `PKI sync '${pkiSync.name}' has no health check configured. Add one under the sync's Commands step first.`
      });
    }

    return toHealthCheckApiResult(await pkiSyncHealthCheckQueue.runHealthCheckNow(id, auditLogInfo));
  };

  const triggerPkiSyncImportCertificatesById = async (
    { id }: Omit<TTriggerPkiSyncImportCertificatesByIdDTO, "auditLogInfo" | "projectId">,
    actor: OrgServiceActor
  ) => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    // Check if the PKI sync destination supports importing certificates
    const syncOptions = listPkiSyncOptions().find((option) => option.destination === pkiSync.destination);
    if (!syncOptions?.canImportCertificates) {
      throw new BadRequestError({
        message: `Certificate import is not supported for ${pkiSync.destination} PKI sync destination`
      });
    }

    let importSubscriber;
    if (pkiSync.subscriberId) {
      importSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.ImportCertificates,
      ResourcePermissionPkiSyncActions.ImportCertificates,
      pkiSync,
      importSubscriber?.name,
      actor
    );

    await pkiSyncQueue.queuePkiSyncImportCertificatesById({ syncId: id });

    return { message: "PKI sync import job added to queue successfully" };
  };

  const triggerPkiSyncRemoveCertificatesById = async (
    { id }: Omit<TTriggerPkiSyncRemoveCertificatesByIdDTO, "auditLogInfo" | "projectId">,
    actor: OrgServiceActor
  ) => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    // Check if the PKI sync destination supports removing certificates
    const syncOptions = listPkiSyncOptions().find((option) => option.destination === pkiSync.destination);
    if (!syncOptions?.canRemoveCertificates) {
      throw new BadRequestError({
        message: `Certificate removal is not supported for ${pkiSync.destination} PKI sync destination`
      });
    }

    let removeSubscriber;
    if (pkiSync.subscriberId) {
      removeSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.RemoveCertificates,
      ResourcePermissionPkiSyncActions.RemoveCertificates,
      pkiSync,
      removeSubscriber?.name,
      actor
    );

    await pkiSyncQueue.queuePkiSyncRemoveCertificatesById({ syncId: id });

    return { message: "PKI sync remove job added to queue successfully" };
  };

  const searchPkiSyncCertificateOrders = async (
    { applicationId, pkiSyncId, certificateOrderIds }: TSearchPkiSyncCertificateOrdersDTO,
    actor: OrgServiceActor
  ): Promise<{ orders: TPkiSyncCertificateOrder[] }> => {
    let scope: { projectId: string; applicationId: string };

    if (pkiSyncId) {
      const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
      if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });
      if (!pkiSync.applicationId) return { orders: [] };

      const allowedByResource = await $resourceFallback(
        ResourcePermissionPkiSyncActions.Read,
        pkiSync.projectId,
        pkiSync.applicationId,
        actor
      );
      if (!allowedByResource) {
        throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
      }

      scope = { projectId: pkiSync.projectId, applicationId: pkiSync.applicationId };
    } else {
      if (!applicationId) {
        throw new BadRequestError({ message: "Provide either pkiSyncId or applicationId." });
      }

      const application = await pkiApplicationDAL.findById(applicationId);
      if (!application) throw new NotFoundError({ message: "Application not found" });

      const allowedByResource = await $resourceFallback(
        ResourcePermissionPkiSyncActions.Read,
        application.projectId,
        applicationId,
        actor
      );
      if (!allowedByResource) {
        throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
      }

      scope = { projectId: application.projectId, applicationId };
    }

    const permissionFilters = await $certificateReadFilters(scope.projectId, scope.applicationId, actor);
    const certificates = await certificateDAL.findLatestCertificatesByOrderIds(
      certificateOrderIds,
      scope,
      permissionFilters
    );

    return {
      orders: certificates.map(({ orderId, commonName, altNames }) => ({
        certificateOrderId: orderId,
        commonName,
        altNames
      }))
    };
  };

  const previewPkiSyncFilters = async (
    {
      applicationId,
      pkiSyncId,
      filters,
      offset = 0,
      limit = PKI_SYNC_PREVIEW_PAGE_SIZE
    }: Omit<TPreviewPkiSyncFiltersDTO, "projectId">,
    actor: OrgServiceActor
  ): Promise<TPkiSyncFilterPreview> => {
    if (pkiSyncId) {
      const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
      if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

      let pkiSyncSubscriber;
      if (pkiSync.subscriberId) {
        pkiSyncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
      }

      await $assertSyncAction(
        ProjectPermissionPkiSyncActions.Edit,
        ResourcePermissionPkiSyncActions.Edit,
        pkiSync,
        pkiSyncSubscriber?.name,
        actor
      );

      await $assertFilterProfilesInApplication(filters, pkiSync.applicationId);

      const diff = await computePkiSyncCertificateDiff(pkiSync as TPkiSyncReconcileTarget, filters, {
        certificateDAL,
        certificateSyncDAL
      });

      const canRemoveCertificates = Boolean(
        (pkiSync.syncOptions as { canRemoveCertificates?: boolean } | null)?.canRemoveCertificates
      );

      const permissionFilters = pkiSync.applicationId
        ? await $certificateReadFilters(pkiSync.projectId, pkiSync.applicationId, actor)
        : undefined;

      if (!permissionFilters) {
        return {
          matchedCount: diff.matched.length,
          certificates: diff.matched.slice(offset, offset + limit),
          toUnlink: diff.toUnlink,
          willRemoveFromDestination: canRemoveCertificates && diff.toUnlink.length > 0
        };
      }

      const scope = { projectId: pkiSync.projectId, applicationId: pkiSync.applicationId as string };

      const [matchedCount, certificates, readableUnlinkIds] = await Promise.all([
        certificateDAL.countCertificatesMatchingSyncFilters(filters, scope, permissionFilters),
        certificateDAL.findCertificatesMatchingSyncFilters(filters, scope, { permissionFilters, offset, limit }),
        certificateDAL.findReadableCertificateIds(
          diff.toUnlink.map((certificate) => certificate.id),
          pkiSync.projectId,
          permissionFilters
        )
      ]);

      const readableUnlinkIdSet = new Set(readableUnlinkIds);

      return {
        matchedCount,
        certificates,
        toUnlink: diff.toUnlink.filter((certificate) => readableUnlinkIdSet.has(certificate.id)),
        willRemoveFromDestination: canRemoveCertificates && diff.toUnlink.length > 0
      };
    }

    if (!applicationId) {
      throw new BadRequestError({ message: "Provide either pkiSyncId or applicationId." });
    }

    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application) throw new NotFoundError({ message: "Application not found" });

    const allowedByResource = await $resourceFallback(
      ResourcePermissionPkiSyncActions.Create,
      application.projectId,
      applicationId,
      actor
    );
    if (!allowedByResource) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    await $assertFilterProfilesInApplication(filters, applicationId);

    if (!hasAnyPkiSyncFilter(filters)) {
      return { matchedCount: 0, certificates: [], toUnlink: [], willRemoveFromDestination: false };
    }

    const scope = { projectId: application.projectId, applicationId };
    const permissionFilters = await $certificateReadFilters(application.projectId, applicationId, actor);

    const [matchedCount, certificates] = await Promise.all([
      certificateDAL.countCertificatesMatchingSyncFilters(filters, scope, permissionFilters),
      certificateDAL.findCertificatesMatchingSyncFilters(filters, scope, { permissionFilters, offset, limit })
    ]);

    return {
      matchedCount,
      certificates,
      toUnlink: [],
      willRemoveFromDestination: false
    };
  };

  const $assertCertificateOrderListIsTheOnlySyncFilter = (pkiSync: TPkiSyncRaw) => {
    $assertSyncAcceptsFilters(pkiSync);

    const filters = pkiSync.filters as TPkiSyncFilters | null;
    const otherFilterKinds = PKI_SYNC_FILTER_KINDS.filter(
      (kind) => kind !== "certificateOrderIds" && filters?.[kind] !== undefined
    );

    if (!filters || otherFilterKinds.length > 0) {
      throw new BadRequestError({
        message: !filters
          ? "This PKI sync has no filters, so certificates cannot be attached one at a time. Set its filters instead."
          : "This PKI sync selects certificates by another filter, so they cannot be attached one at a time. Edit its filters instead."
      });
    }

    return filters;
  };

  const $writeCertificateOrderIdsFilter = async (
    pkiSync: TPkiSyncRaw,
    nextOrderIds: (currentOrderIds: string[]) => string[],
    auditLogInfo?: AuditLogInfo
  ) => {
    return $withFilterLock(pkiSync.id, async () => {
      const current = await pkiSyncDAL.findById(pkiSync.id, pkiSyncDAL.primaryNode());
      if (!current) throw new NotFoundError({ message: `Could not find PKI sync with ID ${pkiSync.id}` });

      const stored = $assertCertificateOrderListIsTheOnlySyncFilter(current);
      const storedOrderIds = stored.certificateOrderIds ?? [];
      const requestedOrderIds = nextOrderIds(storedOrderIds);

      if (deepEqual(storedOrderIds, requestedOrderIds)) return { linked: [], unlinked: [] };

      const nextFilters = { ...stored, certificateOrderIds: requestedOrderIds };

      const applied = await $reconcileFilters(current as TPkiSyncReconcileTarget, nextFilters, {
        auditLogInfo,
        writeFilters: async (tx) => {
          await pkiSyncDAL.updateById(pkiSync.id, { filters: nextFilters }, tx);
        }
      });

      await auditLogService.createAuditLog({
        ...(auditLogInfo ?? { actor: { type: ActorType.PLATFORM, metadata: {} } }),
        projectId: current.projectId,
        event: {
          type: EventType.UPDATE_PKI_SYNC,
          metadata: {
            pkiSyncId: current.id,
            name: current.name,
            destination: current.destination,
            hasFilters: hasAnyPkiSyncFilter(nextFilters),
            ...(current.applicationId && { applicationId: current.applicationId })
          }
        }
      });

      return applied;
    });
  };

  const getPkiSyncOptions = () => {
    return listPkiSyncOptions();
  };

  const addCertificatesToPkiSync = async (
    { pkiSyncId, certificateIds, auditLogInfo }: Omit<TAddCertificatesToPkiSyncDTO, "projectId">,
    actor: OrgServiceActor
  ): Promise<{ addedCertificates: TCertificateSyncs[] }> => {
    const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    let pkiSyncSubscriber;
    if (pkiSync.subscriberId) {
      pkiSyncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.Edit,
      ResourcePermissionPkiSyncActions.Edit,
      pkiSync,
      pkiSyncSubscriber?.name,
      actor
    );

    $assertCertificateOrderListIsTheOnlySyncFilter(pkiSync);
    const requestedOrderIds = await $resolveCertificateOrderIds(
      certificateIds,
      pkiSync.projectId,
      pkiSync.applicationId,
      { requireSyncable: true, actor }
    );

    const { linked } = await $writeCertificateOrderIdsFilter(
      pkiSync,
      (currentOrderIds) => [...currentOrderIds, ...requestedOrderIds.filter((id) => !currentOrderIds.includes(id))],
      auditLogInfo
    );

    const linkedIds = new Set(linked.map(({ id }) => id));
    const addedCertificates = linked.length
      ? (await certificateSyncDAL.findByPkiSyncId(pkiSyncId)).filter(
          (record) => record.certificateId && linkedIds.has(record.certificateId)
        )
      : [];

    return { addedCertificates };
  };

  const removeCertificatesFromPkiSync = async (
    { pkiSyncId, certificateIds, auditLogInfo }: Omit<TRemoveCertificatesFromPkiSyncDTO, "projectId">,
    actor: OrgServiceActor
  ): Promise<{ removedCount: number }> => {
    const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    let pkiSyncSubscriber;
    if (pkiSync.subscriberId) {
      pkiSyncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.Edit,
      ResourcePermissionPkiSyncActions.Edit,
      pkiSync,
      pkiSyncSubscriber?.name,
      actor
    );

    $assertCertificateOrderListIsTheOnlySyncFilter(pkiSync);
    const removalSet = new Set(
      await $resolveCertificateOrderIds(certificateIds, pkiSync.projectId, pkiSync.applicationId, {
        requireSyncable: false
      })
    );

    const { unlinked } = await $writeCertificateOrderIdsFilter(
      pkiSync,
      (currentOrderIds) => currentOrderIds.filter((id) => !removalSet.has(id)),
      auditLogInfo
    );

    return { removedCount: unlinked.length };
  };

  const listPkiSyncCertificates = async (
    { pkiSyncId, offset = 0, limit = 20 }: Omit<TListPkiSyncCertificatesDTO, "projectId">,
    actor: OrgServiceActor
  ): Promise<{
    certificates: TPkiSyncCertificate[];
    totalCount: number;
    pkiSyncInfo: {
      projectId: string;
      destination: string;
      name: string;
      applicationId?: string | null;
      applicationName?: string | null;
    };
  }> => {
    const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    let pkiSyncSubscriber;
    if (pkiSync.subscriberId) {
      pkiSyncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.Read,
      ResourcePermissionPkiSyncActions.Read,
      pkiSync,
      pkiSyncSubscriber?.name,
      actor
    );

    const result = await certificateSyncDAL.findWithDetails({
      pkiSyncId,
      offset,
      limit
    });
    const { certificateDetails, totalCount } = result;

    const certificates = certificateDetails.map((detail) => ({
      id: detail.id,
      pkiSyncId: detail.pkiSyncId,
      certificateId: detail.certificateId,
      syncStatus: (detail.syncStatus as CertificateSyncStatus) || CertificateSyncStatus.Pending,
      lastSyncMessage: detail.lastSyncMessage || undefined,
      lastSyncedAt: detail.lastSyncedAt || undefined,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      certificateSerialNumber: detail.certificateSerialNumber || undefined,
      certificateCommonName: detail.certificateCommonName || undefined,
      certificateOrderId: detail.certificateOrderId || undefined,
      certificateAltNames: detail.certificateAltNames || undefined,
      certificateStatus: detail.certificateStatus || undefined,
      certificateNotBefore: detail.certificateNotBefore || undefined,
      certificateNotAfter: detail.certificateNotAfter || undefined,
      certificateRenewBeforeDays: !detail.certificateRenewedByCertificateId
        ? detail.certificateRenewBeforeDays || undefined
        : undefined,
      certificateRenewalError: detail.certificateRenewalError || undefined,
      pkiSyncName: detail.pkiSyncName || undefined,
      pkiSyncDestination: detail.pkiSyncDestination || undefined,
      externalIdentifier: detail.externalIdentifier || undefined,
      syncMetadata: detail.syncMetadata as TSyncMetadata
    }));

    return {
      certificates,
      totalCount,
      pkiSyncInfo: {
        projectId: pkiSync.projectId,
        destination: pkiSync.destination,
        name: pkiSync.name,
        applicationId: pkiSync.applicationId,
        applicationName: pkiSync.applicationName
      }
    };
  };

  const setCertificateAsDefault = async (
    { pkiSyncId, certificateId }: Omit<TSetCertificateAsDefaultDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ): Promise<{
    message: string;
    pkiSyncInfo: { projectId: string; name: string; applicationId?: string | null; applicationName?: string | null };
  }> => {
    const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    let pkiSyncSubscriber;
    if (pkiSync.subscriberId) {
      pkiSyncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.Edit,
      ResourcePermissionPkiSyncActions.Edit,
      pkiSync,
      pkiSyncSubscriber?.name,
      actor
    );

    const certificateSync = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSyncId, certificateId);
    if (!certificateSync) {
      throw new BadRequestError({ message: "Certificate is not part of this PKI sync" });
    }

    // Clear isDefault from all certificates in this sync
    await certificateSyncDAL.clearSyncMetadataFlag(pkiSyncId, "isDefault");

    // Set isDefault on the specified certificate
    const existingMetadata = (certificateSync.syncMetadata as Record<string, unknown>) || {};
    await certificateSyncDAL.updateSyncMetadata(pkiSyncId, certificateId, {
      ...existingMetadata,
      isDefault: true
    });

    if (pkiSync.isAutoSyncEnabled) {
      await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSyncId });
    }

    return {
      message: "Certificate set as default",
      pkiSyncInfo: {
        projectId: pkiSync.projectId,
        name: pkiSync.name,
        applicationId: pkiSync.applicationId,
        applicationName: pkiSync.applicationName
      }
    };
  };

  const clearDefaultCertificate = async (
    { pkiSyncId }: Omit<TClearDefaultCertificateDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ): Promise<{
    message: string;
    pkiSyncInfo: { projectId: string; name: string; applicationId?: string | null; applicationName?: string | null };
  }> => {
    const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    let pkiSyncSubscriber;
    if (pkiSync.subscriberId) {
      pkiSyncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.Edit,
      ResourcePermissionPkiSyncActions.Edit,
      pkiSync,
      pkiSyncSubscriber?.name,
      actor
    );

    await certificateSyncDAL.clearSyncMetadataFlag(pkiSyncId, "isDefault");

    if (pkiSync.isAutoSyncEnabled) {
      await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSyncId });
    }

    return {
      message: "Default certificate cleared",
      pkiSyncInfo: {
        projectId: pkiSync.projectId,
        name: pkiSync.name,
        applicationId: pkiSync.applicationId,
        applicationName: pkiSync.applicationName
      }
    };
  };

  return {
    createPkiSync,
    updatePkiSync,
    deletePkiSync,
    listPkiSyncsByProjectId,
    findPkiSyncById,
    runPkiSyncHealthCheckById,
    testPkiSyncHealthCheckCommand,
    triggerPkiSyncSyncCertificatesById,
    triggerPkiSyncImportCertificatesById,
    triggerPkiSyncRemoveCertificatesById,
    getPkiSyncOptions,
    previewPkiSyncFilters,
    searchPkiSyncCertificateOrders,
    addCertificatesToPkiSync,
    removeCertificatesFromPkiSync,
    listPkiSyncCertificates,
    setCertificateAsDefault,
    clearDefaultCertificate
  };
};
