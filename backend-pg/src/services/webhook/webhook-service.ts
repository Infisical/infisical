import { ForbiddenError } from "@casl/ability";
import picomatch from "picomatch";

import { SecretEncryptionAlgo, SecretKeyEncoding, TWebhooksInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { encryptSymmetric, encryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";

import { TProjectEnvDalFactory } from "../project-env/project-env-dal";
import { TWebhookDalFactory } from "./webhook-dal";
import { getWebhookPayload, triggerWebhookRequest } from "./webhook-fns";
import {
  TCreateWebhookDTO,
  TDeleteWebhookDTO,
  TFnTriggerWebhookDTO,
  TListWebhookDTO,
  TTestWebhookDTO,
  TUpdateWebhookDTO
} from "./webhook-types";

type TWebhookServiceFactoryDep = {
  webhookDal: TWebhookDalFactory;
  projectEnvDal: TProjectEnvDalFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TWebhookServiceFactory = ReturnType<typeof webhookServiceFactory>;

export const webhookServiceFactory = ({
  webhookDal,
  projectEnvDal,
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
    const env = await projectEnvDal.findOne({ projectId, slug: environment });
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

    const webhook = await webhookDal.create(insertDoc);
    // TODO(akhilmhdh-pg): add audit log
    return { ...webhook, projectId, environment: env };
  };

  const updateWebhook = async ({ actorId, actor, id, isDisabled }: TUpdateWebhookDTO) => {
    const webhook = await webhookDal.findById(id);
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

    const updatedWebhook = await webhookDal.updateById(id, { isDisabled });
    return { ...webhook, ...updatedWebhook };
  };

  const deleteWebhook = async ({ id, actor, actorId }: TDeleteWebhookDTO) => {
    const webhook = await webhookDal.findById(id);
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

    const deletedWebhook = await webhookDal.deleteById(id);
    return { ...webhook, ...deletedWebhook };
  };

  const testWebhook = async ({ id, actor, actorId }: TTestWebhookDTO) => {
    const webhook = await webhookDal.findById(id);
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
    const updatedWebhook = await webhookDal.updateById(webhook.id, {
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

    return webhookDal.findAllWebhooks(projectId, environment, secretPath);
  };

  // this is reusable function
  // used in secret queue to trigger webhook and update status when secrets changes
  const fnTriggerWebhook = async ({ environment, secretPath, projectId }: TFnTriggerWebhookDTO) => {
    const webhooks = await webhookDal.findAllWebhooks(projectId, environment);
    const toBeTriggeredHooks = webhooks.filter(
      ({ secretPath: hookSecretPath, isDisabled }) =>
        !isDisabled && picomatch.isMatch(secretPath, hookSecretPath, { strictSlashes: false })
    );
    if (!toBeTriggeredHooks.length) return;
    const webhooksTriggered = await Promise.allSettled(
      toBeTriggeredHooks.map((hook) =>
        triggerWebhookRequest(
          hook,
          getWebhookPayload("secrets.modified", projectId, environment, secretPath)
        )
      )
    );
    // filter hooks by status
    const successWebhooks = webhooksTriggered
      .filter(({ status }) => status === "fulfilled")
      .map((_, i) => toBeTriggeredHooks[i].id);
    const failedWebhooks = webhooksTriggered
      .filter(({ status }) => status === "rejected")
      .map((data, i) => ({
        id: toBeTriggeredHooks[i].id,
        error: data.status === "rejected" && data.reason.message
      }));

    await webhookDal.transaction(async (tx) => {
      const env = await projectEnvDal.findOne({ projectId, slug: environment }, tx);
      if (!env) throw new BadRequestError({ message: "Env not found" });
      if (successWebhooks.length) {
        await webhookDal.update(
          { envId: env.id, $in: { id: successWebhooks } },
          { lastStatus: "success", lastRunErrorMessage: null },
          tx
        );
      }
      if (failedWebhooks.length) {
        await webhookDal.bulkUpdate(
          failedWebhooks.map(({ id, error }) => ({
            id,
            lastRunErrorMessage: error,
            lastStatus: "failed"
          })),
          tx
        );
      }
    });
  };

  return {
    createWebhook,
    deleteWebhook,
    listWebhooks,
    updateWebhook,
    testWebhook,
    fnTriggerWebhook
  };
};
