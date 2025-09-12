import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";

import { TIntegrationAuthDALFactory } from "../integration-auth/integration-auth-dal";
import { TIntegrationAuthServiceFactory } from "../integration-auth/integration-auth-service";
import { deleteIntegrationSecrets } from "../integration-auth/integration-delete-secret";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretQueueFactory } from "../secret/secret-types";
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
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds" | "findByIds">;
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
    if (!integrationAuth)
      throw new NotFoundError({ message: `Integration auth with ID '${integrationAuthId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);

    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
      environment: sourceEnvironment,
      secretPath
    });

    const folder = await folderDAL.findBySecretPath(integrationAuth.projectId, sourceEnvironment, secretPath);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' not found in environment with slug'${sourceEnvironment}'`
      });
    }

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
    return {
      integration: {
        ...integration,
        environment: folder.environment
      },
      integrationAuth
    };
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
    region,
    metadata,
    path
  }: TUpdateIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);
    if (!integration) throw new NotFoundError({ message: `Integration with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integration.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);

    const newEnvironment = environment || integration.environment.slug;
    const newSecretPath = secretPath || integration.secretPath;

    if (environment || secretPath) {
      throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
        environment: newEnvironment,
        secretPath: newSecretPath
      });
    }

    const folder = await folderDAL.findBySecretPath(integration.projectId, newEnvironment, newSecretPath);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder with path '${newSecretPath}' not found in environment with slug '${newEnvironment}'`
      });
    }

    const updatedIntegration = await integrationDAL.updateById(id, {
      envId: folder.envId,
      isActive,
      app,
      appId,
      targetEnvironment,
      owner,
      region,
      secretPath,
      path,
      metadata: {
        ...(integration.metadata as object),
        ...metadata
      }
    });

    await secretQueueService.syncIntegrations({
      environment: folder.environment.slug,
      secretPath: newSecretPath,
      projectId: folder.projectId
    });

    return {
      ...updatedIntegration,
      environment: folder.environment
    };
  };

  const getIntegration = async ({ id, actor, actorAuthMethod, actorId, actorOrgId }: TGetIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);

    if (!integration) {
      throw new NotFoundError({
        message: `Integration with ID '${id}' not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integration.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    if (!integration) {
      throw new NotFoundError({
        message: `Integration with ID '${id}' not found`
      });
    }

    return { ...integration, envId: integration.environment.id };
  };

  const getIntegrationAWSIamRole = async ({ id, actor, actorAuthMethod, actorId, actorOrgId }: TGetIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);

    if (!integration) {
      throw new NotFoundError({
        message: `Integration with ID '${id}' not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integration.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    const integrationAuth = await integrationAuthDAL.findById(integration.integrationAuthId);

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: integration.projectId
    });
    let awsIamRole: string | null = null;
    if (integrationAuth.encryptedAwsAssumeIamRoleArn) {
      const awsAssumeRoleArn = secretManagerDecryptor({
        cipherTextBlob: Buffer.from(integrationAuth.encryptedAwsAssumeIamRoleArn)
      }).toString();
      if (awsAssumeRoleArn) {
        const [, role] = awsAssumeRoleArn.split(":role/");
        awsIamRole = role;
      }
    }

    return {
      role: awsIamRole
    };
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
    if (!integration) throw new NotFoundError({ message: `Integration with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integration.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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

    const deletedIntegration = await integrationDAL.deleteById(id);
    return { ...integration, ...deletedIntegration };
  };

  const listIntegrationByProject = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    const integrations = await integrationDAL.findByProjectId(projectId);
    return integrations;
  };

  const syncIntegration = async ({ id, actorId, actor, actorOrgId, actorAuthMethod }: TSyncIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);
    if (!integration) {
      throw new NotFoundError({ message: `Integration with ID '${id}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integration.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    getIntegrationAWSIamRole,
    syncIntegration
  };
};
