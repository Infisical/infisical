import crypto from "node:crypto";

import { AxiosError } from "axios";
import picomatch from "picomatch";

import { SecretKeyEncoding, TWebhooks } from "@app/db/schemas";
import { request } from "@app/lib/config/request";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TWebhookDALFactory } from "./webhook-dal";
import { WebhookType } from "./webhook-types";

const WEBHOOK_TRIGGER_TIMEOUT = 15 * 1000;

export const decryptWebhookDetails = (webhook: TWebhooks) => {
  const { keyEncoding, iv, encryptedSecretKey, tag, urlCipherText, urlIV, urlTag, url } = webhook;

  let decryptedSecretKey = "";
  let decryptedUrl = url;

  if (encryptedSecretKey) {
    decryptedSecretKey = infisicalSymmetricDecrypt({
      keyEncoding: keyEncoding as SecretKeyEncoding,
      ciphertext: encryptedSecretKey,
      iv: iv as string,
      tag: tag as string
    });
  }

  if (urlCipherText) {
    decryptedUrl = infisicalSymmetricDecrypt({
      keyEncoding: keyEncoding as SecretKeyEncoding,
      ciphertext: urlCipherText,
      iv: urlIV as string,
      tag: urlTag as string
    });
  }

  return {
    secretKey: decryptedSecretKey,
    url: decryptedUrl
  };
};

export const triggerWebhookRequest = async (webhook: TWebhooks, data: Record<string, unknown>) => {
  const headers: Record<string, string> = {};
  const payload = { ...data, timestamp: Date.now() };
  const { secretKey, url } = decryptWebhookDetails(webhook);

  if (secretKey) {
    const webhookSign = crypto.createHmac("sha256", secretKey).update(JSON.stringify(payload)).digest("hex");
    headers["x-infisical-signature"] = `t=${payload.timestamp};${webhookSign}`;
  }

  const req = await request.post(url, payload, {
    headers,
    timeout: WEBHOOK_TRIGGER_TIMEOUT,
    signal: AbortSignal.timeout(WEBHOOK_TRIGGER_TIMEOUT)
  });

  return req;
};

export const getWebhookPayload = (
  eventName: string,
  details: {
    workspaceName: string;
    workspaceId: string;
    environment: string;
    secretPath?: string;
    type?: string | null;
  }
) => {
  const { workspaceName, workspaceId, environment, secretPath, type } = details;

  switch (type) {
    case WebhookType.SLACK:
      return {
        text: "A secret value has been added or modified.",
        attachments: [
          {
            color: "#E7F256",
            fields: [
              {
                title: "Project",
                value: workspaceName,
                short: false
              },
              {
                title: "Environment",
                value: environment,
                short: false
              },
              {
                title: "Secret Path",
                value: secretPath,
                short: false
              }
            ]
          }
        ]
      };
    case WebhookType.GENERAL:
    default:
      return {
        event: eventName,
        project: {
          workspaceId,
          environment,
          secretPath
        }
      };
  }
};

export type TFnTriggerWebhookDTO = {
  projectId: string;
  secretPath: string;
  environment: string;
  webhookDAL: Pick<TWebhookDALFactory, "findAllWebhooks" | "transaction" | "update" | "bulkUpdate">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

// this is reusable function
// used in secret queue to trigger webhook and update status when secrets changes
export const fnTriggerWebhook = async ({
  environment,
  secretPath,
  projectId,
  webhookDAL,
  projectEnvDAL,
  projectDAL
}: TFnTriggerWebhookDTO) => {
  const webhooks = await webhookDAL.findAllWebhooks(projectId, environment);
  const toBeTriggeredHooks = webhooks.filter(
    ({ secretPath: hookSecretPath, isDisabled }) =>
      !isDisabled && picomatch.isMatch(secretPath, hookSecretPath, { strictSlashes: false })
  );
  if (!toBeTriggeredHooks.length) return;
  logger.info("Secret webhook job started", { environment, secretPath, projectId });
  const project = await projectDAL.findById(projectId);
  const webhooksTriggered = await Promise.allSettled(
    toBeTriggeredHooks.map((hook) =>
      triggerWebhookRequest(
        hook,
        getWebhookPayload("secrets.modified", {
          workspaceName: project.name,
          workspaceId: projectId,
          environment,
          secretPath,
          type: hook.type
        })
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
      error: data.status === "rejected" ? (data.reason as AxiosError).message : ""
    }));

  await webhookDAL.transaction(async (tx) => {
    const env = await projectEnvDAL.findOne({ projectId, slug: environment }, tx);
    if (!env) throw new NotFoundError({ message: "Environment not found" });
    if (successWebhooks.length) {
      await webhookDAL.update(
        { envId: env.id, $in: { id: successWebhooks } },
        { lastStatus: "success", lastRunErrorMessage: null },
        tx
      );
    }
    if (failedWebhooks.length) {
      await webhookDAL.bulkUpdate(
        failedWebhooks.map(({ id, error }) => ({
          id,
          lastRunErrorMessage: error,
          lastStatus: "failed"
        })),
        tx
      );
    }
  });
  logger.info("Secret webhook job ended", { environment, secretPath, projectId });
};
