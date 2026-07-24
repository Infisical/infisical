import RE2 from "re2";
import { z } from "zod";

import { TSmtpService } from "@app/services/smtp/smtp-service";

export enum AlertChannelType {
  EMAIL = "email",
  SLACK = "slack",
  WEBHOOK = "webhook",
  PAGERDUTY = "pagerduty"
}

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
  severity: TAlertSeverity;
  summary: string; // one-line human summary
  items: TAlertItem[];
};

export type TChannelResult = { success: boolean; error?: string };

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

export const pagerDutyIntegrationKeyRegex = new RE2("^[a-f0-9]{32}$", "i");

export const PagerDutyChannelConfigSchema = z.object({
  integrationKey: z
    .string()
    .refine((val) => pagerDutyIntegrationKeyRegex.test(val), "Integration key must be a 32-character hex string")
});
