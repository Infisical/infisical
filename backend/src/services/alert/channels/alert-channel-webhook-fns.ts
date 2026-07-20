import crypto from "node:crypto";

import { safeRequest } from "@app/lib/validator";

import {
  TAlertChannelSendContext,
  TAlertPayload,
  TChannelResult,
  WebhookChannelConfigSchema
} from "../alert-channel-types";
import { isAxiosErrorRetryable, retryWithBackoff } from "./alert-channel-retry-fns";

const ALERT_WEBHOOK_TIMEOUT = 7 * 1000;

type TAlertWebhookPayload = {
  specversion: "1.0";
  type: string;
  source: string;
  id: string;
  time: string;
  datacontenttype: "application/json";
  subject: string;
  data: {
    alert: { id: string; name: string; resourceType: string; condition?: string };
    items: TAlertPayload["items"];
    metadata: { totalItems: number; viewUrl: string };
  };
};

export const buildWebhookPayload = (payload: TAlertPayload): TAlertWebhookPayload => ({
  specversion: "1.0",
  type: payload.webhookType,
  source: payload.alert.projectId
    ? `/projects/${payload.alert.projectId}/alerts/${payload.alert.id}`
    : `/alerts/${payload.alert.id}`,
  id: crypto.randomUUID(),
  time: new Date().toISOString(),
  datacontenttype: "application/json",
  subject: payload.eventKey,
  data: {
    alert: {
      id: payload.alert.id,
      name: payload.alert.name,
      resourceType: payload.alert.resourceType,
      ...(payload.alert.condition ? { condition: payload.alert.condition } : {})
    },
    items: payload.items,
    metadata: {
      totalItems: payload.items.length,
      viewUrl: payload.alert.viewUrl
    }
  }
});

const generateHmacSignature = (data: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(data).digest("hex");

const triggerWebhook = async (params: {
  url: string;
  payload: TAlertWebhookPayload;
  signingSecret?: string | null;
}): Promise<void> => {
  const { url, payload, signingSecret } = params;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (signingSecret) {
    const payloadString = JSON.stringify(payload);
    const timestamp = Date.now();
    const signature = generateHmacSignature(`${timestamp}.${payloadString}`, signingSecret);
    headers["x-infisical-signature"] = `t=${timestamp},v1=${signature}`;
  }

  await safeRequest.post(url, payload, {
    headers,
    timeout: ALERT_WEBHOOK_TIMEOUT,
    signal: AbortSignal.timeout(ALERT_WEBHOOK_TIMEOUT)
  });
};

export const sendWebhookNotification = async (ctx: TAlertChannelSendContext): Promise<TChannelResult> => {
  const config = WebhookChannelConfigSchema.parse(ctx.config);
  const payload = buildWebhookPayload(ctx.payload);

  return retryWithBackoff(
    () => triggerWebhook({ url: config.url, payload, signingSecret: config.signingSecret }),
    isAxiosErrorRetryable,
    { channelId: ctx.channelId, channelLabel: "webhook" }
  );
};
