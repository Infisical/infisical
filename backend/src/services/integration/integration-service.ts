import { ForbiddenError, subject } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";

import { TIntegrationAuthDALFactory } from "../integration-auth/integration-auth-dal";
import { TIntegrationAuthServiceFactory } from "../integration-auth/integration-auth-service";
import { deleteIntegrationSecrets } from "../integration-auth/integration-delete-secret";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TIntegrationDALFactory } from "./integration-dal";
import {
  TCreateIntegrationDTO,
  TDeleteIntegrationDTO,
  TGetIntegrationDTO,
  TSyncIntegrationDTO,
  TUpdateIntegrationDTO
} from "./integration-types";

type TIntegrationServiceFactoryDep = {
  integrationDAL: TIntegrationDALFactory;
  integrationAuthDAL: TIntegrationAuthDALFactory;
  integrationAuthService: TIntegrationAuthServiceFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findByManySecretPath">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectBotService: TProjectBotServiceFactory;
  secretQueueService: Pick<TSecretQueueFactory, "syncIntegrations">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findByFolderId">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretDAL: Pick<TSecretDALFactory, "findByFolderId">;
};

export type TIntegrationServiceFactory = ReturnType<typeof integrationServiceFactory>;

export const integrationServiceFactory = ({
  integrationDAL,
  integrationAuthDAL,
  folderDAL,
  permissionService,
  secretQueueService,
  integrationAuthService,
  projectBotService,
  secretV2BridgeDAL,
  secretImportDAL,
  kmsService,
  secretDAL
}: TIntegrationServiceFactoryDep) => {
  const createIntegration = async ({
    app,
    actor,
    actorOrgId,
    path,
    appId,
    owner,
    scope,
    actorId,
    region,
    url,
    isActive,
    metadata,
    secretPath,
    targetService,
    actorAuthMethod,
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
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment: sourceEnvironment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(integrationAuth.projectId, sourceEnvironment, secretPath);
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
      url,
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
    actorOrgId,
    actorAuthMethod,
    targetEnvironment,
    app,
    id,
    appId,
    owner,
    isActive,
    environment,
    secretPath,
    metadata
  }: TUpdateIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);
    if (!integration) throw new BadRequestError({ message: "Integration auth not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integration.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
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
      secretPath,
      metadata: {
        ...(integration.metadata as object),
        ...metadata
      }
    });

    await secretQueueService.syncIntegrations({
      environment: folder.environment.slug,
      secretPath,
      projectId: folder.projectId
    });

    return updatedIntegration;
  };

  const getIntegration = async ({ id, actor, actorAuthMethod, actorId, actorOrgId }: TGetIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integration?.projectId || "",
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    if (!integration) {
      throw new NotFoundError({
        message: "Integration not found"
      });
    }

    return { ...integration, envId: integration.environment.id };
  };

  const deleteIntegration = async ({
    actorId,
    id,
    actor,
    actorAuthMethod,
    actorOrgId,
    shouldDeleteIntegrationSecrets
  }: TDeleteIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);
    if (!integration) throw new BadRequestError({ message: "Integration auth not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integration.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations);

    const integrationAuth = await integrationAuthDAL.findById(integration.integrationAuthId);

    if (shouldDeleteIntegrationSecrets) {
      await deleteIntegrationSecrets({
        integration,
        integrationAuth,
        projectBotService,
        integrationAuthService,
        secretV2BridgeDAL,
        folderDAL,
        secretImportDAL,
        secretDAL,
        kmsService
      });
    }

    const deletedIntegration = await integrationDAL.transaction(async (tx) => {
      // delete integration
      const deletedIntegrationResult = await integrationDAL.deleteById(id, tx);

      // check if there are other integrations that share the same integration auth
      const integrations = await integrationDAL.find(
        {
          integrationAuthId: integration.integrationAuthId
        },
        tx
      );

      if (integrations.length === 0) {
        // no other integration shares the same integration auth
        // -> delete the integration auth
        await integrationAuthDAL.deleteById(integration.integrationAuthId, tx);
      }

      return deletedIntegrationResult;
    });

    return { ...integration, ...deletedIntegration };
  };

  const listIntegrationByProject = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    const integrations = await integrationDAL.findByProjectId(projectId);
    return integrations;
  };

  const syncIntegration = async ({ id, actorId, actor, actorOrgId, actorAuthMethod }: TSyncIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);
    if (!integration) {
      throw new BadRequestError({ message: "Integration not found" });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integration.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    await secretQueueService.syncIntegrations({
      isManual: true,
      actorId,
      environment: integration.environment.slug,
      secretPath: integration.secretPath,
      projectId: integration.projectId
    });

    return { ...integration, envId: integration.environment.id };
  };

  return {
    createIntegration,
    updateIntegration,
    deleteIntegration,
    listIntegrationByProject,
    getIntegration,
    syncIntegration
  };
};
