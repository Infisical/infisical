import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";

import { TIntegrationAuthDALFactory } from "../integration-auth/integration-auth-dal";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TIntegrationDALFactory } from "./integration-dal";
import {
  TCreateIntegrationDTO,
  TDeleteIntegrationDTO,
  TUpdateIntegrationDTO
} from "./integration-types";

type TIntegrationServiceFactoryDep = {
  integrationDAL: TIntegrationDALFactory;
  integrationAuthDAL: TIntegrationAuthDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretQueueService: Pick<TSecretQueueFactory, "syncIntegrations">;
};

export type TIntegrationServiceFactory = ReturnType<typeof integrationServiceFactory>;

export const integrationServiceFactory = ({
  integrationDAL,
  integrationAuthDAL,
  folderDAL,
  permissionService,
  secretQueueService
}: TIntegrationServiceFactoryDep) => {
  const createIntegration = async ({
    app,
    actor,
    path,
    appId,
    owner,
    scope,
    actorId,
    region,
    isActive,
    metadata,
    secretPath,
    targetService,
    targetServiceId,
    integrationAuthId,
    sourceEnvironment,
    targetEnvironment,
    targetEnvironmentId
  }: TCreateIntegrationDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(integrationAuthId);
    if (!integrationAuth) throw new BadRequestError({ message: "Integration auth not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Integrations
    );

    const folder = await folderDAL.findBySecretPath(
      integrationAuth.projectId,
      sourceEnvironment,
      secretPath
    );
    if (!folder) throw new BadRequestError({ message: "Folder path not found" });

    const integration = await integrationDAL.create({
      envId: folder.envId,
      secretPath,
      isActive,
      integrationAuthId,
      targetEnvironmentId,
      targetEnvironment,
      targetServiceId,
      targetService,
      metadata,
      region,
      scope,
      owner,
      appId,
      path,
      app,
      integration: integrationAuth.integration
    });

    await secretQueueService.syncIntegrations({
      environment: sourceEnvironment,
      secretPath,
      projectId: integrationAuth.projectId
    });
    return { integration, integrationAuth };
  };

  const updateIntegration = async ({
    actorId,
    actor,
    targetEnvironment,
    app,
    id,
    appId,
    owner,
    isActive,
    environment,
    secretPath
  }: TUpdateIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);
    if (!integration) throw new BadRequestError({ message: "Integration auth not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integration.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Integrations
    );

    const folder = await folderDAL.findBySecretPath(integration.projectId, environment, secretPath);
    if (!folder) throw new BadRequestError({ message: "Folder path not found" });

    const updatedIntegration = await integrationDAL.updateById(id, {
      envId: folder.envId,
      isActive,
      app,
      appId,
      targetEnvironment,
      owner,
      secretPath
    });

    return updatedIntegration;
  };

  const deleteIntegration = async ({ actorId, id, actor }: TDeleteIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);
    if (!integration) throw new BadRequestError({ message: "Integration auth not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integration.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.Integrations
    );

    const deletedIntegration = await integrationDAL.deleteById(id);
    return { ...integration, ...deletedIntegration };
  };

  const listIntegrationByProject = async ({ actor, actorId, projectId }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );

    const integrations = await integrationDAL.findByProjectId(projectId);
    return integrations;
  };

  return {
    createIntegration,
    updateIntegration,
    deleteIntegration,
    listIntegrationByProject
  };
};
