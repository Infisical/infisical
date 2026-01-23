import { ForbiddenError, subject } from "@casl/ability";

import { TCertificateSyncs } from "@app/db/schemas/certificate-syncs";
import { ActionProjectType } from "@app/db/schemas/models";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionPkiSyncActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";

import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "../certificate-sync/certificate-sync-enums";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSync, PkiSyncStatus } from "./pki-sync-enums";
import { enterprisePkiSyncCheck, getPkiSyncProviderCapabilities, listPkiSyncOptions } from "./pki-sync-fns";
import { PKI_SYNC_CONNECTION_MAP, PKI_SYNC_NAME_MAP } from "./pki-sync-maps";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";
import {
  TAddCertificatesToPkiSyncDTO,
  TCreatePkiSyncDTO,
  TDeletePkiSyncDTO,
  TFindPkiSyncByIdDTO,
  TListPkiSyncCertificatesDTO,
  TListPkiSyncsByProjectId,
  TPkiSync,
  TPkiSyncCertificate,
  TRemoveCertificatesFromPkiSyncDTO,
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
    | "findCertificateIdsByPkiSyncId"
    | "addCertificates"
    | "removeCertificates"
    | "removeAllCertificatesFromSync"
    | "findWithDetails"
  >;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
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
  pkiSyncQueue
}: TPkiSyncServiceFactoryDep) => {
  const validateCertificatesProjectOwnership = async (certificateIds: string[], expectedProjectId: string) => {
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

    const invalidRenewedCertificates = certificates.filter((cert) => cert.renewedByCertificateId);
    if (invalidRenewedCertificates.length > 0) {
      throw new BadRequestError({
        message: `Cannot add renewed certificates to PKI sync: ${invalidRenewedCertificates.map((cert) => cert.id).join(", ")}`
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
      certificateIds = []
    }: Omit<TCreatePkiSyncDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ): Promise<TPkiSync> => {
    await enterprisePkiSyncCheck(licenseService, actor.orgId, destination);

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId
    });

    let subscriber;
    if (subscriberId) {
      subscriber = await pkiSubscriberDAL.findById(subscriberId);
      if (!subscriber || subscriber.projectId !== projectId) {
        throw new NotFoundError({ message: "PKI subscriber not found" });
      }
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.Create,
      subject(ProjectPermissionSub.PkiSyncs, {
        subscriberName: subscriber?.name,
        name
      })
    );

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
      await validateCertificatesProjectOwnership(certificateIds, projectId);
    }

    try {
      const pkiSync = await pkiSyncDAL.create({
        name,
        description,
        destination,
        isAutoSyncEnabled,
        destinationConfig,
        syncOptions: resolvedSyncOptions,
        subscriberId,
        connectionId,
        projectId,
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
      name,
      description,
      isAutoSyncEnabled,
      destinationConfig,
      syncOptions,
      subscriberId,
      connectionId,
      certificateIds
    }: Omit<TUpdatePkiSyncDTO, "auditLogInfo" | "projectId">,
    actor: OrgServiceActor
  ): Promise<TPkiSync> => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId: pkiSync.projectId
    });

    let currentSubscriber;
    if (pkiSync.subscriberId) {
      currentSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.Edit,
      subject(ProjectPermissionSub.PkiSyncs, {
        subscriberName: currentSubscriber?.name,
        name: pkiSync.name
      })
    );

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

    if (certificateIds !== undefined) {
      if (certificateIds.length > 0) {
        await validateCertificatesProjectOwnership(certificateIds, pkiSync.projectId);
      }

      await certificateSyncDAL.removeAllCertificatesFromSync(id);
      if (certificateIds.length > 0) {
        await certificateSyncDAL.addCertificates(
          id,
          certificateIds.map((certId) => ({ certificateId: certId }))
        );
      }
    }

    const updatedPkiSync = await pkiSyncDAL.updateById(id, {
      name,
      description,
      isAutoSyncEnabled,
      destinationConfig,
      syncOptions: resolvedSyncOptions,
      subscriberId,
      connectionId
    });

    return updatedPkiSync as TPkiSync;
  };

  const deletePkiSync = async (
    { id }: Omit<TDeletePkiSyncDTO, "auditLogInfo" | "projectId">,
    actor: OrgServiceActor
  ) => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId: pkiSync.projectId
    });

    let pkiSyncSubscriber;
    if (pkiSync.subscriberId) {
      pkiSyncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.Delete,
      subject(ProjectPermissionSub.PkiSyncs, {
        subscriberName: pkiSyncSubscriber?.name,
        name: pkiSync.name
      })
    );

    return pkiSyncDAL.deleteById(id);
  };

  const listPkiSyncsByProjectId = async (
    { projectId, certificateId }: TListPkiSyncsByProjectId,
    actor: OrgServiceActor
  ): Promise<TPkiSync[]> => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionPkiSyncActions.Read, ProjectPermissionSub.PkiSyncs);

    const processedRules = getProcessedPermissionRules(
      permission,
      ProjectPermissionPkiSyncActions.Read,
      ProjectPermissionSub.PkiSyncs
    );

    const pkiSyncsWithSubscribers = await pkiSyncDAL.findByProjectIdWithSubscribers(projectId, processedRules);

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

  const findPkiSyncById = async ({ id, projectId }: TFindPkiSyncByIdDTO, actor: OrgServiceActor) => {
    const pkiSync = await pkiSyncDAL.findById(id);
    if (!pkiSync || (projectId && pkiSync.projectId !== projectId)) {
      throw new NotFoundError({
        message: `Could not find PKI Sync with ID "${id}"`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId: pkiSync.projectId
    });

    let findSubscriber;
    if (pkiSync.subscriberId) {
      findSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.Read,
      subject(ProjectPermissionSub.PkiSyncs, {
        subscriberName: findSubscriber?.name,
        name: pkiSync.name
      })
    );

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

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId: pkiSync.projectId
    });

    let syncSubscriber;
    if (pkiSync.subscriberId) {
      syncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.SyncCertificates,
      subject(ProjectPermissionSub.PkiSyncs, {
        subscriberName: syncSubscriber?.name,
        name: pkiSync.name
      })
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

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId: pkiSync.projectId
    });

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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.ImportCertificates,
      subject(ProjectPermissionSub.PkiSyncs, {
        subscriberName: importSubscriber?.name,
        name: pkiSync.name
      })
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

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId: pkiSync.projectId
    });

    let removeSubscriber;
    if (pkiSync.subscriberId) {
      removeSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.RemoveCertificates,
      subject(ProjectPermissionSub.PkiSyncs, {
        subscriberName: removeSubscriber?.name,
        name: pkiSync.name
      })
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
    pkiSyncInfo: { projectId: string; destination: string; name: string };
  }> => {
    const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId: pkiSync.projectId
    });

    let pkiSyncSubscriber;
    if (pkiSync.subscriberId) {
      pkiSyncSubscriber = await pkiSubscriberDAL.findById(pkiSync.subscriberId);
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.Edit,
      subject(ProjectPermissionSub.PkiSyncs, {
        subscriberName: pkiSyncSubscriber?.name,
        name: pkiSync.name
      })
    );

    await validateCertificatesProjectOwnership(certificateIds, pkiSync.projectId);

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
        name: pkiSync.name
      }
    };
  };

  const removeCertificatesFromPkiSync = async (
    { pkiSyncId, certificateIds }: Omit<TRemoveCertificatesFromPkiSyncDTO, "auditLogInfo" | "projectId">,
    actor: OrgServiceActor
  ): Promise<{ removedCount: number; pkiSyncInfo: { projectId: string; destination: string; name: string } }> => {
    const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

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
        name: pkiSync.name
      })
    );

    const removedCount = await certificateSyncDAL.removeCertificates(pkiSyncId, certificateIds);

    if (pkiSync.isAutoSyncEnabled) {
      await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSyncId });
    }

    return {
      removedCount,
      pkiSyncInfo: {
        projectId: pkiSync.projectId,
        destination: pkiSync.destination,
        name: pkiSync.name
      }
    };
  };

  const listPkiSyncCertificates = async (
    { pkiSyncId, offset = 0, limit = 20 }: Omit<TListPkiSyncCertificatesDTO, "projectId">,
    actor: OrgServiceActor
  ): Promise<{
    certificates: TPkiSyncCertificate[];
    totalCount: number;
    pkiSyncInfo: { projectId: string; destination: string; name: string };
  }> => {
    const pkiSync = await pkiSyncDAL.findById(pkiSyncId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

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
        name: pkiSync.name
      })
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
      pkiSyncDestination: detail.pkiSyncDestination || undefined
    }));

    return {
      certificates,
      totalCount,
      pkiSyncInfo: {
        projectId: pkiSync.projectId,
        destination: pkiSync.destination,
        name: pkiSync.name
      }
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
    listPkiSyncCertificates
  };
};
