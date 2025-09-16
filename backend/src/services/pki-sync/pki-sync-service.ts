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
import { PkiSync } from "./pki-sync-enums";
import { enterprisePkiSyncCheck, listPkiSyncOptions } from "./pki-sync-fns";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";
import {
  PkiSyncStatus,
  TCreatePkiSyncDTO,
  TDeletePkiSyncDTO,
  TFindPkiSyncByIdDTO,
  TFindPkiSyncByNameDTO,
  TListPkiSyncsByProjectId,
  TListPkiSyncsBySubscriberId,
  TPkiSync,
  TTriggerPkiSyncImportCertificatesByIdDTO,
  TTriggerPkiSyncRemoveCertificatesByIdDTO,
  TTriggerPkiSyncSyncCertificatesByIdDTO,
  TUpdatePkiSyncDTO
} from "./pki-sync-types";

type TPkiSyncServiceFactoryDep = {
  pkiSyncDAL: TPkiSyncDALFactory;
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.Create,
      subject(ProjectPermissionSub.PkiSyncs, { projectId })
    );

    if (subscriberId) {
      const subscriber = await pkiSubscriberDAL.findById(subscriberId);
      if (!subscriber || subscriber.projectId !== projectId) {
        throw new NotFoundError({ message: "PKI subscriber not found" });
      }
    }

    // Get the destination app type based on PKI sync destination
    const destinationApp = destination === PkiSync.AzureKeyVault ? AppConnection.AzureKeyVault : destination;

    // Validates permission to connect and app is valid for sync destination
    await appConnectionService.connectAppConnectionById(destinationApp, connectionId, actor);

    try {
      const pkiSync = await pkiSyncDAL.create({
        name,
        description,
        destination,
        isAutoSyncEnabled,
        destinationConfig,
        syncOptions,
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
      projectId,
      name,
      description,
      isAutoSyncEnabled,
      destinationConfig,
      syncOptions,
      subscriberId,
      connectionId
    }: Omit<TUpdatePkiSyncDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ): Promise<TPkiSync> => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId
    });

    const pkiSync = await pkiSyncDAL.findByIdAndProjectId(id, projectId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.Edit,
      subject(ProjectPermissionSub.PkiSyncs, {
        projectId,
        subscriberId: pkiSync.subscriberId
      })
    );

    if (name && name !== pkiSync.name) {
      const existingPkiSync = await pkiSyncDAL.findByNameAndProjectId(name, projectId);
      if (existingPkiSync) {
        throw new BadRequestError({ message: "PKI sync with this name already exists" });
      }
    }

    if (subscriberId) {
      const subscriber = await pkiSubscriberDAL.findById(subscriberId);
      if (!subscriber || subscriber.projectId !== projectId) {
        throw new NotFoundError({ message: "PKI subscriber not found" });
      }
    }

    if (connectionId && connectionId !== pkiSync.connectionId) {
      const destinationApp =
        pkiSync.destination === PkiSync.AzureKeyVault
          ? AppConnection.AzureKeyVault
          : (pkiSync.destination as AppConnection);
      await appConnectionService.connectAppConnectionById(destinationApp, connectionId, actor);
    }

    const updatedPkiSync = await pkiSyncDAL.updateById(id, {
      name,
      description,
      isAutoSyncEnabled,
      destinationConfig,
      syncOptions,
      subscriberId,
      connectionId
    });

    return updatedPkiSync as TPkiSync;
  };

  const deletePkiSync = async (
    { id, projectId }: Omit<TDeletePkiSyncDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ): Promise<TPkiSync> => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId
    });

    const pkiSync = await pkiSyncDAL.findByIdAndProjectId(id, projectId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.Delete,
      subject(ProjectPermissionSub.PkiSyncs, {
        projectId,
        subscriberId: pkiSync.subscriberId
      })
    );

    const deletedPkiSync = await pkiSyncDAL.deleteById(id);
    return deletedPkiSync as TPkiSync;
  };

  const listPkiSyncsByProjectId = async ({ projectId }: TListPkiSyncsByProjectId, actor: OrgServiceActor) => {
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
      subject(ProjectPermissionSub.PkiSyncs, { projectId })
    );

    const pkiSyncs = await pkiSyncDAL.findByProjectId(projectId);
    return pkiSyncs;
  };

  const listPkiSyncsBySubscriberId = async ({ subscriberId }: TListPkiSyncsBySubscriberId) => {
    const pkiSyncs = await pkiSyncDAL.findBySubscriberId(subscriberId);
    return pkiSyncs;
  };

  const findPkiSyncById = async ({ id, projectId }: TFindPkiSyncByIdDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId
    });

    const pkiSync = await pkiSyncDAL.findByIdAndProjectId(id, projectId);
    if (!pkiSync)
      throw new NotFoundError({
        message: `Could not find PKI Sync with ID "${id}"`
      });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.Read,
      subject(ProjectPermissionSub.PkiSyncs, {
        projectId,
        subscriberId: pkiSync.subscriberId
      })
    );

    return pkiSync;
  };

  const findPkiSyncByName = async ({ name, projectId }: TFindPkiSyncByNameDTO) => {
    const pkiSync = await pkiSyncDAL.findByNameAndProjectId(name, projectId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });
    return pkiSync;
  };

  const triggerPkiSyncSyncCertificatesById = async (
    { id, projectId }: Omit<TTriggerPkiSyncSyncCertificatesByIdDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId
    });

    const pkiSync = await pkiSyncDAL.findByIdAndProjectId(id, projectId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.SyncCertificates,
      subject(ProjectPermissionSub.PkiSyncs, {
        projectId,
        subscriberId: pkiSync.subscriberId
      })
    );

    await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: id });

    return { message: "PKI sync job added to queue successfully" };
  };

  const triggerPkiSyncImportCertificatesById = async (
    { id, projectId }: Omit<TTriggerPkiSyncImportCertificatesByIdDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId
    });

    const pkiSync = await pkiSyncDAL.findByIdAndProjectId(id, projectId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.ImportCertificates,
      subject(ProjectPermissionSub.PkiSyncs, {
        projectId,
        subscriberId: pkiSync.subscriberId
      })
    );

    await pkiSyncQueue.queuePkiSyncImportCertificatesById({ syncId: id });

    return { message: "PKI sync import job added to queue successfully" };
  };

  const triggerPkiSyncRemoveCertificatesById = async (
    { id, projectId }: Omit<TTriggerPkiSyncRemoveCertificatesByIdDTO, "auditLogInfo">,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager,
      projectId
    });

    const pkiSync = await pkiSyncDAL.findByIdAndProjectId(id, projectId);
    if (!pkiSync) throw new NotFoundError({ message: "PKI sync not found" });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSyncActions.RemoveCertificates,
      subject(ProjectPermissionSub.PkiSyncs, {
        projectId,
        subscriberId: pkiSync.subscriberId
      })
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
    listPkiSyncsBySubscriberId,
    findPkiSyncById,
    findPkiSyncByName,
    triggerPkiSyncSyncCertificatesById,
    triggerPkiSyncImportCertificatesById,
    triggerPkiSyncRemoveCertificatesById,
    getPkiSyncOptions
  };
};
