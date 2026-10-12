import RE2 from "re2";
import { z } from "zod";

import { PAGERDUTY_INTEGRATION_KEY_ERROR, pagerDutyIntegrationKeyRegex } from "@app/lib/pagerduty/integration-key";
import { TSmtpService } from "@app/services/smtp/smtp-service";

export const ALERT_CHANNEL_HTTP_TIMEOUT = 7 * 1000;

export const ALERT_CHANNEL_REDACTED_VALUE = "******";

export enum AlertChannelType {
  EMAIL = "email",
  SLACK = "slack",
  WEBHOOK = "webhook",
  PAGERDUTY = "pagerduty"
}

// Channel types that address individual principals and therefore cannot deliver without recipients.
// Kept here rather than read off ALERT_CHANNEL_REGISTRY so the DALs don't have to pull in the send
// implementations; alert-channels.test.ts asserts the two stay in agreement.
export const DIRECTED_ALERT_CHANNEL_TYPES: AlertChannelType[] = [AlertChannelType.EMAIL];

export type TAlertSeverity = "critical" | "error" | "warning" | "info";

export type TAlertItem = {
  id: string;
  title: string; // primary label (e.g. certificate common name, client-secret description)
  identifier?: string; // secondary label (e.g. serial number, client-secret id)
  fields?: Array<{ label: string; value: string }>; // extra display key-values (expiry date, days left, reason)
  summary?: string;
  severity?: TAlertSeverity;
  resource?: Record<string, unknown>;
};

export type TAlertPayload = {
  alert: {
    id: string;
    name: string;
    orgId: string;
    projectId?: string;
    resourceType: string; // dot-namespaced, e.g. "pki.certificate"
    resourceId?: string;
    condition?: string; // display label for the "when", e.g. "30d"
    viewUrl: string; // deep link into the app, built by the provider
  };
  eventKey: string; // dot-namespaced event, e.g. "pki.certificate.expiration"
  eventLabel: string; // human label, e.g. "Expiration"
  webhookType: string; // CloudEvents `type` string, e.g. "com.infisical.pki.certificate.expiration"
  webhookSource?: string;
  resourceKind: string; // display noun, e.g. "Certificate", "Client Secret"
  resourceOwnerKind: string; // display noun of the entity the alert is configured on, e.g. "Machine Identity"
  severity: TAlertSeverity;
  summary: string; // one-line human summary
  items: TAlertItem[];
};

export type TChannelTargetResult = { targetId: string; success: boolean; error?: string };

export type TChannelResult = { success: boolean; error?: string; targetResults?: TChannelTargetResult[] };

export type TAlertRecipient = {
  userId?: string;
  email: string;
  firstName?: string | null;
};

export type TAlertChannelDeps = {
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TAlertChannelSendContext = {
  channelId: string;
  config: unknown; // raw config; each channel validates against its own schema
  payload: TAlertPayload;
  recipient?: TAlertRecipient; // present for directed channels
  deps: TAlertChannelDeps;
};

export type TAlertChannelDefinition = {
  type: AlertChannelType;
  directed: boolean;
  secretFields: string[];
  configSchema: z.ZodTypeAny;
  maxTargetsPerRun?: number;
  redactConfig?: (config: Record<string, unknown>) => Record<string, unknown>;
  restoreRedactedConfig?: (
    incomingConfig: Record<string, unknown>,
    storedConfig: Record<string, unknown>
  ) => Record<string, unknown>;
  send: (ctx: TAlertChannelSendContext) => Promise<TChannelResult>;
};

export const EmailChannelConfigSchema = z.object({}).strip();

export const WEBHOOK_MAX_HEADERS = 20;

const WEBHOOK_RESERVED_HEADERS = [
  "content-type",
  "x-infisical-signature",
  "content-length",
  "transfer-encoding",
  "connection",
  "host"
];

const httpHeaderNameRegex = new RE2("^[A-Za-z0-9!#$%&'*+.^_`|~-]+$");
const noLineBreaksRegex = new RE2("^[^\\r\\n]*$");

export const WebhookChannelHeaderSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "Header names cannot be empty")
      .max(128, "Header names cannot be longer than 128 characters")
      .refine(
        (key) => httpHeaderNameRegex.test(key),
        "Header names can only contain letters, digits, and -_.!#$%&'*+^`|~"
      )
      .refine(
        (key) => !WEBHOOK_RESERVED_HEADERS.includes(key.toLowerCase()),
        (key) => ({ message: `Header '${key}' is set by Infisical and cannot be overridden` })
      ),
    value: z
      .string()
      .min(1, "Header values cannot be empty")
      .max(4096, "Header values cannot be longer than 4096 characters")
      .refine((value) => noLineBreaksRegex.test(value), "Header values cannot contain line breaks")
  })
  .refine(
    (header) => header.value !== ALERT_CHANNEL_REDACTED_VALUE,
    (header) => ({
      message: `Header '${header.key}' has no saved value to keep. Enter a value for it`,
      path: ["value"]
    })
  );

export type TWebhookChannelHeader = z.infer<typeof WebhookChannelHeaderSchema>;

export const WebhookChannelConfigSchema = z.object({
  url: z
    .string()
    .max(2048)
    .url()
    .refine((url) => url.startsWith("https://"), "Webhook URL must use HTTPS"),
  signingSecret: z.string().max(256).optional().nullable(),
  headers: z
    .array(WebhookChannelHeaderSchema)
    .max(WEBHOOK_MAX_HEADERS, `A webhook channel can have at most ${WEBHOOK_MAX_HEADERS} headers`)
    .optional()
    .refine(
      (headers) => {
        const names = (headers ?? []).map((header) => header.key.toLowerCase());
        return new Set(names).size === names.length;
      },
      { message: "Header names must be unique" }
    )
});

export const SlackChannelConfigSchema = z.object({
  webhookUrl: z
    .string()
    .max(2048)
    .url()
    .refine((url) => url.startsWith("https://"), "Slack webhook URL must use HTTPS")
    .refine((url) => {
      try {
        return new URL(url).hostname === "hooks.slack.com";
      } catch {
        return false;
      }
    }, "Slack webhook URL must be from hooks.slack.com")
});

export const PagerDutyChannelConfigSchema = z.object({
  integrationKey: z
    .string()
    .max(256)
    .refine((val) => pagerDutyIntegrationKeyRegex.test(val), PAGERDUTY_INTEGRATION_KEY_ERROR)
});
