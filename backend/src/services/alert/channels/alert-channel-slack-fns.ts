import { SLACK_WEBHOOK_TIMEOUT, TSlackBlock, TSlackPayload } from "@app/lib/slack/slack-webhook";
import { safeRequest } from "@app/lib/validator";

import {
  SlackChannelConfigSchema,
  TAlertChannelSendContext,
  TAlertPayload,
  TAlertSeverity,
  TChannelResult
} from "../alert-channel-types";
import { isAxiosErrorRetryable, retryWithBackoff } from "./alert-channel-retry-fns";

const MAX_ITEMS_DISPLAYED = 2;

const SEVERITY_COLOR: Record<TAlertSeverity, string> = {
  critical: "#da3633",
  error: "#da3633",
  warning: "#f0b429",
  info: "#1f6feb"
};

export const buildSlackPayload = (payload: TAlertPayload): TSlackPayload => {
  const totalItems = payload.items.length;
  const displayItems = payload.items.slice(0, MAX_ITEMS_DISPLAYED);
  const remainingCount = totalItems - displayItems.length;
  const color = SEVERITY_COLOR[payload.severity];

  const headerText = `${payload.resourceKind} ${payload.eventLabel} Alert: ${payload.alert.name}`;

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

  const alertInfoFields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `*Alert:*\n${payload.alert.name}` }
  ];
  if (payload.alert.condition) {
    alertInfoFields.push({ type: "mrkdwn", text: `*Alert Before:*\n${payload.alert.condition}` });
  }

  const attachmentBlocks: TSlackBlock[] = [
    { type: "section", fields: alertInfoFields },
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
        url: payload.alert.viewUrl,
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

const triggerSlackWebhook = async (url: string, payload: TSlackPayload): Promise<void> => {
  await safeRequest.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: SLACK_WEBHOOK_TIMEOUT,
    signal: AbortSignal.timeout(SLACK_WEBHOOK_TIMEOUT)
  });
};

export const sendSlackNotification = async (ctx: TAlertChannelSendContext): Promise<TChannelResult> => {
  const config = SlackChannelConfigSchema.parse(ctx.config);
  const payload = buildSlackPayload(ctx.payload);

  return retryWithBackoff(() => triggerSlackWebhook(config.webhookUrl, payload), isAxiosErrorRetryable, {
    channelId: ctx.channelId,
    channelLabel: "Slack"
  });
};
