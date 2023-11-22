import { Request, Response } from "express";
import { Types } from "mongoose";
import { client, getEncryptionKey, getRootEncryptionKey } from "../../config";
import { Webhook } from "../../models";
import { getWebhookPayload, triggerWebhookRequest } from "../../services/WebhookService";
import { BadRequestError, ResourceNotFoundError } from "../../utils/errors";
import { EEAuditLogService } from "../../ee/services";
import { EventType } from "../../ee/models";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8
} from "../../variables";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/webhooks";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";
import { encryptSymmetric128BitHexKeyUTF8 } from "../../utils/crypto";

export const createWebhook = async (req: Request, res: Response) => {
  const {
    body: { webhookUrl, webhookSecretKey, environment, workspaceId, secretPath }
  } = await validateRequest(reqValidator.CreateWebhookV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });
  
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.Webhooks
  );

  const webhook = new Webhook({
    workspace: workspaceId,
    environment,
    secretPath,
    url: webhookUrl
  });

  if (webhookSecretKey) {
    const encryptionKey = await getEncryptionKey();
    const rootEncryptionKey = await getRootEncryptionKey();

    if (rootEncryptionKey) {
      const { ciphertext, iv, tag } = client.encryptSymmetric(webhookSecretKey, rootEncryptionKey);
      webhook.iv = iv;
      webhook.tag = tag;
      webhook.encryptedSecretKey = ciphertext;
      webhook.algorithm = ALGORITHM_AES_256_GCM;
      webhook.keyEncoding = ENCODING_SCHEME_BASE64;
    } else if (encryptionKey) {
      const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8({
        plaintext: webhookSecretKey,
        key: encryptionKey
      });
      webhook.iv = iv;
      webhook.tag = tag;
      webhook.encryptedSecretKey = ciphertext;
      webhook.algorithm = ALGORITHM_AES_256_GCM;
      webhook.keyEncoding = ENCODING_SCHEME_UTF8;
    }
  }

  await webhook.save();

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.CREATE_WEBHOOK,
      metadata: {
        webhookId: webhook._id.toString(),
        environment,
        secretPath,
        webhookUrl,
        isDisabled: false
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  return res.status(200).send({
    webhook,
    message: "successfully created webhook"
  });
};

export const updateWebhook = async (req: Request, res: Response) => {
  const {
    body: { isDisabled },
    params: { webhookId }
  } = await validateRequest(reqValidator.UpdateWebhookV1, req);

  const webhook = await Webhook.findById(webhookId);
  if (!webhook) {
    throw BadRequestError({ message: "Webhook not found!!" });
  }
  
  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: webhook.workspace
  });
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Webhooks
  );

  if (typeof isDisabled !== undefined) {
    webhook.isDisabled = isDisabled;
  }
  await webhook.save();

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_WEBHOOK_STATUS,
      metadata: {
        webhookId: webhook._id.toString(),
        environment: webhook.environment,
        secretPath: webhook.secretPath,
        webhookUrl: webhook.url,
        isDisabled
      }
    },
    {
      workspaceId: webhook.workspace
    }
  );

  return res.status(200).send({
    webhook,
    message: "successfully updated webhook"
  });
};

export const deleteWebhook = async (req: Request, res: Response) => {
  const {
    params: { webhookId }
  } = await validateRequest(reqValidator.DeleteWebhookV1, req);
  let webhook = await Webhook.findById(webhookId);

  if (!webhook) {
    throw ResourceNotFoundError({ message: "Webhook not found!!" });
  }

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: webhook.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Webhooks
  );

  webhook = await Webhook.findByIdAndDelete(webhookId);

  if (!webhook) {
    throw ResourceNotFoundError({ message: "Webhook not found!!" });
  }

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.DELETE_WEBHOOK,
      metadata: {
        webhookId: webhook._id.toString(),
        environment: webhook.environment,
        secretPath: webhook.secretPath,
        webhookUrl: webhook.url,
        isDisabled: webhook.isDisabled
      }
    },
    {
      workspaceId: webhook.workspace
    }
  );

  return res.status(200).send({
    message: "successfully removed webhook"
  });
};

export const testWebhook = async (req: Request, res: Response) => {
  const {
    params: { webhookId }
  } = await validateRequest(reqValidator.TestWebhookV1, req);

  const webhook = await Webhook.findById(webhookId);
  if (!webhook) {
    throw BadRequestError({ message: "Webhook not found!!" });
  }

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: webhook.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Webhooks
  );

  try {
    await triggerWebhookRequest(
      webhook,
      getWebhookPayload(
        "test",
        webhook.workspace.toString(),
        webhook.environment,
        webhook.secretPath
      )
    );
    await Webhook.findByIdAndUpdate(webhookId, {
      lastStatus: "success",
      lastRunErrorMessage: null
    });
  } catch (err) {
    await Webhook.findByIdAndUpdate(webhookId, {
      lastStatus: "failed",
      lastRunErrorMessage: (err as Error).message
    });
    return res.status(400).send({
      message: "Failed to receive response",
      error: (err as Error).message
    });
  }

  return res.status(200).send({
    message: "Successfully received response"
  });
};

export const listWebhooks = async (req: Request, res: Response) => {
  const {
    query: { environment, workspaceId, secretPath }
  } = await validateRequest(reqValidator.ListWebhooksV1, req);
  
  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });
  
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Webhooks
  );

  const optionalFilters: Record<string, string> = {};
  if (environment) optionalFilters.environment = environment as string;
  if (secretPath) optionalFilters.secretPath = secretPath as string;

  const webhooks = await Webhook.find({
    workspace: new Types.ObjectId(workspaceId as string),
    ...optionalFilters
  });

  return res.status(200).send({
    webhooks
  });
};
