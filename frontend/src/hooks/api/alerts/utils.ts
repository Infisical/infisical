import {
  AlertChannelType,
  TAlert,
  TAlertChannelInput,
  TChannelForm,
  WEBHOOK_AUTH_FIELDS,
  WebhookAuthType
} from "./types";

export const toChannelForm = (channel: TAlert["channels"][number]): TChannelForm => ({
  id: channel.id,
  channelType: channel.channelType,
  name: channel.name,
  enabled: channel.enabled,
  recipients: channel.recipients,
  webhookUrl: "",
  url: (channel.config.url as string) ?? "",
  signingSecret: "",
  signingSecretEnabled: Boolean(channel.config.hasSigningSecret),
  authType: channel.config.authType as WebhookAuthType | undefined,
  authCredentials: "",
  basicUsername: (channel.config.basicUsername as string) ?? "",
  basicPassword: "",
  authHeaderName: (channel.config.authHeaderName as string) ?? "",
  authHeaderValue: "",
  headers: (channel.config.headers as TChannelForm["headers"]) ?? [],
  integrationKey: "",
  hasWebhookUrl: Boolean(channel.config.hasWebhookUrl),
  hasSigningSecret: Boolean(channel.config.hasSigningSecret),
  hasAuthCredentials: Boolean(channel.config.hasAuthCredentials),
  hasBasicPassword: Boolean(channel.config.hasBasicPassword),
  hasAuthHeaderValue: Boolean(channel.config.hasAuthHeaderValue),
  hasIntegrationKey: Boolean(channel.config.hasIntegrationKey),
  savedUrl: channel.config.url as string | undefined
});

const filled = (fields: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value));

const toWebhookAuthConfig = (channel: TChannelForm) => {
  if (!channel.authType) return {};
  const { name, secret } = WEBHOOK_AUTH_FIELDS[channel.authType];
  return filled({
    authType: channel.authType,
    ...(name ? { [name.field]: channel[name.field] } : {}),
    [secret.field]: channel[secret.field]
  });
};

const toWebhookSigningSecretConfig = (channel: TChannelForm) => {
  if (channel.signingSecretEnabled) return filled({ signingSecret: channel.signingSecret });
  return channel.hasSigningSecret ? { signingSecret: null } : {};
};

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
          ...toWebhookSigningSecretConfig(channel),
          ...toWebhookAuthConfig(channel),
          ...(channel.headers.length ? { headers: channel.headers } : {})
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
