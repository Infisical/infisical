import axios from "axios";
import crypto from "crypto";
import { Types } from "mongoose";
import picomatch from "picomatch";
import { client, getRootEncryptionKey } from "../config";
import { IWebhook, Webhook } from "../models";

export const triggerWebhookRequest = async (
  { url, encryptedSecretKey, iv, tag }: IWebhook,
  payload: Record<string, unknown>
) => {
  const headers: Record<string, string> = {};
  payload["timestamp"] = Date.now();

  if (encryptedSecretKey) {
    const rootEncryptionKey = await getRootEncryptionKey();
    const secretKey = client.decryptSymmetric(encryptedSecretKey, rootEncryptionKey, iv, tag);
    const webhookSign = crypto
      .createHmac("sha256", secretKey)
      .update(JSON.stringify(payload))
      .digest("hex");
    headers["x-infisical-signature"] = `t=${payload["timestamp"]};${webhookSign}`;
  }

  const req = await axios.post(url, payload, { headers });
  return req;
};

export const getWebhookPayload = (
  eventName: string,
  workspaceId: string,
  environment: string,
  secretPath?: string
) => ({
  event: eventName,
  project: {
    workspaceId,
    environment,
    secretPath
  }
});

export const triggerWebhook = async (
  workspaceId: string,
  environment: string,
  secretPath: string
) => {
  const webhooks = await Webhook.find({ workspace: workspaceId, environment, isDisabled: false });
  // TODO(akhilmhdh): implement retry policy later, for that a cron job based approach is needed
  // for exponential backoff
  const toBeTriggeredHooks = webhooks.filter(({ secretPath: hookSecretPath }) =>
    picomatch.isMatch(secretPath, hookSecretPath, { strictSlashes: false })
  );
  const webhooksTriggered = await Promise.allSettled(
    toBeTriggeredHooks.map((hook) =>
      triggerWebhookRequest(
        hook,
        getWebhookPayload("secrets.modified", workspaceId, environment, secretPath)
      )
    )
  );
  const successWebhooks: Types.ObjectId[] = [];
  const failedWebhooks: Array<{ id: Types.ObjectId; error: string }> = [];
  webhooksTriggered.forEach((data, index) => {
    if (data.status === "rejected") {
      failedWebhooks.push({ id: toBeTriggeredHooks[index]._id, error: data.reason.message });
      return;
    }
    successWebhooks.push(toBeTriggeredHooks[index]._id);
  });
  // dont remove the workspaceid and environment filter. its used to reduce the dataset before $in check
  await Webhook.bulkWrite([
    {
      updateMany: {
        filter: { workspace: workspaceId, environment, _id: { $in: successWebhooks } },
        update: { lastStatus: "success", lastRunErrorMessage: null }
      }
    },
    ...failedWebhooks.map(({ id, error }) => ({
      updateOne: {
        filter: {
          workspace: workspaceId,
          environment,
          _id: id
        },
        update: {
          lastStatus: "failed",
          lastRunErrorMessage: error
        }
      }
    }))
  ]);
};
