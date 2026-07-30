import { AxiosError } from "axios";

import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";

import {
  ALERT_CHANNEL_HTTP_TIMEOUT,
  PagerDutyChannelConfigSchema,
  TAlertChannelSendContext,
  TAlertItem,
  TAlertPayload,
  TChannelResult
} from "../alert-channel-types";

const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";
export const PAGERDUTY_MAX_INCIDENTS_PER_RUN = 10;
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
      alert_name: string;
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
  payload: TAlertPayload,
  item: TAlertItem,
  integrationKey: string
): TPagerDutyPayload => ({
  routing_key: integrationKey,
  event_action: "trigger",
  dedup_key: `${payload.alert.id}:${item.id}`,
  payload: {
    summary: `${payload.summary} — ${item.title}`.slice(0, PAGERDUTY_SUMMARY_MAX_LENGTH),
    severity: payload.severity,
    source: `infisical-${payload.alert.resourceType}`,
    timestamp: new Date().toISOString(),
    component: payload.resourceKind,
    group: payload.alert.projectId ?? payload.alert.orgId,
    class: payload.eventKey,
    custom_details: {
      alert_name: payload.alert.name,
      ...(payload.alert.condition ? { condition: payload.alert.condition } : {}),
      title: item.title || "N/A",
      ...(item.identifier ? { identifier: item.identifier } : {}),
      fields: Object.fromEntries((item.fields ?? []).map((field) => [field.label, field.value])),
      view_url: payload.alert.viewUrl
    }
  },
  links: [{ href: payload.alert.viewUrl, text: "View in Infisical" }]
});

const triggerPagerDutyEvent = async (payload: TPagerDutyPayload): Promise<void> => {
  await safeRequest.post(PAGERDUTY_EVENTS_URL, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: ALERT_CHANNEL_HTTP_TIMEOUT,
    signal: AbortSignal.timeout(ALERT_CHANNEL_HTTP_TIMEOUT)
  });
};

export const sendPagerDutyNotification = async (ctx: TAlertChannelSendContext): Promise<TChannelResult> => {
  const config = PagerDutyChannelConfigSchema.parse(ctx.config);

  const targetResults = await Promise.all(
    ctx.payload.items.map(async (item) => {
      try {
        await triggerPagerDutyEvent(buildPagerDutyEvent(ctx.payload, item, config.integrationKey));
        return { targetId: item.id, success: true };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.info(
          { channelId: ctx.channelId, statusCode: (err as AxiosError).response?.status, error },
          `Alert PagerDuty delivery failed [channelId=${ctx.channelId}] [targetId=${item.id}]`
        );
        return { targetId: item.id, success: false, error };
      }
    })
  );

  const errors = targetResults.filter((result) => !result.success && result.error).map((result) => result.error);
  if (errors.length > 0) {
    return { success: false, error: errors.join("; "), targetResults };
  }
  return { success: true, targetResults };
};
