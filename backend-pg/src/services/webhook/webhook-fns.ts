import crypto from "node:crypto";

import { SecretKeyEncoding, TWebhooks } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { decryptSymmetric, decryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";

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
      headers["x-infisical-signature"] = `t=${data.timestamp};${webhookSign}`;
    }
  }
  const req = await request.post(url, payload, { headers });
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
