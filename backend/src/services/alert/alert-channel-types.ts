import { z } from "zod";

import { PAGERDUTY_INTEGRATION_KEY_ERROR, pagerDutyIntegrationKeyRegex } from "@app/lib/pagerduty/integration-key";
import { TSmtpService } from "@app/services/smtp/smtp-service";

export const ALERT_CHANNEL_HTTP_TIMEOUT = 7 * 1000;

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
};

export type TAlertPayload = {
  alert: {
    id: string;
    name: string;
    orgId: string;
    projectId?: string;
    resourceType: string; // dot-namespaced, e.g. "pki.certificate"
    condition?: string; // display label for the "when", e.g. "30d"
    viewUrl: string; // deep link into the app, built by the provider
  };
  eventKey: string; // dot-namespaced event, e.g. "pki.certificate.expiration"
  eventLabel: string; // human label, e.g. "Expiration"
  webhookType: string; // CloudEvents `type` string, e.g. "com.infisical.pki.certificate.expiration"
  resourceKind: string; // display noun, e.g. "Certificate", "Client Secret"
  resourceOwnerKind: string; // display noun of the entity the alert is configured on, e.g. "Machine Identity"
  severity: TAlertSeverity;
  summary: string; // one-line human summary
  // Optional replacement for the email body's default sentence, which is phrased for something about
  // to happen ("take action before X"). A provider whose event has already occurred supplies its own.
  detailLine?: string;
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
  send: (ctx: TAlertChannelSendContext) => Promise<TChannelResult>;
};

export const EmailChannelConfigSchema = z.object({}).strip();

export const WebhookChannelConfigSchema = z.object({
  url: z
    .string()
    .url()
    .refine((url) => url.startsWith("https://"), "Webhook URL must use HTTPS"),
  signingSecret: z.string().max(256).optional().nullable()
});

export const SlackChannelConfigSchema = z.object({
  webhookUrl: z
    .string()
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
  integrationKey: z.string().refine((val) => pagerDutyIntegrationKeyRegex.test(val), PAGERDUTY_INTEGRATION_KEY_ERROR)
});
