import crypto from "node:crypto";

import { safeRequest } from "@app/lib/validator";

import {
  TAlarmChannelSendContext,
  TAlarmPayload,
  TChannelResult,
  WebhookChannelConfigSchema
} from "../alarm-channel-types";
import { isAxiosErrorRetryable, retryWithBackoff } from "./alarm-channel-retry-fns";

const ALARM_WEBHOOK_TIMEOUT = 7 * 1000;

type TAlarmWebhookPayload = {
  specversion: "1.0";
  type: string;
  source: string;
  id: string;
  time: string;
  datacontenttype: "application/json";
  subject: string;
  data: {
    alarm: { id: string; name: string; resourceType: string; condition?: string };
    items: TAlarmPayload["items"];
    metadata: { totalItems: number; viewUrl: string };
  };
};

export const buildWebhookPayload = (payload: TAlarmPayload): TAlarmWebhookPayload => ({
  specversion: "1.0",
  type: payload.webhookType,
  source: payload.alarm.projectId
    ? `/projects/${payload.alarm.projectId}/alarms/${payload.alarm.id}`
    : `/alarms/${payload.alarm.id}`,
  id: crypto.randomUUID(),
  time: new Date().toISOString(),
  datacontenttype: "application/json",
  subject: payload.eventKey,
  data: {
    alarm: {
      id: payload.alarm.id,
      name: payload.alarm.name,
      resourceType: payload.alarm.resourceType,
      ...(payload.alarm.condition ? { condition: payload.alarm.condition } : {})
    },
    items: payload.items,
    metadata: {
      totalItems: payload.items.length,
      viewUrl: payload.alarm.viewUrl
    }
  }
});

const generateHmacSignature = (data: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(data).digest("hex");

const triggerWebhook = async (params: {
  url: string;
  payload: TAlarmWebhookPayload;
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
    timeout: ALARM_WEBHOOK_TIMEOUT,
    signal: AbortSignal.timeout(ALARM_WEBHOOK_TIMEOUT)
  });
};

export const sendWebhookNotification = async (ctx: TAlarmChannelSendContext): Promise<TChannelResult> => {
  const config = WebhookChannelConfigSchema.parse(ctx.config);
  const payload = buildWebhookPayload(ctx.payload);

  return retryWithBackoff(
    () => triggerWebhook({ url: config.url, payload, signingSecret: config.signingSecret }),
    isAxiosErrorRetryable,
    { channelId: ctx.channelId, channelLabel: "webhook" }
  );
};
