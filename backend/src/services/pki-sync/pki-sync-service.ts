import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionPkiSyncActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";

import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSync, PkiSyncStatus } from "./pki-sync-enums";
import { enterprisePkiSyncCheck, getPkiSyncProviderCapabilities, listPkiSyncOptions } from "./pki-sync-fns";
import { PKI_SYNC_CONNECTION_MAP, PKI_SYNC_NAME_MAP } from "./pki-sync-maps";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";
import {
  TCreatePkiSyncDTO,
  TDeletePkiSyncDTO,
  TFindPkiSyncByIdDTO,
  TListPkiSyncsByProjectId,
  TPkiSync,
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
  pkiSubscriberDAL,
  appConnectionService,
  permissionService,
  licenseService,
  pkiSyncQueue
}: TPkiSyncServiceFactoryDep) => {
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
      projectId
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
      subscriber
        ? subject(ProjectPermissionSub.PkiSyncs, { subscriberName: subscriber.name })
        : ProjectPermissionSub.PkiSyncs
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
      connectionId
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
      currentSubscriber
        ? subject(ProjectPermissionSub.PkiSyncs, { subscriberName: currentSubscriber.name })
        : ProjectPermissionSub.PkiSyncs
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
      pkiSyncSubscriber
        ? subject(ProjectPermissionSub.PkiSyncs, { subscriberName: pkiSyncSubscriber.name })
        : ProjectPermissionSub.PkiSyncs
    );

    return pkiSyncDAL.deleteById(id);
  };

  const listPkiSyncsByProjectId = async (
    { projectId }: TListPkiSyncsByProjectId,
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

    const pkiSyncsWithSubscribers = await pkiSyncDAL.findByProjectIdWithSubscribers(projectId);

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
      findSubscriber
        ? subject(ProjectPermissionSub.PkiSyncs, { subscriberName: findSubscriber.name })
        : ProjectPermissionSub.PkiSyncs
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
      syncSubscriber
        ? subject(ProjectPermissionSub.PkiSyncs, { subscriberName: syncSubscriber.name })
        : ProjectPermissionSub.PkiSyncs
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
      importSubscriber
        ? subject(ProjectPermissionSub.PkiSyncs, { subscriberName: importSubscriber.name })
        : ProjectPermissionSub.PkiSyncs
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
      removeSubscriber
        ? subject(ProjectPermissionSub.PkiSyncs, { subscriberName: removeSubscriber.name })
        : ProjectPermissionSub.PkiSyncs
    );

    await pkiSyncQueue.queuePkiSyncRemoveCertificatesById({ syncId: id });

    return { message: "PKI sync remove job added to queue successfully" };
  };

  const getPkiSyncOptions = () => {
    return listPkiSyncOptions();
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
    getPkiSyncOptions
  };
};
