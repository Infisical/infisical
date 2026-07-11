import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, ResourceType, TCertificateSyncs } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionPkiSyncActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionPkiSyncActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";

import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "../certificate-sync/certificate-sync-enums";
import { TSyncMetadata } from "../certificate-sync/certificate-sync-schemas";
import { certificateNameSchemaAllowsMultipleCertificates } from "./pki-sync-certificate-name-fns";
import { encryptPkiSyncCredentials } from "./pki-sync-credentials-fns";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSync, PkiSyncStatus } from "./pki-sync-enums";
import { enterprisePkiSyncCheck, getPkiSyncProviderCapabilities, listPkiSyncOptions } from "./pki-sync-fns";
import { PKI_SYNC_CONNECTION_MAP, PKI_SYNC_NAME_MAP } from "./pki-sync-maps";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";
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

const getDestinationAppType = (destination: PkiSync): AppConnection => {
  const appConnection = PKI_SYNC_CONNECTION_MAP[destination];
  if (!appConnection) {
    throw new BadRequestError({
      message: `Unsupported PKI sync destination: ${destination}`
    });
  }
  return appConnection;
};

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
  pkiSyncQueue
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

  const assertSchemaAllowsCertificateCount = (
    syncOptions: Record<string, unknown> | undefined,
    resultingCertificateCount: number
  ) => {
    const schema = syncOptions?.certificateNameSchema as string | undefined;
    if (resultingCertificateCount > 1 && !certificateNameSchemaAllowsMultipleCertificates(schema)) {
      throw new BadRequestError({
        message:
          "This sync's certificate name schema has no placeholder, so it can be linked to only one certificate. Add a placeholder such as {{commonName}} or {{certificateId}} to sync multiple certificates."
      });
    }
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

    // Get the destination app type based on PKI sync destination
    const destinationApp = getDestinationAppType(destination);

    // Validates permission to connect and app is valid for sync destination
    await appConnectionService.connectAppConnectionById(destinationApp, connectionId, actor);

    const providerCapabilities = getPkiSyncProviderCapabilities(destination);
    const resolvedSyncOptions = {
      ...providerCapabilities,
      ...syncOptions
    };

    if (certificateIds.length > 0) {
      await validateCertificatesForSync(certificateIds, projectId, applicationId);
      assertSchemaAllowsCertificateCount(resolvedSyncOptions, certificateIds.length);
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

    if (connectionId && connectionId !== pkiSync.connectionId) {
      const destinationApp = getDestinationAppType(pkiSync.destination);
      await appConnectionService.connectAppConnectionById(destinationApp, connectionId, actor);
    }

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

      resolvedSyncOptions = {
        ...providerCapabilities,
        ...syncOptions
      };
    }

    const effectiveSyncOptions = (resolvedSyncOptions ?? pkiSync.syncOptions) as Record<string, unknown> | undefined;

    if (certificateIds !== undefined) {
      if (certificateIds.length > 0) {
        await validateCertificatesForSync(certificateIds, pkiSync.projectId, pkiSync.applicationId);
        assertSchemaAllowsCertificateCount(effectiveSyncOptions, certificateIds.length);
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
      assertSchemaAllowsCertificateCount(effectiveSyncOptions, existingCount);
    }

    const encryptedCredentials = credentials?.exportPassword
      ? await encryptPkiSyncCredentials({ orgId: actor.orgId, projectId: pkiSync.projectId, credentials, kmsService })
      : undefined;

    const updatedPkiSync = await pkiSyncDAL.updateById(id, {
      name,
      description,
      isAutoSyncEnabled,
      destinationConfig,
      syncOptions: resolvedSyncOptions,
      subscriberId,
      connectionId,
      ...(encryptedCredentials ? { encryptedCredentials } : {})
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

    await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: id });

    return { message: "PKI sync job added to queue successfully" };
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

    await validateCertificatesForSync(certificateIds, pkiSync.projectId, pkiSync.applicationId);

    const existingCount = (await certificateSyncDAL.findByPkiSyncId(pkiSyncId)).length;
    assertSchemaAllowsCertificateCount(
      pkiSync.syncOptions as Record<string, unknown> | undefined,
      existingCount + certificateIds.length
    );

    const addedCertificates = await certificateSyncDAL.addCertificates(
      pkiSyncId,
      certificateIds.map((id) => ({ certificateId: id }))
    );

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
