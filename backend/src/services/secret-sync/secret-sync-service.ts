import { ForbiddenError } from "@casl/ability";

import { ProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { startsWithVowel } from "@app/lib/fn";
import { OrgServiceActor } from "@app/lib/types";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { listSecretSyncOptions } from "@app/services/secret-sync/secret-sync-fns";
import {
  SecretSyncStatus,
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
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findById">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  secretSyncQueue: Pick<
    TSecretSyncQueueFactory,
    "queueSecretSyncById" | "queueSecretSyncImportById" | "queueSecretSyncEraseById"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">; // TODO: remove once launched
};

export type TSecretSyncServiceFactory = ReturnType<typeof secretSyncServiceFactory>;

export const secretSyncServiceFactory = ({
  secretSyncDAL,
  projectEnvDAL,
  folderDAL,
  licenseService,
  permissionService,
  appConnectionService,
  projectBotService,
  secretSyncQueue
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

    const environments = await projectEnvDAL.find({ projectId });

    const secretSyncs = await secretSyncDAL.find({
      ...(destination && { destination }),
      $in: {
        envId: environments.map((env) => env.id)
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

    const environments = await projectEnvDAL.find({ projectId });

    // we prevent conflicting names within a project so this will only return one at most
    const [secretSync] = await secretSyncDAL.find({
      name: syncName,
      $in: {
        envId: environments.map((env) => env.id)
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

    const environment = await projectEnvDAL.findById(params.envId);

    if (!environment) throw new BadRequestError({ message: `Could not find Environment with ID "${params.envId}"` });

    const { permission: projectPermission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      environment.projectId,
      actor.authMethod,
      actor.orgId
    );

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(environment.projectId);

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

    const folder = await folderDAL.findBySecretPath(environment.projectId, environment.slug, params.secretPath);

    if (!folder)
      throw new BadRequestError({
        message: `Secret path "${params.secretPath}" does not exist for project with ID "${environment.projectId}"`
      });

    const projectEnvironments = await projectEnvDAL.find({
      projectId: environment.projectId
    });

    const secretSync = await secretSyncDAL.transaction(async (tx) => {
      const isConflictingName = Boolean(
        (
          await secretSyncDAL.find(
            {
              name: params.name,
              $in: {
                envId: projectEnvironments.map((env) => env.id)
              }
            },
            tx
          )
        ).length
      );

      if (isConflictingName)
        throw new BadRequestError({
          message: `A Secret Sync with the name "${params.name}" already exists for the project with ID "${environment.projectId}"`
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
      const isUpdatedEnv = Boolean(params.envId && secretSync.envId !== params.envId);
      const isUpdatedSecretPath = Boolean(params.secretPath && secretSync.secretPath !== params.secretPath);

      if (isUpdatedEnv || isUpdatedSecretPath) {
        const environment = await projectEnvDAL.findById(params.envId ?? secretSync.envId);

        if (!environment)
          throw new BadRequestError({ message: `Could not find environment with ID "${params.envId}"` });

        // TODO (scott): I don't think there's a reason we can't allow moving syncs across projects
        //  but not supporting this initially
        if (environment.projectId !== secretSync.projectId)
          throw new BadRequestError({
            message: `Environment with ID "${params.envId}" is not within project with ID "${secretSync.projectId}"`
          });

        const folder = await folderDAL.findBySecretPath(
          secretSync.projectId,
          environment.slug,
          params.secretPath ?? secretSync.secretPath
        );

        if (!folder)
          throw new BadRequestError({
            message: `Secret path "${params.secretPath}" does not exist for project with ID "${secretSync.projectId}" in environment with ID "${environment.id}"`
          });
      }

      if (params.name && secretSync.name !== params.name) {
        const projectEnvironments = await projectEnvDAL.find({
          projectId: secretSync.projectId
        });

        const isConflictingName = Boolean(
          (
            await secretSyncDAL.find(
              {
                name: params.name,
                $in: {
                  envId: projectEnvironments.map((env) => env.id)
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

    const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
      syncStatus: SecretSyncStatus.Pending
    });

    return updatedSecretSync as TSecretSync;
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

    await secretSyncQueue.queueSecretSyncImportById({ syncId, ...params });

    const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
      importStatus: SecretSyncStatus.Pending
    });

    return updatedSecretSync as TSecretSync;
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

    await secretSyncQueue.queueSecretSyncEraseById({ syncId, ...params });

    const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
      eraseStatus: SecretSyncStatus.Pending
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
    triggerSecretSyncById,
    triggerSecretSyncImportById,
    triggerSecretSyncEraseById
  };
};
