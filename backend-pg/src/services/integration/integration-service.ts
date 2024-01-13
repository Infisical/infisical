import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";

import { TIntegrationAuthDalFactory } from "../integration-auth/integration-auth-dal";
import { TSecretFolderDalFactory } from "../secret-folder/secret-folder-dal";
import { TIntegrationDalFactory } from "./integration-dal";
import {
  TCreateIntegrationDTO,
  TDeleteIntegrationDTO,
  TUpdateIntegrationDTO
} from "./integration-types";

type TIntegrationServiceFactoryDep = {
  integrationDal: TIntegrationDalFactory;
  integrationAuthDal: TIntegrationAuthDalFactory;
  folderDal: Pick<TSecretFolderDalFactory, "findBySecretPath">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TIntegrationServiceFactory = ReturnType<typeof integrationServiceFactory>;

export const integrationServiceFactory = ({
  integrationDal,
  integrationAuthDal,
  folderDal,
  permissionService
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
    const integrationAuth = await integrationAuthDal.findById(integrationAuthId);
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

    const folder = await folderDal.findBySecretPath(
      integrationAuth.projectId,
      sourceEnvironment,
      secretPath
    );
    if (!folder) throw new BadRequestError({ message: "Folder path not found" });

    const integration = await integrationDal.create({
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
    const integration = await integrationDal.findById(id);
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

    const folder = await folderDal.findBySecretPath(integration.projectId, environment, secretPath);
    if (!folder) throw new BadRequestError({ message: "Folder path not found" });

    const updatedIntegration = await integrationDal.updateById(id, {
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
    const integration = await integrationDal.findById(id);
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

    const deletedIntegration = await integrationDal.deleteById(id);
    return { ...integration, ...deletedIntegration };
  };

  const listIntegrationByProject = async ({ actor, actorId, projectId }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Integrations
    );

    const integrations = await integrationDal.findByProjectId(projectId);
    return integrations;
  };

  return {
    createIntegration,
    updateIntegration,
    deleteIntegration,
    listIntegrationByProject
  };
};
