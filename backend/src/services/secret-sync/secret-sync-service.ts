import { ForbiddenError } from "@casl/ability";

import { ProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { startsWithVowel } from "@app/lib/fn";
import { OrgServiceActor } from "@app/lib/types";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { listSecretSyncOptions } from "@app/services/secret-sync/secret-sync-fns";
import {
  TCreateSecretSyncDTO,
  TDeleteSecretSyncDTO,
  TFindSecretSyncByIdDTO,
  TFindSecretSyncByNameDTO,
  TListSecretSyncsByProjectId,
  TSecretSync,
  TTriggerSecretSyncByIdDTO,
  TTriggerSecretSyncEraseByIdDTO,
  TTriggerSecretSyncImportByIdDTO,
  TUpdateSecretSyncDTO
} from "@app/services/secret-sync/secret-sync-types";

import { TSecretSyncDALFactory } from "./secret-sync-dal";
import { SECRET_SYNC_CONNECTION_MAP, SECRET_SYNC_NAME_MAP } from "./secret-sync-maps";
import { TSecretSyncQueueFactory } from "./secret-sync-queue";

type TSecretSyncServiceFactoryDep = {
  secretSyncDAL: TSecretSyncDALFactory;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId" | "findById">;
  keyStore: Pick<TKeyStoreFactory, "getItem">;
  secretSyncQueue: Pick<
    TSecretSyncQueueFactory,
    "queueSecretSyncById" | "queueSecretSyncImportById" | "queueSecretSyncEraseById"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">; // TODO: remove once launched
};

export type TSecretSyncServiceFactory = ReturnType<typeof secretSyncServiceFactory>;

export const secretSyncServiceFactory = ({
  secretSyncDAL,
  folderDAL,
  licenseService,
  permissionService,
  appConnectionService,
  projectBotService,
  secretSyncQueue,
  keyStore
}: TSecretSyncServiceFactoryDep) => {
  // secret syncs are disabled for public until launch
  const checkSecretSyncAvailability = async (orgId: string) => {
    const subscription = await licenseService.getPlan(orgId);

    if (!subscription.appConnections) throw new BadRequestError({ message: "Secret Syncs are not available yet." });
  };

  const listSecretSyncsByProjectId = async (
    { projectId, destination }: TListSecretSyncsByProjectId,
    actor: OrgServiceActor
  ) => {
    await checkSecretSyncAvailability(actor.orgId);

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbidOnInvalidProjectType(ProjectType.SecretManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretSyncs);

    const folders = await folderDAL.findByProjectId(projectId);

    const secretSyncs = await secretSyncDAL.find({
      ...(destination && { destination }),
      $in: {
        folderId: folders.map((folder) => folder.id)
      }
    });

    return secretSyncs as TSecretSync[];
  };

  const findSecretSyncById = async ({ destination, syncId }: TFindSecretSyncByIdDTO, actor: OrgServiceActor) => {
    await checkSecretSyncAvailability(actor.orgId);

    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      secretSync.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbidOnInvalidProjectType(ProjectType.SecretManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretSyncs);

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    return secretSync as TSecretSync;
  };

  const findSecretSyncByName = async (
    { destination, syncName, projectId }: TFindSecretSyncByNameDTO,
    actor: OrgServiceActor
  ) => {
    await checkSecretSyncAvailability(actor.orgId);

    const folders = await folderDAL.findByProjectId(projectId);

    // we prevent conflicting names within a project so this will only return one at most
    const [secretSync] = await secretSyncDAL.find({
      name: syncName,
      $in: {
        folderId: folders.map((folder) => folder.id)
      }
    });

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with name "${syncName}"`
      });

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      secretSync.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbidOnInvalidProjectType(ProjectType.SecretManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretSyncs);

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    return secretSync as TSecretSync;
  };

  const createSecretSync = async (params: TCreateSecretSyncDTO, actor: OrgServiceActor) => {
    await checkSecretSyncAvailability(actor.orgId);

    const folder = await folderDAL.findById(params.folderId);

    if (!folder) throw new BadRequestError({ message: `Could not find Folder with ID "${params.folderId}"` });

    const { permission: projectPermission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      folder.projectId,
      actor.authMethod,
      actor.orgId
    );

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(folder.projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({ message: "Project version does not support Secret Syncs" });

    ForbidOnInvalidProjectType(ProjectType.SecretManager);

    ForbiddenError.from(projectPermission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretSyncs
    );

    const appConnection = await appConnectionService.connectAppConnectionById(params.connectionId, actor);

    const destinationApp = SECRET_SYNC_CONNECTION_MAP[params.destination];

    if (appConnection.app !== destinationApp) {
      const appName = APP_CONNECTION_NAME_MAP[appConnection.app];
      throw new BadRequestError({
        message: `Invalid App Connection - Cannot sync to ${SECRET_SYNC_NAME_MAP[params.destination]} using ${
          startsWithVowel(appName) ? "an" : "a"
        } ${appName} Connection`
      });
    }

    const projectFolders = await folderDAL.findByProjectId(folder.projectId);

    const secretSync = await secretSyncDAL.transaction(async (tx) => {
      const isConflictingName = Boolean(
        (
          await secretSyncDAL.find(
            {
              name: params.name,
              $in: {
                folderId: projectFolders.map((f) => f.id)
              }
            },
            tx
          )
        ).length
      );

      if (isConflictingName)
        throw new BadRequestError({
          message: `A Secret Sync with the name "${params.name}" already exists for the project with ID "${folder.projectId}"`
        });

      const sync = await secretSyncDAL.create(params);

      return sync;
    });

    if (secretSync.isEnabled) await secretSyncQueue.queueSecretSyncById({ syncId: secretSync.id });

    return secretSync as TSecretSync;
  };

  const updateSecretSync = async ({ destination, syncId, ...params }: TUpdateSecretSyncDTO, actor: OrgServiceActor) => {
    await checkSecretSyncAvailability(actor.orgId);

    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID ${syncId}`
      });

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      secretSync.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbidOnInvalidProjectType(ProjectType.SecretManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretSyncs);

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    const updatedSecretSync = await secretSyncDAL.transaction(async (tx) => {
      if (params.folderId) {
        const newFolder = await folderDAL.findById(params.folderId);

        if (!newFolder) throw new BadRequestError({ message: `Could not find folder with ID "${params.folderId}"` });

        // TODO (scott): I don't think there's a reason we can't allow moving syncs across projects
        //  but not supporting this initially
        if (newFolder.projectId !== secretSync.projectId)
          throw new BadRequestError({
            message: `Cannot move Secret Sync to different project`
          });
      }

      if (params.name && secretSync.name !== params.name) {
        const projectFolders = await folderDAL.findByProjectId(secretSync.projectId);

        const isConflictingName = Boolean(
          (
            await secretSyncDAL.find(
              {
                name: params.name,
                $in: {
                  folderId: projectFolders.map((f) => f.id)
                }
              },
              tx
            )
          ).length
        );

        if (isConflictingName)
          throw new BadRequestError({
            message: `A Secret Sync with the name "${params.name}" already exists for project with ID "${secretSync.projectId}"`
          });
      }

      const updatedSync = await secretSyncDAL.updateById(syncId, params);

      return updatedSync;
    });

    if (updatedSecretSync.isEnabled) await secretSyncQueue.queueSecretSyncById({ syncId: secretSync.id });

    return updatedSecretSync as TSecretSync;
  };

  const deleteSecretSync = async ({ destination, syncId }: TDeleteSecretSyncDTO, actor: OrgServiceActor) => {
    await checkSecretSyncAvailability(actor.orgId);

    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      secretSync.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbidOnInvalidProjectType(ProjectType.SecretManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretSyncs);

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    await secretSyncDAL.deleteById(syncId);

    return secretSync as TSecretSync;
  };

  const triggerSecretSyncById = async (
    { syncId, destination, ...params }: TTriggerSecretSyncByIdDTO,
    actor: OrgServiceActor
  ) => {
    await checkSecretSyncAvailability(actor.orgId);

    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      secretSync.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbidOnInvalidProjectType(ProjectType.SecretManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretSyncs);

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    await secretSyncQueue.queueSecretSyncById({ syncId, ...params });

    return secretSync as TSecretSync;
  };

  const triggerSecretSyncImportById = async (
    { syncId, destination, ...params }: TTriggerSecretSyncImportByIdDTO,
    actor: OrgServiceActor
  ) => {
    await checkSecretSyncAvailability(actor.orgId);

    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      secretSync.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbidOnInvalidProjectType(ProjectType.SecretManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretSyncs);

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

    if (isSyncJobRunning)
      throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

    await secretSyncQueue.queueSecretSyncImportById({ syncId, ...params });

    return secretSync as TSecretSync;
  };

  const triggerSecretSyncEraseById = async (
    { syncId, destination, ...params }: TTriggerSecretSyncEraseByIdDTO,
    actor: OrgServiceActor
  ) => {
    await checkSecretSyncAvailability(actor.orgId);

    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      secretSync.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbidOnInvalidProjectType(ProjectType.SecretManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretSyncs);

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

    if (isSyncJobRunning)
      throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

    await secretSyncQueue.queueSecretSyncEraseById({ syncId, ...params });

    return secretSync as TSecretSync;
  };

  return {
    listSecretSyncOptions,
    listSecretSyncsByProjectId,
    findSecretSyncById,
    findSecretSyncByName,
    createSecretSync,
    updateSecretSync,
    deleteSecretSync,
    triggerSecretSyncById,
    triggerSecretSyncImportById,
    triggerSecretSyncEraseById
  };
};
