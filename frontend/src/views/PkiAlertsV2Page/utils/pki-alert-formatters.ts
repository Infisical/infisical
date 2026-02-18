import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import { faBell, faEnvelope, faLink } from "@fortawesome/free-solid-svg-icons";

import {
  PkiAlertChannelTypeV2,
  PkiAlertEventTypeV2,
  TPkiAlertChannelConfigEmail,
  TPkiAlertChannelConfigPagerDuty,
  TPkiAlertChannelConfigSlack,
  TPkiAlertChannelConfigWebhook
} from "@app/hooks/api/pkiAlertsV2";

/**
 * Formats the alert event type enum into a human-readable string.
 */
export const formatEventType = (eventType: PkiAlertEventTypeV2): string => {
  switch (eventType) {
    case PkiAlertEventTypeV2.EXPIRATION:
      return "Certificate Expiration";
    case PkiAlertEventTypeV2.RENEWAL:
      return "Certificate Renewal";
    case PkiAlertEventTypeV2.ISSUANCE:
      return "Certificate Issuance";
    case PkiAlertEventTypeV2.REVOCATION:
      return "Certificate Revocation";
    default:
      return eventType;
  }
};

/**
 * Converts alert timing notation (e.g., "30d") to readable format (e.g., "30 days").
 * Returns the fallback value for undefined/null values.
 */
export const formatAlertBefore = (alertBefore?: string, fallback = "-"): string => {
  if (!alertBefore) return fallback;

  const match = alertBefore.match(/^(\d+)([dwmy])$/);
  if (!match) return alertBefore;

  const [, value, unit] = match;
  const unitMap: Record<string, string> = {
    d: "days",
    w: "weeks",
    m: "months",
    y: "years"
  };

  return `${value} ${unitMap[unit] || unit}`;
};

/**
 * Returns the appropriate FontAwesome icon for a channel type.
 */
export const getChannelIcon = (type: PkiAlertChannelTypeV2): IconDefinition => {
  switch (type) {
    case PkiAlertChannelTypeV2.EMAIL:
      return faEnvelope;
    case PkiAlertChannelTypeV2.WEBHOOK:
      return faLink;
    case PkiAlertChannelTypeV2.SLACK:
      return faSlack;
    case PkiAlertChannelTypeV2.PAGERDUTY:
      return faBell;
    default:
      return faEnvelope;
  }
};

/**
 * Extracts hostname from a webhook URL for display purposes.
 * Returns the URL or "Not configured" if parsing fails.
 */
export const getWebhookHostname = (url: string): string => {
  if (!url) return "Not configured";
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url || "Not configured";
  }
};

/**
 * Generates a brief summary string for a channel configuration.
 * Used in collapsed accordion headers and review panels.
 *
 * For email: shows recipients (truncated if >2)
 * For webhook: shows hostname from URL
 * For slack: shows "Slack webhook configured"
 */
export const getChannelSummary = (channel: {
  channelType: PkiAlertChannelTypeV2;
  config:
    | TPkiAlertChannelConfigEmail
    | TPkiAlertChannelConfigWebhook
    | TPkiAlertChannelConfigSlack
    | TPkiAlertChannelConfigPagerDuty;
}): string => {
  if (channel.channelType === PkiAlertChannelTypeV2.EMAIL) {
    const config = channel.config as TPkiAlertChannelConfigEmail;
    const count = config.recipients.length;
    if (count === 0) return "No recipients";
    if (count <= 2) return config.recipients.join(", ");
    return `${config.recipients.slice(0, 2).join(", ")} +${count - 2}`;
  }
  if (channel.channelType === PkiAlertChannelTypeV2.WEBHOOK) {
    const config = channel.config as TPkiAlertChannelConfigWebhook;
    return getWebhookHostname(config.url);
  }
  if (channel.channelType === PkiAlertChannelTypeV2.SLACK) {
    const config = channel.config as TPkiAlertChannelConfigSlack;
    return config.webhookUrl ? "Slack webhook configured" : "Not configured";
  }
  if (channel.channelType === PkiAlertChannelTypeV2.PAGERDUTY) {
    return "PagerDuty integration configured";
  }
  return "";
};

/**
 * Returns the proper display name for a channel type.
 * Handles special casing like "PagerDuty".
 */
export const getChannelDisplayName = (type: PkiAlertChannelTypeV2): string => {
  switch (type) {
    case PkiAlertChannelTypeV2.EMAIL:
      return "Email";
    case PkiAlertChannelTypeV2.WEBHOOK:
      return "Webhook";
    case PkiAlertChannelTypeV2.SLACK:
      return "Slack";
    case PkiAlertChannelTypeV2.PAGERDUTY:
      return "PagerDuty";
    default:
      return type;
  }
};
