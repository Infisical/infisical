import crypto from "node:crypto";

import picomatch from "picomatch";

import { SecretKeyEncoding, TWebhooks } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { decryptSymmetric, decryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TWebhookDALFactory } from "./webhook-dal";

const WEBHOOK_TRIGGER_TIMEOUT = 15 * 1000;
export const triggerWebhookRequest = async (
  { url, encryptedSecretKey, iv, tag, keyEncoding }: TWebhooks,
  data: Record<string, unknown>
) => {
  const headers: Record<string, string> = {};
  const payload = { ...data, timestamp: Date.now() };
  const appCfg = getConfig();

  if (encryptedSecretKey) {
    const encryptionKey = appCfg.ENCRYPTION_KEY;
    const rootEncryptionKey = appCfg.ROOT_ENCRYPTION_KEY;
    let secretKey;
    if (rootEncryptionKey && keyEncoding === SecretKeyEncoding.BASE64) {
      // case: encoding scheme is base64
      secretKey = decryptSymmetric({
        ciphertext: encryptedSecretKey,
        iv: iv as string,
        tag: tag as string,
        key: rootEncryptionKey
      });
    } else if (encryptionKey && keyEncoding === SecretKeyEncoding.UTF8) {
      // case: encoding scheme is utf8
      secretKey = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: encryptedSecretKey,
        iv: iv as string,
        tag: tag as string,
        key: encryptionKey
      });
    }
    if (secretKey) {
      const webhookSign = crypto
        .createHmac("sha256", secretKey)
        .update(JSON.stringify(payload))
        .digest("hex");
      headers["x-infisical-signature"] = `t=${payload.timestamp};${webhookSign}`;
    }
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

export type TFnTriggerWebhookDTO = {
  projectId: string;
  secretPath: string;
  environment: string;
  webhookDAL: Pick<TWebhookDALFactory, "findAllWebhooks" | "transaction" | "update" | "bulkUpdate">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
};
// this is reusable function
// used in secret queue to trigger webhook and update status when secrets changes
export const fnTriggerWebhook = async ({
  environment,
  secretPath,
  projectId,
  webhookDAL,
  projectEnvDAL
}: TFnTriggerWebhookDTO) => {
  const webhooks = await webhookDAL.findAllWebhooks(projectId, environment);
  const toBeTriggeredHooks = webhooks.filter(
    ({ secretPath: hookSecretPath, isDisabled }) =>
      !isDisabled && picomatch.isMatch(secretPath, hookSecretPath, { strictSlashes: false })
  );
  if (!toBeTriggeredHooks.length) return;
  logger.info("Secret webhook job started", { environment, secretPath, projectId });
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

  await webhookDAL.transaction(async (tx) => {
    const env = await projectEnvDAL.findOne({ projectId, slug: environment }, tx);
    if (!env) throw new BadRequestError({ message: "Env not found" });
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
