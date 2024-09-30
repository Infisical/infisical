import { ForbiddenError } from "@casl/ability";

import { TWebhooksInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { NotFoundError } from "@app/lib/errors";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TWebhookDALFactory } from "./webhook-dal";
import { decryptWebhookDetails, getWebhookPayload, triggerWebhookRequest } from "./webhook-fns";
import {
  TCreateWebhookDTO,
  TDeleteWebhookDTO,
  TListWebhookDTO,
  TTestWebhookDTO,
  TUpdateWebhookDTO
} from "./webhook-types";

type TWebhookServiceFactoryDep = {
  webhookDAL: TWebhookDALFactory;
  projectEnvDAL: TProjectEnvDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TWebhookServiceFactory = ReturnType<typeof webhookServiceFactory>;

export const webhookServiceFactory = ({
  webhookDAL,
  projectEnvDAL,
  permissionService,
  projectDAL
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks);
    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new NotFoundError({ message: "Environment not found" });

    const insertDoc: TWebhooksInsert = {
      url: "", // deprecated - we are moving away from plaintext URLs
      envId: env.id,
      isDisabled: false,
      secretPath: secretPath || "/",
      type
    };

    if (webhookSecretKey) {
      const { ciphertext, iv, tag, algorithm, encoding } = infisicalSymmetricEncypt(webhookSecretKey);
      insertDoc.encryptedSecretKey = ciphertext;
      insertDoc.iv = iv;
      insertDoc.tag = tag;
      insertDoc.algorithm = algorithm;
      insertDoc.keyEncoding = encoding;
    }

    if (webhookUrl) {
      const { ciphertext, iv, tag, algorithm, encoding } = infisicalSymmetricEncypt(webhookUrl);
      insertDoc.urlCipherText = ciphertext;
      insertDoc.urlIV = iv;
      insertDoc.urlTag = tag;
      insertDoc.algorithm = algorithm;
      insertDoc.keyEncoding = encoding;
    }

    const webhook = await webhookDAL.create(insertDoc);
    return { ...webhook, projectId, environment: env };
  };

  const updateWebhook = async ({ actorId, actor, actorOrgId, actorAuthMethod, id, isDisabled }: TUpdateWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new NotFoundError({ message: "Webhook not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      webhook.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Webhooks);

    const updatedWebhook = await webhookDAL.updateById(id, { isDisabled });
    return { ...webhook, ...updatedWebhook };
  };

  const deleteWebhook = async ({ id, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new NotFoundError({ message: "Webhook not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      webhook.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Webhooks);

    const deletedWebhook = await webhookDAL.deleteById(id);
    return { ...webhook, ...deletedWebhook };
  };

  const testWebhook = async ({ id, actor, actorId, actorAuthMethod, actorOrgId }: TTestWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new NotFoundError({ message: "Webhook not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      webhook.projectId,
      actorAuthMethod,
      actorOrgId
    );

    const project = await projectDAL.findById(webhook.projectId);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
    let webhookError: string | undefined;
    try {
      await triggerWebhookRequest(
        webhook,
        getWebhookPayload("test", {
          workspaceName: project.name,
          workspaceId: webhook.projectId,
          environment: webhook.environment.slug,
          secretPath: webhook.secretPath,
          type: webhook.type
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);

    const webhooks = await webhookDAL.findAllWebhooks(projectId, environment, secretPath);
    return webhooks.map((w) => {
      const { url } = decryptWebhookDetails(w);
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
