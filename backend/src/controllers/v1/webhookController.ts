import { Request, Response } from "express";
import { Types } from "mongoose";
import { client, getRootEncryptionKey } from "../../config";
import { validateMembership } from "../../helpers";
import { Webhook } from "../../models";
import { getWebhookPayload, triggerWebhookRequest } from "../../services/WebhookService";
import { BadRequestError, ResourceNotFoundError } from "../../utils/errors";
import { EEAuditLogService } from "../../ee/services";
import { EventType } from "../../ee/models";
import { ADMIN, ALGORITHM_AES_256_GCM, ENCODING_SCHEME_BASE64, MEMBER } from "../../variables";

export const createWebhook = async (req: Request, res: Response) => {
  const { webhookUrl, webhookSecretKey, environment, workspaceId, secretPath } = req.body;
  const webhook = new Webhook({
    workspace: workspaceId,
    environment,
    secretPath,
    url: webhookUrl,
    algorithm: ALGORITHM_AES_256_GCM,
    keyEncoding: ENCODING_SCHEME_BASE64
  });

  if (webhookSecretKey) {
    const rootEncryptionKey = await getRootEncryptionKey();
    const { ciphertext, iv, tag } = client.encryptSymmetric(webhookSecretKey, rootEncryptionKey);
    webhook.iv = iv;
    webhook.tag = tag;
    webhook.encryptedSecretKey = ciphertext;
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
      workspaceId
    }
  );

  return res.status(200).send({
    webhook,
    message: "successfully created webhook"
  });
};

export const updateWebhook = async (req: Request, res: Response) => {
  const { webhookId } = req.params;
  const { isDisabled } = req.body;
  const webhook = await Webhook.findById(webhookId);
  if (!webhook) {
    throw BadRequestError({ message: "Webhook not found!!" });
  }

  // check that user is a member of the workspace
  await validateMembership({
    userId: req.user._id.toString(),
    workspaceId: webhook.workspace,
    acceptedRoles: [ADMIN, MEMBER]
  });

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
  const { webhookId } = req.params;
  let webhook = await Webhook.findById(webhookId);

  if (!webhook) {
    throw ResourceNotFoundError({ message: "Webhook not found!!" });
  }

  await validateMembership({
    userId: req.user._id.toString(),
    workspaceId: webhook.workspace,
    acceptedRoles: [ADMIN, MEMBER]
  });
  
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
  const { webhookId } = req.params;
  const webhook = await Webhook.findById(webhookId);
  if (!webhook) {
    throw BadRequestError({ message: "Webhook not found!!" });
  }

  await validateMembership({
    userId: req.user._id.toString(),
    workspaceId: webhook.workspace,
    acceptedRoles: [ADMIN, MEMBER]
  });

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
  const { environment, workspaceId, secretPath } = req.query;

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
