import { ForbiddenError } from "@casl/ability";

import { SecretKeyEncoding, TWebhooksInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks);
    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new BadRequestError({ message: "Env not found" });

    const insertDoc: TWebhooksInsert = {
      url: "", // deprecated - we are moving away from plaintext URLs
      envId: env.id,
      isDisabled: false,
      secretPath: secretPath || "/",
      type
    };

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      projectId,
      type: KmsDataKey.SecretManager
    });
    if (webhookSecretKey) {
      const encryptedSecretKeyWithKms = secretManagerEncryptor({
        plainText: Buffer.from(webhookSecretKey)
      }).cipherTextBlob;
      insertDoc.encryptedSecretKeyWithKms = encryptedSecretKeyWithKms;
    }

    if (webhookUrl) {
      const encryptedUrl = secretManagerEncryptor({
        plainText: Buffer.from(webhookUrl)
      }).cipherTextBlob;

      insertDoc.encryptedUrl = encryptedUrl;
    }

    const webhook = await webhookDAL.create(insertDoc);
    return { ...webhook, projectId, environment: env };
  };

  const updateWebhook = async ({ actorId, actor, actorOrgId, actorAuthMethod, id, isDisabled }: TUpdateWebhookDTO) => {
    const webhook = await webhookDAL.findById(id);
    if (!webhook) throw new BadRequestError({ message: "Webhook not found" });

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
    if (!webhook) throw new BadRequestError({ message: "Webhook not found" });

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
    if (!webhook) throw new BadRequestError({ message: "Webhook not found" });

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
    const { decryptor: kmsDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      projectId: project.id,
      type: KmsDataKey.SecretManager
    });
    let webhookUrl = webhook.url;
    let webhookSecretKey;
    if (webhook.urlTag && webhook.urlCipherText && webhook.urlIV) {
      webhookUrl = infisicalSymmetricDecrypt({
        keyEncoding: webhook.keyEncoding as SecretKeyEncoding,
        ciphertext: webhook.urlCipherText,
        iv: webhook.urlIV,
        tag: webhook.urlTag
      });
    } else if (webhook.encryptedUrl) {
      webhookUrl = kmsDataKeyDecryptor({ cipherTextBlob: webhook.encryptedUrl }).toString();
    }
    if (webhook.encryptedSecretKey && webhook.iv && webhook.tag) {
      webhookSecretKey = infisicalSymmetricDecrypt({
        keyEncoding: webhook.keyEncoding as SecretKeyEncoding,
        ciphertext: webhook.encryptedSecretKey,
        iv: webhook.iv,
        tag: webhook.tag
      });
    } else if (webhook.encryptedSecretKeyWithKms) {
      webhookSecretKey = kmsDataKeyDecryptor({ cipherTextBlob: webhook.encryptedSecretKeyWithKms }).toString();
    }
    try {
      await triggerWebhookRequest(
        { webhookUrl, webhookSecretKey },
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
    const { decryptor: kmsDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    return webhooks.map((w) => {
      let decryptedUrl = w.url;
      if (w.urlTag && w.urlCipherText && w.urlIV) {
        decryptedUrl = infisicalSymmetricDecrypt({
          keyEncoding: w.keyEncoding as SecretKeyEncoding,
          ciphertext: w.urlCipherText,
          iv: w.urlIV,
          tag: w.urlTag
        });
      } else if (w.encryptedUrl) {
        decryptedUrl = kmsDataKeyDecryptor({ cipherTextBlob: w.encryptedUrl }).toString();
      }
      return {
        ...w,
        url: decryptedUrl
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
