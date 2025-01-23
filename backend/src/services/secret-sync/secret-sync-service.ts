import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { listSecretSyncOptions } from "@app/services/secret-sync/secret-sync-fns";
import {
  SecretSyncStatus,
  TCreateSecretSyncDTO,
  TDeleteSecretSyncDTO,
  TFindSecretSyncByIdDTO,
  TFindSecretSyncByNameDTO,
  TListSecretSyncsByProjectId,
  TSecretSync,
  TTriggerSecretSyncImportSecretsByIdDTO,
  TTriggerSecretSyncRemoveSecretsByIdDTO,
  TTriggerSecretSyncSyncSecretsByIdDTO,
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
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId" | "findById" | "findBySecretPath">;
  keyStore: Pick<TKeyStoreFactory, "getItem">;
  secretSyncQueue: Pick<
    TSecretSyncQueueFactory,
    "queueSecretSyncSyncSecretsById" | "queueSecretSyncImportSecretsById" | "queueSecretSyncRemoveSecretsById"
  >;
};

export type TSecretSyncServiceFactory = ReturnType<typeof secretSyncServiceFactory>;

export const secretSyncServiceFactory = ({
  secretSyncDAL,
  folderDAL,
  permissionService,
  appConnectionService,
  projectBotService,
  secretSyncQueue,
  keyStore
}: TSecretSyncServiceFactoryDep) => {
  const listSecretSyncsByProjectId = async (
    { projectId, destination }: TListSecretSyncsByProjectId,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSub.SecretSyncs
    );

    const secretSyncs = await secretSyncDAL.find({
      ...(destination && { destination }),
      projectId
    });

    return secretSyncs as TSecretSync[];
  };

  const findSecretSyncById = async ({ destination, syncId }: TFindSecretSyncByIdDTO, actor: OrgServiceActor) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSub.SecretSyncs
    );

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

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSub.SecretSyncs
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    return secretSync as TSecretSync;
  };

  const createSecretSync = async (
    { projectId, secretPath, environment, ...params }: TCreateSecretSyncDTO,
    actor: OrgServiceActor
  ) => {
    const { permission: projectPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({ message: "Project version does not support Secret Syncs" });

    ForbiddenError.from(projectPermission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Create,
      ProjectPermissionSub.SecretSyncs
    );

    ForbiddenError.from(projectPermission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath
      })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);

    if (!folder)
      throw new BadRequestError({
        message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${projectId}"`
      });

    const destinationApp = SECRET_SYNC_CONNECTION_MAP[params.destination];

    // validates permission to connect and app is valid for sync destination
    await appConnectionService.connectAppConnectionById(destinationApp, params.connectionId, actor);

    const secretSync = await secretSyncDAL.transaction(async (tx) => {
      const isConflictingName = Boolean(
        (
          await secretSyncDAL.find(
            {
              name: params.name,
              projectId
            },
            tx
          )
        ).length
      );

      if (isConflictingName)
        throw new BadRequestError({
          message: `A Secret Sync with the name "${params.name}" already exists for the project with ID "${folder.projectId}"`
        });

      const sync = await secretSyncDAL.create({
        folderId: folder.id,
        ...params,
        ...(params.isAutoSyncEnabled && { syncStatus: SecretSyncStatus.Pending }),
        projectId
      });

      return sync;
    });

    if (secretSync.isAutoSyncEnabled) await secretSyncQueue.queueSecretSyncSyncSecretsById({ syncId: secretSync.id });

    return secretSync as TSecretSync;
  };

  const updateSecretSync = async (
    { destination, syncId, secretPath, environment, ...params }: TUpdateSecretSyncDTO,
    actor: OrgServiceActor
  ) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID ${syncId}`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Edit,
      ProjectPermissionSub.SecretSyncs
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    const updatedSecretSync = await secretSyncDAL.transaction(async (tx) => {
      let { folderId } = secretSync;

      if (params.connectionId) {
        const destinationApp = SECRET_SYNC_CONNECTION_MAP[secretSync.destination as SecretSync];

        // validates permission to connect and app is valid for sync destination
        await appConnectionService.connectAppConnectionById(destinationApp, params.connectionId, actor);
      }

      if (
        (secretPath && secretPath !== secretSync.folder?.path) ||
        (environment && environment !== secretSync.environment?.slug)
      ) {
        const updatedEnvironment = environment ?? secretSync.environment?.slug;
        const updatedSecretPath = secretPath ?? secretSync.folder?.path;

        if (!updatedEnvironment || !updatedSecretPath)
          throw new BadRequestError({ message: "Must specify both source environment and secret path" });

        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, {
            environment: updatedEnvironment,
            secretPath: updatedSecretPath
          })
        );

        const newFolder = await folderDAL.findBySecretPath(secretSync.projectId, updatedEnvironment, updatedSecretPath);

        if (!newFolder)
          throw new BadRequestError({
            message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${secretSync.projectId}"`
          });

        folderId = newFolder.id;
      }

      if (params.name && secretSync.name !== params.name) {
        const isConflictingName = Boolean(
          (
            await secretSyncDAL.find(
              {
                name: params.name,
                projectId: secretSync.projectId
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

      const isAutoSyncEnabled = params.isAutoSyncEnabled ?? secretSync.isAutoSyncEnabled;

      const updatedSync = await secretSyncDAL.updateById(syncId, {
        ...params,
        ...(isAutoSyncEnabled && folderId && { syncStatus: SecretSyncStatus.Pending }),
        folderId
      });

      return updatedSync;
    });

    if (updatedSecretSync.isAutoSyncEnabled)
      await secretSyncQueue.queueSecretSyncSyncSecretsById({ syncId: secretSync.id });

    return updatedSecretSync as TSecretSync;
  };

  const deleteSecretSync = async (
    { destination, syncId, removeSecrets }: TDeleteSecretSyncDTO,
    actor: OrgServiceActor
  ) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Delete,
      ProjectPermissionSub.SecretSyncs
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    if (removeSecrets) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.RemoveSecrets,
        ProjectPermissionSub.SecretSyncs
      );

      if (!secretSync.folderId)
        throw new BadRequestError({
          message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
        });

      const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

      if (isSyncJobRunning)
        throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

      await secretSyncQueue.queueSecretSyncRemoveSecretsById({ syncId, deleteSyncOnComplete: true });

      const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
        removeStatus: SecretSyncStatus.Pending
      });

      return updatedSecretSync;
    }

    await secretSyncDAL.deleteById(syncId);

    return secretSync as TSecretSync;
  };

  const triggerSecretSyncSyncSecretsById = async (
    { syncId, destination, ...params }: TTriggerSecretSyncSyncSecretsByIdDTO,
    actor: OrgServiceActor
  ) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.SyncSecrets,
      ProjectPermissionSub.SecretSyncs
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    if (!secretSync.folderId)
      throw new BadRequestError({
        message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
      });

    const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

    if (isSyncJobRunning)
      throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

    await secretSyncQueue.queueSecretSyncSyncSecretsById({ syncId, ...params });

    const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
      syncStatus: SecretSyncStatus.Pending
    });

    return updatedSecretSync as TSecretSync;
  };

  const triggerSecretSyncImportSecretsById = async (
    { syncId, destination, ...params }: TTriggerSecretSyncImportSecretsByIdDTO,
    actor: OrgServiceActor
  ) => {
    if (!listSecretSyncOptions().find((option) => option.destination === destination)?.canImportSecrets) {
      throw new BadRequestError({
        message: `${SECRET_SYNC_NAME_MAP[destination]} does not support importing secrets.`
      });
    }

    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.ImportSecrets,
      ProjectPermissionSub.SecretSyncs
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    if (!secretSync.folderId)
      throw new BadRequestError({
        message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
      });

    const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

    if (isSyncJobRunning)
      throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

    await secretSyncQueue.queueSecretSyncImportSecretsById({ syncId, ...params });

    const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
      importStatus: SecretSyncStatus.Pending
    });

    return updatedSecretSync as TSecretSync;
  };

  const triggerSecretSyncRemoveSecretsById = async (
    { syncId, destination, ...params }: TTriggerSecretSyncRemoveSecretsByIdDTO,
    actor: OrgServiceActor
  ) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.RemoveSecrets,
      ProjectPermissionSub.SecretSyncs
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    if (!secretSync.folderId)
      throw new BadRequestError({
        message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
      });

    const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

    if (isSyncJobRunning)
      throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

    await secretSyncQueue.queueSecretSyncRemoveSecretsById({ syncId, ...params });

    const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
      removeStatus: SecretSyncStatus.Pending
    });

    return updatedSecretSync as TSecretSync;
  };

  return {
    listSecretSyncOptions,
    listSecretSyncsByProjectId,
    findSecretSyncById,
    findSecretSyncByName,
    createSecretSync,
    updateSecretSync,
    deleteSecretSync,
    triggerSecretSyncSyncSecretsById,
    triggerSecretSyncImportSecretsById,
    triggerSecretSyncRemoveSecretsById
  };
};
