import { KmsDataKey, TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import {
  throwIfMissingSecretReadValueOrDescribePermission,
  TSecretsDomain
} from "@app/domains/secrets-manager/secrets/ce/module";
import { NotFoundError } from "@app/lib/errors";
import { TActorInput } from "@app/lib/types";

import { TIntegrationAuthDALFactory } from "../integration-auth/integration-auth-dal";
import { TIntegrationAuthServiceFactory } from "../integration-auth/integration-auth-service";
import { deleteIntegrationSecrets } from "../integration-auth/integration-delete-secret";
import { TOrgDALFactory } from "../org/org-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectFolderGrantDALFactory } from "../project-folder-grant/project-folder-grant-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TIntegrationDALFactory } from "./integration-dal";
import {
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
  secretsDomain: Pick<TSecretsDomain, "getSecretsPermission">;
  projectBotService: TProjectBotServiceFactory;
  secretQueueService: Pick<TSecretQueueFactory, "syncIntegrations">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findByFolderIds" | "findByFolderId">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds" | "findByIds">;
  kmsCoreDomain: TKmsCoreDomain;
  secretDAL: Pick<TSecretDALFactory, "findByFolderId">;
  projectFolderGrantDAL: Pick<TProjectFolderGrantDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
};

export type TIntegrationServiceFactory = ReturnType<typeof integrationServiceFactory>;

export const integrationServiceFactory = ({
  integrationDAL,
  integrationAuthDAL,
  folderDAL,
  secretsDomain,
  secretQueueService,
  integrationAuthService,
  projectBotService,
  secretV2BridgeDAL,
  secretImportDAL,
  kmsCoreDomain,
  secretDAL,
  projectFolderGrantDAL,
  orgDAL
}: TIntegrationServiceFactoryDep) => {
  const updateIntegration = async ({
    actor,
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

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: integration.projectId });
    permission.assert({ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Integrations });

    const newEnvironment = environment || integration.environment.slug;
    const newSecretPath = secretPath || integration.secretPath;

    if (environment || secretPath) {
      throwIfMissingSecretReadValueOrDescribePermission(
        permission.toAbility(),
        ProjectPermissionSecretActions.ReadValue,
        {
          environment: newEnvironment,
          secretPath: newSecretPath
        }
      );
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

  const getIntegration = async ({ id, actor }: TGetIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);

    if (!integration) {
      throw new NotFoundError({
        message: `Integration with ID '${id}' not found`
      });
    }

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: integration.projectId });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Integrations });

    if (!integration) {
      throw new NotFoundError({
        message: `Integration with ID '${id}' not found`
      });
    }

    return { ...integration, envId: integration.environment.id };
  };

  const getIntegrationAWSIamRole = async ({ id, actor }: TGetIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);

    if (!integration) {
      throw new NotFoundError({
        message: `Integration with ID '${id}' not found`
      });
    }

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: integration.projectId });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Integrations });

    const integrationAuth = await integrationAuthDAL.findById(integration.integrationAuthId);

    const { decryptor: secretManagerDecryptor } = await kmsCoreDomain.createCipherPairWithDataKey({
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

  const deleteIntegration = async ({ id, actor, shouldDeleteIntegrationSecrets }: TDeleteIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);
    if (!integration) throw new NotFoundError({ message: `Integration with ID '${id}' not found` });

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: integration.projectId });
    permission.assert({ action: ProjectPermissionActions.Delete, subject: ProjectPermissionSub.Integrations });

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
        kmsCoreDomain,
        projectFolderGrantDAL,
        orgDAL,
        actorOrgId: actor.org.id
      });
    }

    const deletedIntegration = await integrationDAL.deleteById(id);
    return { ...integration, ...deletedIntegration };
  };

  const listIntegrationByProject = async ({ actor, projectId }: { projectId: string } & TActorInput) => {
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Integrations });

    const integrations = await integrationDAL.findByProjectId(projectId);
    return integrations;
  };

  const syncIntegration = async ({ id, actor }: TSyncIntegrationDTO) => {
    const integration = await integrationDAL.findById(id);
    if (!integration) {
      throw new NotFoundError({ message: `Integration with ID '${id}' not found` });
    }

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: integration.projectId });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Integrations });

    await secretQueueService.syncIntegrations({
      isManual: true,
      actorId: actor.principal.id,
      environment: integration.environment.slug,
      secretPath: integration.secretPath,
      projectId: integration.projectId
    });

    return { ...integration, envId: integration.environment.id };
  };

  return {
    updateIntegration,
    deleteIntegration,
    listIntegrationByProject,
    getIntegration,
    getIntegrationAWSIamRole,
    syncIntegration
  };
};
