import { AxiosError } from "axios";

import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";

import { ALARM_CHANNEL_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "../alarm-channel-constants";
import {
  PagerDutyChannelConfigSchema,
  pagerDutyIntegrationKeyRegex,
  TAlarmChannelSendContext,
  TAlarmItem,
  TAlarmPayload,
  TChannelResult
} from "../alarm-channel-types";

const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";
const PAGERDUTY_TIMEOUT = 7 * 1000;
const MAX_INCIDENTS_PER_RUN = 10;
const PAGERDUTY_SUMMARY_MAX_LENGTH = 1024;

type TPagerDutyPayload = {
  routing_key: string;
  event_action: "trigger";
  dedup_key: string;
  payload: {
    summary: string;
    severity: "critical" | "error" | "warning" | "info";
    source: string;
    timestamp: string;
    component: string;
    group: string;
    class: string;
    custom_details: {
      alarm_name: string;
      condition?: string;
      title: string;
      identifier?: string;
      fields: Record<string, string>;
      view_url: string;
    };
  };
  links: Array<{ href: string; text: string }>;
};

export const buildPagerDutyEvent = (
  payload: TAlarmPayload,
  item: TAlarmItem,
  integrationKey: string
): TPagerDutyPayload => ({
  routing_key: integrationKey,
  event_action: "trigger",
  dedup_key: `${payload.alarm.id}:${item.id}`,
  payload: {
    summary: `${payload.summary} — ${item.title}`.slice(0, PAGERDUTY_SUMMARY_MAX_LENGTH),
    severity: payload.severity,
    source: `infisical-${payload.alarm.resourceType}`,
    timestamp: new Date().toISOString(),
    component: payload.resourceKind,
    group: payload.alarm.projectId ?? payload.alarm.orgId,
    class: payload.eventKey,
    custom_details: {
      alarm_name: payload.alarm.name,
      ...(payload.alarm.condition ? { condition: payload.alarm.condition } : {}),
      title: item.title || "N/A",
      ...(item.identifier ? { identifier: item.identifier } : {}),
      fields: Object.fromEntries((item.fields ?? []).map((field) => [field.label, field.value])),
      view_url: payload.alarm.viewUrl
    }
  },
  links: [{ href: payload.alarm.viewUrl, text: "View in Infisical" }]
});

const isPagerDutyErrorRetryable = (err: AxiosError): boolean => {
  const status = err.response?.status;
  if (status === 400) return false;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  if (err.code && RETRYABLE_NETWORK_ERRORS.includes(err.code)) return true;
  if (err.message?.toLowerCase().includes("timeout")) return true;
  return false;
};

const triggerPagerDutyEvent = async (payload: TPagerDutyPayload): Promise<void> => {
  await safeRequest.post(PAGERDUTY_EVENTS_URL, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: PAGERDUTY_TIMEOUT,
    signal: AbortSignal.timeout(PAGERDUTY_TIMEOUT)
  });
};

const triggerPagerDutyEventWithRetry = async (
  payload: TPagerDutyPayload,
  channelId: string
): Promise<TChannelResult> => {
  const { maxRetries, delayMs } = ALARM_CHANNEL_RETRY_CONFIG;
  let lastError: AxiosError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await triggerPagerDutyEvent(payload);
      return { success: true };
    } catch (err) {
      lastError = err as AxiosError;

      if (!isPagerDutyErrorRetryable(lastError)) {
        logger.info(
          { channelId, statusCode: lastError.response?.status, error: lastError.message },
          `Alarm PagerDuty error is not retryable (4xx or non-transient) [channelId=${channelId}]`
        );
        return { success: false, error: lastError.message };
      }

      logger.info(
        { channelId, attempt, maxRetries, statusCode: lastError.response?.status, error: lastError.message },
        `Alarm PagerDuty failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"} [channelId=${channelId}]`
      );

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};

export const sendPagerDutyNotification = async (ctx: TAlarmChannelSendContext): Promise<TChannelResult> => {
  const config = PagerDutyChannelConfigSchema.parse(ctx.config);

  if (!pagerDutyIntegrationKeyRegex.test(config.integrationKey)) {
    return { success: false, error: "Invalid PagerDuty integration key" };
  }

  const items = ctx.payload.items.slice(0, MAX_INCIDENTS_PER_RUN);
  if (ctx.payload.items.length > MAX_INCIDENTS_PER_RUN) {
    logger.warn(
      { channelId: ctx.channelId, total: ctx.payload.items.length, cap: MAX_INCIDENTS_PER_RUN },
      `Alarm PagerDuty target count exceeds cap; only the first ${MAX_INCIDENTS_PER_RUN} incidents are triggered this run [channelId=${ctx.channelId}]`
    );
  }

  const results = await Promise.all(
    items.map((item) =>
      triggerPagerDutyEventWithRetry(buildPagerDutyEvent(ctx.payload, item, config.integrationKey), ctx.channelId)
    )
  );

  const errors = results.filter((result) => !result.success && result.error).map((result) => result.error);
  if (errors.length > 0) {
    return { success: false, error: errors.join("; ") };
  }
  return { success: true };
};
