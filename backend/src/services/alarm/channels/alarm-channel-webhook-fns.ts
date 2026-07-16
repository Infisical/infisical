import crypto from "node:crypto";

import { AxiosError } from "axios";

import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";

import { ALARM_CHANNEL_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "../alarm-channel-constants";
import {
  TAlarmChannelSendContext,
  TAlarmPayload,
  TChannelResult,
  WebhookChannelConfigSchema
} from "../alarm-channel-types";

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

const isWebhookErrorRetryable = (err: AxiosError): boolean => {
  const status = err.response?.status;
  if (status && status >= 500) return true;
  if (err.code && RETRYABLE_NETWORK_ERRORS.includes(err.code)) return true;
  if (err.message?.toLowerCase().includes("timeout")) return true;
  return false;
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
  const { maxRetries, delayMs } = ALARM_CHANNEL_RETRY_CONFIG;
  let lastError: AxiosError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await triggerWebhook({ url: config.url, payload, signingSecret: config.signingSecret });
      return { success: true };
    } catch (err) {
      lastError = err as AxiosError;

      if (!isWebhookErrorRetryable(lastError)) {
        logger.info(
          { channelId: ctx.channelId, statusCode: lastError.response?.status, error: lastError.message },
          `Alarm webhook error is not retryable (4xx or non-transient) [channelId=${ctx.channelId}]`
        );
        return { success: false, error: lastError.message };
      }

      logger.info(
        {
          channelId: ctx.channelId,
          attempt,
          maxRetries,
          statusCode: lastError.response?.status,
          error: lastError.message
        },
        `Alarm webhook failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"} [channelId=${ctx.channelId}]`
      );

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};
