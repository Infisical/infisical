import { AxiosError } from "axios";

import { delay } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";

import { ALARM_CHANNEL_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "../alarm-channel-constants";
import {
  SlackChannelConfigSchema,
  TAlarmChannelSendContext,
  TAlarmPayload,
  TAlarmSeverity,
  TChannelResult
} from "../alarm-channel-types";

const SLACK_WEBHOOK_TIMEOUT = 7 * 1000;
const MAX_ITEMS_DISPLAYED = 2;

type TSlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string; emoji?: boolean } }
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "section"; fields: Array<{ type: "mrkdwn"; text: string }> }
  | { type: "context"; elements: Array<{ type: "mrkdwn"; text: string }> }
  | { type: "divider" }
  | {
      type: "actions";
      elements: Array<{
        type: "button";
        text: { type: "plain_text"; text: string; emoji?: boolean };
        url: string;
        style?: "primary" | "danger";
      }>;
    };

type TSlackPayload = {
  text: string;
  blocks: TSlackBlock[];
  attachments?: Array<{ color: string; blocks: TSlackBlock[] }>;
};

const SEVERITY_COLOR: Record<TAlarmSeverity, string> = {
  critical: "#da3633",
  error: "#da3633",
  warning: "#f0b429",
  info: "#1f6feb"
};

export const validateSlackWebhookUrl = (url: string): void => {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "https:") {
    throw new BadRequestError({ message: "Slack webhook URL must use HTTPS" });
  }

  if (parsedUrl.hostname !== "hooks.slack.com") {
    throw new BadRequestError({ message: "Invalid Slack webhook URL. Must be from hooks.slack.com" });
  }
};

export const buildSlackPayload = (payload: TAlarmPayload): TSlackPayload => {
  const totalItems = payload.items.length;
  const displayItems = payload.items.slice(0, MAX_ITEMS_DISPLAYED);
  const remainingCount = totalItems - displayItems.length;
  const color = SEVERITY_COLOR[payload.severity];

  const headerText = `${payload.resourceKind} ${payload.eventLabel} Alert: ${payload.alarm.name}`;

  const itemBlocks: TSlackBlock[] = [];
  displayItems.forEach((item, index) => {
    const fields: Array<{ type: "mrkdwn"; text: string }> = [
      { type: "mrkdwn", text: `*Name:*\n${item.title || "N/A"}` }
    ];
    if (item.identifier) fields.push({ type: "mrkdwn", text: `*Identifier:*\n\`${item.identifier}\`` });
    (item.fields ?? []).forEach((field) => {
      fields.push({ type: "mrkdwn", text: `*${field.label}:*\n${field.value}` });
    });

    itemBlocks.push({ type: "section", fields });
    if (index < displayItems.length - 1) itemBlocks.push({ type: "divider" });
  });

  const alarmInfoFields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `*Alarm:*\n${payload.alarm.name}` }
  ];
  if (payload.alarm.condition) {
    alarmInfoFields.push({ type: "mrkdwn", text: `*Alert Before:*\n${payload.alarm.condition}` });
  }

  const attachmentBlocks: TSlackBlock[] = [
    { type: "section", fields: alarmInfoFields },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: payload.summary } },
    ...itemBlocks
  ];

  if (remainingCount > 0) {
    attachmentBlocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_+${remainingCount} more..._` }]
    });
  }

  attachmentBlocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View in Infisical", emoji: true },
        url: payload.alarm.viewUrl,
        style: "primary"
      }
    ]
  });

  return {
    text: `${headerText} - ${payload.summary}`,
    blocks: [{ type: "header", text: { type: "plain_text", text: headerText, emoji: true } }],
    attachments: [{ color, blocks: attachmentBlocks }]
  };
};

const isSlackErrorRetryable = (err: AxiosError): boolean => {
  const status = err.response?.status;
  if (status && status >= 500) return true;
  if (err.code && RETRYABLE_NETWORK_ERRORS.includes(err.code)) return true;
  if (err.message?.toLowerCase().includes("timeout")) return true;
  return false;
};

const triggerSlackWebhook = async (url: string, payload: TSlackPayload): Promise<void> => {
  await safeRequest.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: SLACK_WEBHOOK_TIMEOUT,
    signal: AbortSignal.timeout(SLACK_WEBHOOK_TIMEOUT)
  });
};

export const sendSlackNotification = async (ctx: TAlarmChannelSendContext): Promise<TChannelResult> => {
  const config = SlackChannelConfigSchema.parse(ctx.config);

  validateSlackWebhookUrl(config.webhookUrl);

  const payload = buildSlackPayload(ctx.payload);
  const { maxRetries, delayMs } = ALARM_CHANNEL_RETRY_CONFIG;
  let lastError: AxiosError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await triggerSlackWebhook(config.webhookUrl, payload);
      return { success: true };
    } catch (err) {
      lastError = err as AxiosError;

      if (!isSlackErrorRetryable(lastError)) {
        logger.info(
          { channelId: ctx.channelId, statusCode: lastError.response?.status, error: lastError.message },
          `Alarm Slack error is not retryable (4xx or non-transient) [channelId=${ctx.channelId}]`
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
        `Alarm Slack failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"} [channelId=${ctx.channelId}]`
      );

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};
