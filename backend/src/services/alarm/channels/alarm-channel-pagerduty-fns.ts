import { AxiosError } from "axios";

import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";

import { ALARM_CHANNEL_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "../alarm-channel-constants";
import {
  PagerDutyChannelConfigSchema,
  pagerDutyIntegrationKeyRegex,
  TAlarmChannelSendContext,
  TAlarmPayload,
  TChannelResult
} from "../alarm-channel-types";

const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";
const PAGERDUTY_TIMEOUT = 7 * 1000;
const MAX_ITEMS_IN_PAYLOAD = 10;

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
      total_items: number;
      items: Array<{ title: string; identifier?: string; fields: Record<string, string> }>;
      view_url: string;
    };
  };
  links: Array<{ href: string; text: string }>;
};

export const buildPagerDutyPayload = (payload: TAlarmPayload, integrationKey: string): TPagerDutyPayload => {
  const displayItems = payload.items.slice(0, MAX_ITEMS_IN_PAYLOAD);

  return {
    routing_key: integrationKey,
    event_action: "trigger",
    dedup_key: payload.alarm.id,
    payload: {
      summary: payload.summary,
      severity: payload.severity,
      source: `infisical-${payload.alarm.resourceType}`,
      timestamp: new Date().toISOString(),
      component: payload.resourceKind,
      group: payload.alarm.projectId ?? payload.alarm.orgId,
      class: payload.eventKey,
      custom_details: {
        alarm_name: payload.alarm.name,
        ...(payload.alarm.condition ? { condition: payload.alarm.condition } : {}),
        total_items: payload.items.length,
        items: displayItems.map((item) => ({
          title: item.title || "N/A",
          ...(item.identifier ? { identifier: item.identifier } : {}),
          fields: Object.fromEntries((item.fields ?? []).map((field) => [field.label, field.value]))
        })),
        view_url: payload.alarm.viewUrl
      }
    },
    links: [{ href: payload.alarm.viewUrl, text: "View in Infisical" }]
  };
};

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

export const sendPagerDutyNotification = async (ctx: TAlarmChannelSendContext): Promise<TChannelResult> => {
  const config = PagerDutyChannelConfigSchema.parse(ctx.config);

  if (!pagerDutyIntegrationKeyRegex.test(config.integrationKey)) {
    return { success: false, error: "Invalid PagerDuty integration key" };
  }

  const payload = buildPagerDutyPayload(ctx.payload, config.integrationKey);
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
          { channelId: ctx.channelId, statusCode: lastError.response?.status, error: lastError.message },
          `Alarm PagerDuty error is not retryable (4xx or non-transient) [channelId=${ctx.channelId}]`
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
        `Alarm PagerDuty failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"} [channelId=${ctx.channelId}]`
      );

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};
