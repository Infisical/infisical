import { AlertChannelType, TAlertChannelInput, TChannelForm } from "./types";

export const toChannelInput = (channel: TChannelForm): TAlertChannelInput => {
  const base: TAlertChannelInput = {
    ...(channel.id ? { id: channel.id } : {}),
    name: channel.name,
    channelType: channel.channelType,
    enabled: channel.enabled
  };

  switch (channel.channelType) {
    case AlertChannelType.Email:
      return { ...base, config: {}, recipients: channel.recipients };
    case AlertChannelType.Slack:
      return { ...base, config: channel.webhookUrl ? { webhookUrl: channel.webhookUrl } : {} };
    case AlertChannelType.Webhook:
      return {
        ...base,
        config: {
          url: channel.url,
          ...(channel.signingSecret ? { signingSecret: channel.signingSecret } : {})
        }
      };
    case AlertChannelType.PagerDuty:
      return {
        ...base,
        config: channel.integrationKey ? { integrationKey: channel.integrationKey } : {}
      };
    default:
      return { ...base, config: {} };
  }
};

// The backend stores an alert's lead time as a whole number of days, e.g. "30d".
const ALERT_BEFORE_PATTERN = /^(\d+)d$/;

export const parseAlertBeforeDays = (alertBefore?: string): number | null => {
  const match = alertBefore?.match(ALERT_BEFORE_PATTERN);
  return match ? parseInt(match[1], 10) : null;
};

export const toAlertBefore = (days: number): string => `${days}d`;

// "30d" -> "alert 30 days before". Empty string when the value is missing or malformed.
export const formatAlertBefore = (alertBefore?: string): string => {
  const days = parseAlertBeforeDays(alertBefore);
  if (days === null) return "";
  return `alert ${days} day${days === 1 ? "" : "s"} before`;
};
