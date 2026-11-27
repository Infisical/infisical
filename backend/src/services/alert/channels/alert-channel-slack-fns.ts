import RE2 from "re2";

import { TSlackBlock, TSlackPayload } from "@app/lib/slack/slack-webhook";
import { safeRequest } from "@app/lib/validator";

import {
  ALERT_CHANNEL_HTTP_TIMEOUT,
  SlackChannelConfigSchema,
  TAlertChannelSendContext,
  TAlertPayload,
  TAlertSeverity,
  TChannelResult
} from "../alert-channel-types";
import { AlertMessageOutcome, TAlertMessageResolution } from "../alert-types";

const MAX_ITEMS_DISPLAYED = 2;

export const escapeSlackText = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

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
    const name = item.title ? escapeSlackText(item.title) : "N/A";
    const linkedName = item.url ? `<${item.url}|${name}>` : name;
    const fields: Array<{ type: "mrkdwn"; text: string }> = [{ type: "mrkdwn", text: `*Name:*\n${linkedName}` }];
    if (item.identifier)
      fields.push({ type: "mrkdwn", text: `*Identifier:*\n\`${escapeSlackText(item.identifier)}\`` });
    (item.fields ?? []).forEach((field) => {
      fields.push({ type: "mrkdwn", text: `*${escapeSlackText(field.label)}:*\n${escapeSlackText(field.value)}` });
    });

    itemBlocks.push({ type: "section", fields });
    if (index < displayItems.length - 1) itemBlocks.push({ type: "divider" });
  });

  const attachmentBlocks: TSlackBlock[] = [
    { type: "section", text: { type: "mrkdwn", text: escapeSlackText(payload.summary) } },
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
    text: escapeSlackText(`${headerText} - ${payload.summary}`),
    blocks: [{ type: "header", text: { type: "plain_text", text: headerText, emoji: true } }],
    attachments: [{ color, blocks: attachmentBlocks }]
  };
};

const OUTCOME_DISPLAY: Record<
  AlertMessageOutcome,
  { emoji: string; label: string; color: string; commentLabel?: string }
> = {
  [AlertMessageOutcome.Approved]: {
    emoji: "✅",
    label: "Approved",
    color: "#2eb67d",
    commentLabel: "Reviewer Comment"
  },
  [AlertMessageOutcome.Denied]: { emoji: "❌", label: "Denied", color: "#da3633", commentLabel: "Reviewer Comment" },
  [AlertMessageOutcome.BreakGlass]: {
    emoji: "⚠️",
    label: "Approved with break-glass",
    color: "#f0b429",
    commentLabel: "Break-Glass Reason"
  },
  [AlertMessageOutcome.Cancelled]: { emoji: "🚫", label: "Cancelled", color: "#8b949e" },
  [AlertMessageOutcome.Expired]: { emoji: "⌛", label: "Expired", color: "#8b949e" }
};

const MAX_HEADER_LENGTH = 150;
const MAX_ACTOR_LENGTH = 200;
const MAX_COMMENT_LENGTH = 1000;

const WHITESPACE_RUN = new RE2("\\s+", "g");

// Collapses user text to one line so it can't add lines that look like part of the message.
const toSingleLine = (value: string, maxLength: number): string => {
  const line = value.replace(WHITESPACE_RUN, " ").trim();
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
};

const stripSlackFormatting = (value: string): string =>
  ["*", "_", "~", "`"].reduce((text, marker) => text.replaceAll(marker, ""), value);

export const buildResolvedSlackPayload = (
  message: TSlackPayload,
  resolution: TAlertMessageResolution
): TSlackPayload => {
  const display = OUTCOME_DISPLAY[resolution.outcome];
  const actor = resolution.actorName
    ? ` by ${escapeSlackText(stripSlackFormatting(toSingleLine(resolution.actorName, MAX_ACTOR_LENGTH)))}`
    : "";
  const unixSeconds = Math.floor(resolution.resolvedAt.getTime() / 1000);
  const when = `<!date^${unixSeconds}^{date_short_pretty} at {time}|${resolution.resolvedAt.toUTCString()}>`;

  const outcome = `${display.emoji} ${display.label}`;

  // Slack lists the header first, so a decided request has to look different there to stand out from pending ones.
  const blocks: TSlackBlock[] = message.blocks.map((block) =>
    block.type === "header"
      ? {
          ...block,
          text: { ...block.text, text: toSingleLine(`${outcome} · ${block.text.text}`, MAX_HEADER_LENGTH) }
        }
      : block
  );
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${display.label}*${actor} · ${when}` } });
  if (resolution.comment && display.commentLabel) {
    blocks.push({
      type: "context",
      elements: [
        { type: "plain_text", text: `${display.commentLabel}: ${toSingleLine(resolution.comment, MAX_COMMENT_LENGTH)}` }
      ]
    });
  }

  return {
    ...message,
    text: `${outcome}: ${message.text}`,
    blocks,
    attachments: (message.attachments ?? []).map((attachment) => ({ ...attachment, color: display.color }))
  };
};

const triggerSlackWebhook = async (url: string, payload: TSlackPayload): Promise<void> => {
  await safeRequest.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: ALERT_CHANNEL_HTTP_TIMEOUT,
    signal: AbortSignal.timeout(ALERT_CHANNEL_HTTP_TIMEOUT)
  });
};

export const sendSlackNotification = async (ctx: TAlertChannelSendContext): Promise<TChannelResult> => {
  const config = SlackChannelConfigSchema.parse(ctx.config);
  const payload = buildSlackPayload(ctx.payload);

  await triggerSlackWebhook(config.webhookUrl, payload);
  return { success: true };
};
