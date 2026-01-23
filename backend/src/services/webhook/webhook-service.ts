import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { TWebhooksInsert } from "@app/db/schemas/webhooks";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TWebhookDALFactory } from "./webhook-dal";
import { decryptWebhookDetails, getWebhookPayload, triggerWebhookRequest } from "./webhook-fns";
import {
  TCreateWebhookDTO,
  TDeleteWebhookDTO,
  TListWebhookDTO,
  TTestWebhookDTO,
  TUpdateWebhookDTO,
  WebhookEvents
} from "./webhook-types";

type TWebhookServiceFactoryDep = {
  webhookDAL: TWebhookDALFactory;
  projectEnvDAL: TProjectEnvDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TWebhookServiceFactory = ReturnType<typeof webhookServiceFactory>;

export const webhookServiceFactory = ({
  webhookDAL,
  projectEnvDAL,
  permissionService,
  projectDAL,
  kmsService
}: TWebhookServiceFactoryDep) => {
  const createWebhook = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    webhookUrl,
    environment,
    secretPath,
    webhookSecretKey,
    type
  }: TCreateWebhookDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks);
    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env)
      throw new NotFoundError({
        message: `Environment with slug '${environment}' in project with ID '${projectId}' not found`
      });

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const insertDoc: TWebhooksInsert = {
      envId: env.id,
      isDisabled: false,
      secretPath: secretPath || "/",
      type,
      encryptedUrl: secretManagerEncryptor({ plainText: Buffer.from(webhookUrl) }).cipherTextBlob
    };

    if (webhookSecretKey) {
      insertDoc.encryptedPassKey = secretManagerEncryptor({ plainText: Buffer.from(webhookSecretKey) }).cipherTextBlob;
    }

    const webhook = await webhookDAL.create(insertDoc);
    return { ...webhook, projectId, environment: env };
  };

  const updateWebhook = async ({ actorId, actor, actorOrgId, actorAuthMethod, id, isDisabled }: TUpdateWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new NotFoundError({ message: `Webhook with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: webhook.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Webhooks);

    const updatedWebhook = await webhookDAL.updateById(id, { isDisabled });
    return { ...webhook, ...updatedWebhook };
  };

  const deleteWebhook = async ({ id, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new NotFoundError({ message: `Webhook with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: webhook.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Webhooks);

    const deletedWebhook = await webhookDAL.deleteById(id);
    return { ...webhook, ...deletedWebhook };
  };

  const testWebhook = async ({ id, actor, actorId, actorAuthMethod, actorOrgId }: TTestWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new NotFoundError({ message: `Webhook with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: webhook.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    const project = await projectDAL.findById(webhook.projectId);
    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: project.id
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
    let webhookError: string | undefined;
    try {
      await triggerWebhookRequest(
        webhook,
        (value) => secretManagerDecryptor({ cipherTextBlob: value }).toString(),
        getWebhookPayload({
          type: "test" as WebhookEvents.SecretModified,
          payload: {
            projectName: project.name,
            projectId: webhook.projectId,
            environment: webhook.environment.slug,
            secretPath: webhook.secretPath,
            type: webhook.type
          }
        })
      );
    } catch (err) {
      webhookError = (err as Error).message;
    }
    const isSuccess = !webhookError;
    const updatedWebhook = await webhookDAL.updateById(webhook.id, {
      lastStatus: isSuccess ? "success" : "failed",
      lastRunErrorMessage: isSuccess ? null : webhookError
    });
    return { ...webhook, ...updatedWebhook };
  };

  const listWebhooks = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    secretPath,
    environment
  }: TListWebhookDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);

    const webhooks = await webhookDAL.findAllWebhooks(projectId, environment, secretPath);
    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    return webhooks.map((w) => {
      const { url } = decryptWebhookDetails(w, (value) => secretManagerDecryptor({ cipherTextBlob: value }).toString());
      return {
        ...w,
        url
      };
    });
  };

  return {
    createWebhook,
    deleteWebhook,
    listWebhooks,
    updateWebhook,
    testWebhook
  };
};
