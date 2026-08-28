import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, ResourceType, TCertificateSyncs } from "@app/db/schemas";
import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionPkiSyncActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionPkiSyncActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { deepEqual } from "@app/lib/fn/object";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";

import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "../certificate-sync/certificate-sync-enums";
import { TSyncMetadata } from "../certificate-sync/certificate-sync-schemas";
import { certificateNameSchemaAllowsMultipleCertificates } from "./pki-sync-certificate-name-fns";
import { encryptPkiSyncCredentials } from "./pki-sync-credentials-fns";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { HEALTH_CHECK_COMMAND_OPTION_KEY, PkiSync, PkiSyncStatus } from "./pki-sync-enums";
import { PkiSyncExportFormat } from "./pki-sync-export-fns";
import {
  enterprisePkiSyncCheck,
  getPkiSyncMaxCertificates,
  getPkiSyncProviderCapabilities,
  listPkiSyncOptions
} from "./pki-sync-fns";
import {
  applyHealthCheckCommandUpdate,
  getHealthCheckCommand,
  normalizeNewHealthCheckCommand,
  toHealthCheckApiResult
} from "./pki-sync-health-check-command-fns";
import { TPkiSyncHealthCheckQueueFactory } from "./pki-sync-health-check-queue";
import {
  findSingleCertificateHostCommandVariables,
  formatHostCommandVariables,
  HostCommandKind
} from "./pki-sync-host-command-fns";
import { getPkiSyncConnectionApps, PKI_SYNC_NAME_MAP } from "./pki-sync-maps";
import {
  applyPostSyncCommandUpdate,
  getPostSyncCommand,
  normalizeNewPostSyncCommand,
  POST_SYNC_COMMAND_OPTION_KEY
} from "./pki-sync-post-sync-command-fns";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";
import { assertTargetHostMatchesConnection, TPkiSyncDeliveryTarget } from "./pki-sync-target-host-fns";
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
  TRemoveCertificatesFromPkiSyncDTO,
  TSetCertificateAsDefaultDTO,
  TTriggerPkiSyncImportCertificatesByIdDTO,
  TTriggerPkiSyncRemoveCertificatesByIdDTO,
  TTriggerPkiSyncSyncCertificatesByIdDTO,
  TUpdatePkiSyncDTO
} from "./pki-sync-types";

type TPkiSyncServiceFactoryDep = {
  pkiSyncDAL: Pick<
    TPkiSyncDALFactory,
    "findById" | "findByProjectIdWithSubscribers" | "findByNameAndProjectId" | "create" | "updateById" | "deleteById"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findActiveCertificatesByIds">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "findByPkiSyncId"
    | "findByCertificateId"
    | "findByPkiSyncAndCertificate"
    | "findCertificateIdsByPkiSyncId"
    | "addCertificates"
    | "removeCertificates"
    | "removeAllCertificatesFromSync"
    | "findWithDetails"
    | "updateSyncMetadata"
    | "clearSyncMetadataFlag"
  >;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  pkiSyncHealthCheckQueue: Pick<TPkiSyncHealthCheckQueueFactory, "runHealthCheckNow" | "testHealthCheckCommand">;
  pkiSyncQueue: Pick<
    TPkiSyncQueueFactory,
    "queuePkiSyncSyncCertificatesById" | "queuePkiSyncImportCertificatesById" | "queuePkiSyncRemoveCertificatesById"
  >;
};

export type TPkiSyncServiceFactory = ReturnType<typeof pkiSyncServiceFactory>;

export const pkiSyncServiceFactory = ({
  pkiSyncDAL,
  certificateDAL,
  certificateSyncDAL,
  pkiSubscriberDAL,
  appConnectionService,
  permissionService,
  licenseService,
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
      config?.sslCertificate
    ]);
  };

  const $assertMaySetTargetHost = async ({
    nextConfig,
    currentConfig,
    pkiSync,
    subscriberName,
    actor
  }: {
    nextConfig: Record<string, unknown> | null | undefined;
    currentConfig: Record<string, unknown> | null | undefined;
    pkiSync: { projectId: string; applicationId?: string | null; name: string };
    subscriberName: string | undefined;
    actor: OrgServiceActor;
  }) => {
    if ($deliveryTarget(nextConfig) === $deliveryTarget(currentConfig)) return;

    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.SetTargetHost,
      ResourcePermissionPkiSyncActions.SetTargetHost,
      pkiSync,
      subscriberName,
      actor
    );
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

  const validateCertificatesForSync = async (
    certificateIds: string[],
    expectedProjectId: string,
    expectedApplicationId: string | null | undefined
  ) => {
    if (certificateIds.length === 0) return;

    const certificates = await certificateDAL.findActiveCertificatesByIds(certificateIds);

    if (certificates.length !== certificateIds.length) {
      const foundIds = certificates.map((cert) => cert.id);
      const missingIds = certificateIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundError({
        message: `Certificates not found or not active: ${missingIds.join(", ")}`
      });
    }

    const invalidProjectCertificates = certificates.filter((cert) => cert.projectId !== expectedProjectId);
    if (invalidProjectCertificates.length > 0) {
      throw new BadRequestError({
        message: `Certificates do not belong to the same project: ${invalidProjectCertificates.map((cert) => cert.id).join(", ")}`
      });
    }

    if (expectedApplicationId) {
      const invalidApplicationCertificates = certificates.filter(
        (cert) => cert.applicationId !== expectedApplicationId
      );
      if (invalidApplicationCertificates.length > 0) {
        throw new BadRequestError({
          message: `Certificates do not belong to this Application: ${invalidApplicationCertificates
            .map((cert) => cert.id)
            .join(", ")}`
        });
      }
    }

    const invalidRenewedCertificates = certificates.filter((cert) => cert.renewedByCertificateId);
    if (invalidRenewedCertificates.length > 0) {
      throw new BadRequestError({
        message: `Cannot add renewed certificates to PKI sync: ${invalidRenewedCertificates.map((cert) => cert.id).join(", ")}`
      });
    }
  };

  // Enforced only on user-initiated changes. The renewal path writes membership rows
  // directly via the DAL and relies on a transient old+new overlap, so it must not be capped here.
  const assertWithinCertificateLimit = (destination: PkiSync, prospectiveCount: number) => {
    const maxCertificates = getPkiSyncMaxCertificates(destination);
    if (maxCertificates !== undefined && prospectiveCount > maxCertificates) {
      throw new BadRequestError({
        message: `${PKI_SYNC_NAME_MAP[destination]} PKI sync supports at most ${maxCertificates} certificate${
          maxCertificates === 1 ? "" : "s"
        }`
      });
    }
  };

  const assertSyncOptionsAllowCertificateCount = (
    syncOptions: Record<string, unknown> | undefined,
    resultingCertificateCount: number
  ) => {
    if (resultingCertificateCount <= 1) return;

    const schema = syncOptions?.certificateNameSchema as string | undefined;
    if (!certificateNameSchemaAllowsMultipleCertificates(schema)) {
      throw new BadRequestError({
        message:
          "This sync's certificate name schema has no placeholder, so it can be linked to only one certificate. Add a placeholder such as {{commonName}} or {{certificateId}} to sync multiple certificates."
      });
    }

    [
      { kind: HostCommandKind.HealthCheck, command: getHealthCheckCommand(syncOptions) },
      { kind: HostCommandKind.PostSync, command: getPostSyncCommand(syncOptions) }
    ].forEach(({ kind, command }) => {
      const singleCertificateVariables = findSingleCertificateHostCommandVariables(command);

      if (singleCertificateVariables.length > 0) {
        throw new BadRequestError({
          message: `This sync's ${kind} uses ${formatHostCommandVariables(
            singleCertificateVariables
          )}. A variable that names one certificate can only be used on a sync with a single certificate linked. Use {{certificateFiles}} or {{certificateDirectory}} to write a command that covers every certificate in the run.`
        });
      }
    });
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
      certificateIds = [],
      credentials
    }: Omit<TCreatePkiSyncDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ): Promise<TPkiSync> => {
    if (!applicationId) {
      throw new BadRequestError({
        message:
          "Certificate Syncs must be created inside an Application. Open the Application's Certificate Syncs tab and click Add Sync."
      });
    }

    await enterprisePkiSyncCheck(licenseService, actor.orgId, destination);

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
    const connection = await appConnectionService.connectAppConnectionById(destinationApps, connectionId, actor);

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

    if (certificateIds.length > 0) {
      assertWithinCertificateLimit(destination, certificateIds.length);
      await validateCertificatesForSync(certificateIds, projectId, applicationId);
      assertSyncOptionsAllowCertificateCount(resolvedSyncOptions, certificateIds.length);
    }

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
        ...(isAutoSyncEnabled && { syncStatus: PkiSyncStatus.Pending })
      });

      if (certificateIds.length > 0) {
        await certificateSyncDAL.addCertificates(
          pkiSync.id,
          certificateIds.map((id) => ({ certificateId: id }))
        );
      }

      if (pkiSync.isAutoSyncEnabled) {
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
      certificateIds,
      credentials
    }: Omit<TUpdatePkiSyncDTO, "auditLogInfo" | "projectId">,
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

    let resolvedConnection: Awaited<ReturnType<typeof appConnectionService.connectAppConnectionById>> | undefined;
    const resolveConnection = async () => {
      resolvedConnection ??= await appConnectionService.connectAppConnectionById(
        getPkiSyncConnectionApps(pkiSync.destination),
        connectionId ?? pkiSync.connectionId,
        actor
      );
      return resolvedConnection;
    };

    const isConnectionChanging = Boolean(connectionId && connectionId !== pkiSync.connectionId);

    const isDestinationConfigChanging =
      Boolean(destinationConfig) && !deepEqual(destinationConfig, pkiSync.destinationConfig);

    const nextDestinationConfig = (destinationConfig ?? pkiSync.destinationConfig) as
      | (Record<string, unknown> & { host?: string })
      | undefined;

    if (isConnectionChanging || destinationConfig !== undefined) {
      assertTargetHostMatchesConnection({
        destination: pkiSync.destination,
        connection: isConnectionChanging
          ? await resolveConnection()
          : { ...pkiSync.connection, app: pkiSync.connection.app as AppConnection },
        destinationConfig: nextDestinationConfig
      });
    }

    await $assertMaySetTargetHost({
      nextConfig: nextDestinationConfig,
      currentConfig: pkiSync.destinationConfig as Record<string, unknown> | undefined,
      pkiSync,
      subscriberName: currentSubscriber?.name,
      actor
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

    const effectiveSyncOptions = (resolvedSyncOptions ?? pkiSync.syncOptions) as Record<string, unknown> | undefined;

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

    if (certificateIds !== undefined) {
      if (certificateIds.length > 0) {
        assertWithinCertificateLimit(pkiSync.destination, certificateIds.length);
        await validateCertificatesForSync(certificateIds, pkiSync.projectId, pkiSync.applicationId);
        assertSyncOptionsAllowCertificateCount(effectiveSyncOptions, certificateIds.length);
      }

      await certificateSyncDAL.removeAllCertificatesFromSync(id);
      if (certificateIds.length > 0) {
        await certificateSyncDAL.addCertificates(
          id,
          certificateIds.map((certId) => ({ certificateId: certId }))
        );
      }
    } else if (syncOptions) {
      const existingCount = (await certificateSyncDAL.findByPkiSyncId(id)).length;
      assertSyncOptionsAllowCertificateCount(effectiveSyncOptions, existingCount);
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

    const updatedPkiSync = await pkiSyncDAL.updateById(id, {
      name,
      description,
      isAutoSyncEnabled,
      destinationConfig,
      syncOptions: resolvedSyncOptions,
      subscriberId,
      connectionId,
      ...(encryptedCredentials ? { encryptedCredentials } : {}),
      ...(isHealthCheckBeingCleared
        ? { lastHealthCheckRanAt: null, lastHealthCheckStatus: null, lastHealthCheckMessage: null }
        : {})
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

    return pkiSyncDAL.deleteById(id);
  };

  const listPkiSyncsByProjectId = async (
    { projectId, certificateId, applicationId }: TListPkiSyncsByProjectId,
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
      applicationId !== undefined ? { applicationId } : undefined
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

      return { projectId: pkiSync.projectId, applicationId: pkiSync.applicationId, name: pkiSync.name };
    }

    if (!args.applicationId) {
      throw new BadRequestError({
        message:
          "Provide the Application the sync belongs to, or the id of the sync being edited, so the command can be authorized."
      });
    }

    return { projectId: args.projectId, applicationId: args.applicationId, name: "" };
  };

  const testPkiSyncHealthCheckCommand = async (
    args: {
      destination: PkiSync;
      connectionId: string;
      applicationId?: string;
      syncId?: string;
      certificateIds?: string[];
      destinationConfig: Record<string, unknown>;
      syncOptions: Record<string, unknown>;
      projectId: string;
    },
    actor: OrgServiceActor,
    auditLogInfo?: AuditLogInfo
  ) => {
    await $assertSyncAction(
      ProjectPermissionPkiSyncActions.SetHealthCheckCommand,
      ResourcePermissionPkiSyncActions.SetHealthCheckCommand,
      await $resolveHealthCheckTestTarget(args),
      undefined,
      actor
    );

    const command = getHealthCheckCommand(args.syncOptions);
    if (!command) {
      throw new BadRequestError({ message: "Enter a health check command to test." });
    }

    if (args.certificateIds?.length) {
      await validateCertificatesForSync(args.certificateIds, args.projectId, args.applicationId);
    }

    const connection = await appConnectionService.connectAppConnectionById(
      getPkiSyncConnectionApps(args.destination),
      args.connectionId,
      actor
    );

    assertTargetHostMatchesConnection({
      destination: args.destination,
      connection,
      destinationConfig: args.destinationConfig
    });

    $assertHostCommandsAreSupported(args.destination, args.syncOptions, connection);

    const result = await pkiSyncHealthCheckQueue.testHealthCheckCommand({
      destination: args.destination,
      connectionId: args.connectionId,
      syncId: args.syncId,
      certificateIds: args.certificateIds,
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

  const getPkiSyncOptions = () => {
    return listPkiSyncOptions();
  };

  const addCertificatesToPkiSync = async (
    { pkiSyncId, certificateIds }: Omit<TAddCertificatesToPkiSyncDTO, "auditLogInfo" | "projectId">,
    actor: OrgServiceActor
  ): Promise<{
    addedCertificates: TCertificateSyncs[];
    pkiSyncInfo: { projectId: string; destination: string; name: string; applicationId?: string | null };
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

    const existingCertificateIds = await certificateSyncDAL.findCertificateIdsByPkiSyncId(pkiSyncId);
    const prospectiveCount = new Set([...existingCertificateIds, ...certificateIds]).size;
    assertWithinCertificateLimit(pkiSync.destination, prospectiveCount);

    await validateCertificatesForSync(certificateIds, pkiSync.projectId, pkiSync.applicationId);

    assertSyncOptionsAllowCertificateCount(
      pkiSync.syncOptions as Record<string, unknown> | undefined,
      prospectiveCount
    );

    const alreadyLinked = new Set(existingCertificateIds);
    const certificateIdsToAdd = certificateIds.filter((id) => !alreadyLinked.has(id));

    const addedCertificates = certificateIdsToAdd.length
      ? await certificateSyncDAL.addCertificates(
          pkiSyncId,
          certificateIdsToAdd.map((id) => ({ certificateId: id }))
        )
      : [];

    if (pkiSync.isAutoSyncEnabled) {
      await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSyncId });
    }

    return {
      addedCertificates,
      pkiSyncInfo: {
        projectId: pkiSync.projectId,
        destination: pkiSync.destination,
        name: pkiSync.name,
        applicationId: pkiSync.applicationId
      }
    };
  };

  const removeCertificatesFromPkiSync = async (
    { pkiSyncId, certificateIds }: Omit<TRemoveCertificatesFromPkiSyncDTO, "auditLogInfo" | "projectId">,
    actor: OrgServiceActor
  ): Promise<{
    removedCount: number;
    pkiSyncInfo: { projectId: string; destination: string; name: string; applicationId?: string | null };
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

    const syncOptions = pkiSync.syncOptions as { canRemoveCertificates?: boolean } | undefined;
    let removedCount: number;
    if (syncOptions?.canRemoveCertificates) {
      await pkiSyncQueue.queuePkiSyncRemoveCertificatesById({ syncId: pkiSyncId, certificateIds });
      removedCount = certificateIds.length;
    } else {
      removedCount = await certificateSyncDAL.removeCertificates(pkiSyncId, certificateIds);
      if (pkiSync.isAutoSyncEnabled) {
        await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSyncId });
      }
    }

    return {
      removedCount,
      pkiSyncInfo: {
        projectId: pkiSync.projectId,
        destination: pkiSync.destination,
        name: pkiSync.name,
        applicationId: pkiSync.applicationId
      }
    };
  };

  const listPkiSyncCertificates = async (
    { pkiSyncId, offset = 0, limit = 20 }: Omit<TListPkiSyncCertificatesDTO, "projectId">,
    actor: OrgServiceActor
  ): Promise<{
    certificates: TPkiSyncCertificate[];
    totalCount: number;
    pkiSyncInfo: { projectId: string; destination: string; name: string; applicationId?: string | null };
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
        applicationId: pkiSync.applicationId
      }
    };
  };

  const setCertificateAsDefault = async (
    { pkiSyncId, certificateId }: Omit<TSetCertificateAsDefaultDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ): Promise<{ message: string; pkiSyncInfo: { projectId: string; name: string; applicationId?: string | null } }> => {
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
      pkiSyncInfo: { projectId: pkiSync.projectId, name: pkiSync.name, applicationId: pkiSync.applicationId }
    };
  };

  const clearDefaultCertificate = async (
    { pkiSyncId }: Omit<TClearDefaultCertificateDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ): Promise<{ message: string; pkiSyncInfo: { projectId: string; name: string; applicationId?: string | null } }> => {
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
      pkiSyncInfo: { projectId: pkiSync.projectId, name: pkiSync.name, applicationId: pkiSync.applicationId }
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
    addCertificatesToPkiSync,
    removeCertificatesFromPkiSync,
    listPkiSyncCertificates,
    setCertificateAsDefault,
    clearDefaultCertificate
  };
};
