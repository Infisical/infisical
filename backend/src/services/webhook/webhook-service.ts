import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, TWebhooksInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

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
  const toBlockedEvents = (
    isSecretModifiedEventEnabled?: boolean,
    isSecretRotationFailedEventEnabled?: boolean
  ): string[] => {
    const blocked: string[] = [];
    if (isSecretModifiedEventEnabled === false) blocked.push(WebhookEvents.SecretModified);
    if (isSecretRotationFailedEventEnabled === false) blocked.push(WebhookEvents.SecretRotationFailed);
    return blocked;
  };

  const withEventFlags = <T extends { blockedEvents?: string[] | null }>(webhook: T) => ({
    ...webhook,
    isSecretModifiedEventEnabled: !webhook.blockedEvents?.includes(WebhookEvents.SecretModified),
    isSecretRotationFailedEventEnabled: !webhook.blockedEvents?.includes(WebhookEvents.SecretRotationFailed)
  });

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
    type,
    isSecretModifiedEventEnabled,
    isSecretRotationFailedEventEnabled
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

    await blockLocalAndPrivateIpAddresses(webhookUrl);
    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const blockedEvents = toBlockedEvents(isSecretModifiedEventEnabled, isSecretRotationFailedEventEnabled);

    const insertDoc: TWebhooksInsert = {
      envId: env.id,
      isDisabled: false,
      secretPath: secretPath || "/",
      type,
      encryptedUrl: secretManagerEncryptor({ plainText: Buffer.from(webhookUrl) }).cipherTextBlob,
      blockedEvents
    };

    if (webhookSecretKey) {
      insertDoc.encryptedPassKey = secretManagerEncryptor({ plainText: Buffer.from(webhookSecretKey) }).cipherTextBlob;
    }

    const webhook = await webhookDAL.create(insertDoc);
    return { ...withEventFlags(webhook), projectId, environment: env };
  };

  const updateWebhook = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    isDisabled,
    isSecretModifiedEventEnabled,
    isSecretRotationFailedEventEnabled
  }: TUpdateWebhookDTO) => {
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

    const hasEventToggleUpdate =
      isSecretModifiedEventEnabled !== undefined || isSecretRotationFailedEventEnabled !== undefined;

    let blockedEvents: string[] | undefined;
    if (hasEventToggleUpdate) {
      const currentBlocked = new Set<string>(webhook.blockedEvents ?? []);

      if (isSecretModifiedEventEnabled !== undefined) {
        if (isSecretModifiedEventEnabled) {
          currentBlocked.delete(WebhookEvents.SecretModified);
        } else {
          currentBlocked.add(WebhookEvents.SecretModified);
        }
      }

      if (isSecretRotationFailedEventEnabled !== undefined) {
        if (isSecretRotationFailedEventEnabled) {
          currentBlocked.delete(WebhookEvents.SecretRotationFailed);
        } else {
          currentBlocked.add(WebhookEvents.SecretRotationFailed);
        }
      }

      blockedEvents = Array.from(currentBlocked);
    }

    const updateData = {
      ...(isDisabled !== undefined ? { isDisabled } : {}),
      ...(blockedEvents !== undefined ? { blockedEvents } : {})
    };

    const updatedWebhook = await webhookDAL.updateById(id, updateData);
    return withEventFlags({ ...webhook, ...updatedWebhook });
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
    return withEventFlags({ ...webhook, ...deletedWebhook });
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
      const payload = getWebhookPayload({
        type: WebhookEvents.TestEvent,
        payload: {
          projectName: project.name,
          projectId: webhook.projectId,
          environment: webhook.environment.slug,
          secretPath: webhook.secretPath,
          type: webhook.type
        }
      });

      if (!payload) throw new BadRequestError({ message: "Failed to get webhook payload for test event" });

      await triggerWebhookRequest(
        webhook,
        (value) => secretManagerDecryptor({ cipherTextBlob: value }).toString(),
        payload
      );
    } catch (err) {
      webhookError = (err as Error).message;
    }
    const isSuccess = !webhookError;
    const updatedWebhook = await webhookDAL.updateById(webhook.id, {
      lastStatus: isSuccess ? "success" : "failed",
      lastRunErrorMessage: isSuccess ? null : webhookError
    });
    return withEventFlags({ ...webhook, ...updatedWebhook });
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
        ...withEventFlags(w),
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
