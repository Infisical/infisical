import { ForbiddenError } from "@casl/ability";

import { SecretEncryptionAlgo, SecretKeyEncoding, TWebhooksInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { encryptSymmetric, encryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";

import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TWebhookDALFactory } from "./webhook-dal";
import { getWebhookPayload, triggerWebhookRequest } from "./webhook-fns";
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
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TWebhookServiceFactory = ReturnType<typeof webhookServiceFactory>;

export const webhookServiceFactory = ({
  webhookDAL,
  projectEnvDAL,
  permissionService
}: TWebhookServiceFactoryDep) => {
  const createWebhook = async ({
    actor,
    actorId,
    projectId,
    webhookUrl,
    environment,
    secretPath,
    webhookSecretKey
  }: TCreateWebhookDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Webhooks
    );
    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new BadRequestError({ message: "Env not found" });

    const insertDoc: TWebhooksInsert = {
      url: webhookUrl,
      envId: env.id,
      isDisabled: false,
      secretPath: secretPath || "/"
    };
    if (webhookSecretKey) {
      const appCfg = getConfig();
      const encryptionKey = appCfg.ENCRYPTION_KEY;
      const rootEncryptionKey = appCfg.ROOT_ENCRYPTION_KEY;
      if (rootEncryptionKey) {
        const { ciphertext, iv, tag } = encryptSymmetric(webhookSecretKey, rootEncryptionKey);
        insertDoc.encryptedSecretKey = ciphertext;
        insertDoc.iv = iv;
        insertDoc.tag = tag;
        insertDoc.algorithm = SecretEncryptionAlgo.AES_256_GCM;
        insertDoc.keyEncoding = SecretKeyEncoding.BASE64;
      } else if (encryptionKey) {
        const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8(
          webhookSecretKey,
          encryptionKey
        );
        insertDoc.encryptedSecretKey = ciphertext;
        insertDoc.iv = iv;
        insertDoc.tag = tag;
        insertDoc.algorithm = SecretEncryptionAlgo.AES_256_GCM;
        insertDoc.keyEncoding = SecretKeyEncoding.UTF8;
      }
    }

    const webhook = await webhookDAL.create(insertDoc);
    return { ...webhook, projectId, environment: env };
  };

  const updateWebhook = async ({ actorId, actor, id, isDisabled }: TUpdateWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new BadRequestError({ message: "Webhook not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      webhook.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Webhooks
    );

    const updatedWebhook = await webhookDAL.updateById(id, { isDisabled });
    return { ...webhook, ...updatedWebhook };
  };

  const deleteWebhook = async ({ id, actor, actorId }: TDeleteWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new BadRequestError({ message: "Webhook not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      webhook.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.Webhooks
    );

    const deletedWebhook = await webhookDAL.deleteById(id);
    return { ...webhook, ...deletedWebhook };
  };

  const testWebhook = async ({ id, actor, actorId }: TTestWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new BadRequestError({ message: "Webhook not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      webhook.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Webhooks
    );

    let webhookError: string | undefined;
    try {
      await triggerWebhookRequest(
        webhook,
        getWebhookPayload("test", webhook.projectId, webhook.environment.slug, webhook.secretPath)
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
    projectId,
    secretPath,
    environment
  }: TListWebhookDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Webhooks
    );

    return webhookDAL.findAllWebhooks(projectId, environment, secretPath);
  };

  return {
    createWebhook,
    deleteWebhook,
    listWebhooks,
    updateWebhook,
    testWebhook
  };
};
