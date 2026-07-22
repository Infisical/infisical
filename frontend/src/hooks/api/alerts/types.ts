import { z } from "zod";

export enum AlertResourceType {
  IdentityAuthentication = "identity.authentication"
}

export enum AlertEventType {
  IdentityCredentialExpiry = "identity.credential.expiry"
}

export enum AlertChannelType {
  Email = "email",
  Slack = "slack",
  Webhook = "webhook",
  PagerDuty = "pagerduty"
}

export enum AlertPrincipalType {
  User = "user",
  Group = "group"
}

export enum AlertTimeUnit {
  Days = "d",
  Weeks = "w",
  Months = "m",
  Years = "y"
}

export const ALERT_TIME_UNIT_LABELS: Record<AlertTimeUnit, string> = {
  [AlertTimeUnit.Days]: "days",
  [AlertTimeUnit.Weeks]: "weeks",
  [AlertTimeUnit.Months]: "months",
  [AlertTimeUnit.Years]: "years"
};

export const ALERT_RESOURCE_TYPE_LABELS: Record<AlertResourceType, string> = {
  [AlertResourceType.IdentityAuthentication]: "Machine Identity Authentication"
};

export const ALERT_EVENT_TYPE_LABELS: Record<AlertEventType, string> = {
  [AlertEventType.IdentityCredentialExpiry]: "Expiration"
};

export const ALERT_CHANNEL_TYPE_LABELS: Record<AlertChannelType, string> = {
  [AlertChannelType.Email]: "Email",
  [AlertChannelType.Slack]: "Slack",
  [AlertChannelType.Webhook]: "Webhook",
  [AlertChannelType.PagerDuty]: "PagerDuty"
};

export type TAlertChannelRecipient = {
  principalType: AlertPrincipalType;
  principalId: string;
};

export type TAlertChannelEmbedded = {
  id: string;
  name: string;
  channelType: AlertChannelType;
  directed: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  recipients: TAlertChannelRecipient[];
};

export type TAlert = {
  id: string;
  name: string;
  description: string | null;
  resourceType: string;
  resourceId: string | null;
  eventType: string;
  condition: { alertBefore?: string; dailyReminder?: boolean } | null;
  filters: unknown | null;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  channels: TAlertChannelEmbedded[];
  createdAt: string;
  updatedAt: string;
};

export type TListAlertsDTO = {
  resourceType: string;
  projectId?: string;
  resourceId?: string;
  enabled?: boolean;
};

export type TAlertChannelInput = {
  id?: string;
  name: string;
  channelType: AlertChannelType;
  config?: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TAlertChannelRecipient[];
};

export type TCreateAlertDTO = {
  name: string;
  description?: string;
  resourceType: string;
  resourceId?: string | null;
  eventType: string;
  condition?: unknown;
  filters?: unknown;
  enabled?: boolean;
  projectId?: string | null;
  channels: TAlertChannelInput[];
};

export type TUpdateAlertDTO = {
  alertId: string;
  projectId?: string | null;
  name?: string;
  description?: string | null;
  condition?: unknown;
  filters?: unknown;
  enabled?: boolean;
  channels?: TAlertChannelInput[];
};

export const channelFormSchema = z
  .object({
    id: z.string().optional(),
    channelType: z.nativeEnum(AlertChannelType),
    name: z.string().min(1, "Name is required").max(255),
    enabled: z.boolean().default(true),
    webhookUrl: z.string().optional(),
    url: z.string().optional(),
    signingSecret: z.string().optional(),
    integrationKey: z.string().optional(),
    recipients: z
      .array(
        z.object({
          principalType: z.nativeEnum(AlertPrincipalType),
          principalId: z.string()
        })
      )
      .default([]),
    hasWebhookUrl: z.boolean().optional(),
    hasSigningSecret: z.boolean().optional(),
    hasIntegrationKey: z.boolean().optional()
  })
  .superRefine((channel, ctx) => {
    const isNew = !channel.id;
    switch (channel.channelType) {
      case AlertChannelType.Email:
        if (channel.recipients.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["recipients"],
            message: "Add at least one recipient"
          });
        }
        break;
      case AlertChannelType.Slack:
        if ((isNew || !channel.hasWebhookUrl) && !channel.webhookUrl) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["webhookUrl"],
            message: "Webhook URL is required"
          });
        }
        break;
      case AlertChannelType.Webhook:
        if (!channel.url) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "URL is required" });
        }
        break;
      case AlertChannelType.PagerDuty:
        if ((isNew || !channel.hasIntegrationKey) && !channel.integrationKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["integrationKey"],
            message: "Integration key is required"
          });
        }
        break;
      default:
        break;
    }
  });

export type TChannelForm = z.infer<typeof channelFormSchema>;

export const alertFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(1000).optional(),
  resourceType: z.nativeEnum(AlertResourceType),
  eventType: z.nativeEnum(AlertEventType),
  alertBeforeValue: z
    .number({ invalid_type_error: "Enter a number" })
    .int("Must be a whole number")
    .min(1, "Must be at least 1")
    .max(3650, "Too large"),
  alertBeforeUnit: z.nativeEnum(AlertTimeUnit),
  dailyReminder: z.boolean().default(false),
  enabled: z.boolean().default(true),
  channels: z.array(channelFormSchema).min(1, "At least one channel is required")
});

export type TAlertForm = z.infer<typeof alertFormSchema>;
