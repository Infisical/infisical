import { z } from "zod";

import { CertSource } from "@app/hooks/api/certificates/enums";

export enum AlertResourceType {
  IdentityAuthentication = "identity.authentication",
  SecretReminder = "secret.reminder",
  AuditLogStream = "audit-log.stream"
}

export enum AlertEventType {
  IdentityAuthenticationExpiry = "identity.authentication.expiry",
  IdentityAuthMethodChanged = "identity.authentication.auth-method-changed",
  AuditLogStreamDeliveryFailed = "audit-log.stream.delivery-failed"
}

export enum AlertChannelType {
  Email = "email",
  Slack = "slack",
  Webhook = "webhook",
  PagerDuty = "pagerduty"
}

export enum AlertPrincipalType {
  User = "user",
  Group = "group",
  Email = "email",
  ProjectMembers = "project-members"
}

export enum AlertRunStatus {
  Success = "success",
  Partial = "partial",
  Failed = "failed"
}

export enum CertificateAlertResourceType {
  Application = "cert-manager.application",
  CertificateManager = "cert-manager",
  Signer = "cert-manager.signer"
}

export enum CertificateApplicationAlertEventType {
  Expiry = "cert-manager.application.certificate.expiry",
  Issuance = "cert-manager.application.certificate.issuance",
  Renewal = "cert-manager.application.certificate.renewal",
  Revocation = "cert-manager.application.certificate.revocation"
}

export enum SignerAlertEventType {
  CertificateExpiry = "cert-manager.signer.certificate.expiry"
}

export type TCertificateAlertEventType =
  | CertificateApplicationAlertEventType
  | SignerAlertEventType;

export enum CertificateManagerAlertEventType {
  Expiry = "cert-manager.certificate.expiry",
  Issuance = "cert-manager.certificate.issuance",
  Renewal = "cert-manager.certificate.renewal",
  Revocation = "cert-manager.certificate.revocation"
}

export const MIN_ALERT_BEFORE_DAYS = 1;
export const MAX_ALERT_BEFORE_DAYS = 90;
export const MAX_CERTIFICATE_ALERT_BEFORE_DAYS = 365;
export const MAX_CERTIFICATE_ALERT_FILTER_IDS = 100;

export const ALERT_RESOURCE_TYPE_LABELS: Record<AlertResourceType, string> = {
  [AlertResourceType.IdentityAuthentication]: "Machine Identity Authentication",
  [AlertResourceType.SecretReminder]: "Secret Reminder",
  [AlertResourceType.AuditLogStream]: "Audit Log Stream"
};

// Secret reminders have their own form, so they list no events here.
export const ALERT_RESOURCE_EVENT_TYPES: Record<AlertResourceType, AlertEventType[]> = {
  [AlertResourceType.IdentityAuthentication]: [
    AlertEventType.IdentityAuthenticationExpiry,
    AlertEventType.IdentityAuthMethodChanged
  ],
  [AlertResourceType.SecretReminder]: [],
  [AlertResourceType.AuditLogStream]: [AlertEventType.AuditLogStreamDeliveryFailed]
};

export const ALERT_EVENT_TYPE_LABELS: Record<AlertEventType, string> = {
  [AlertEventType.IdentityAuthenticationExpiry]: "Credential Expiration",
  [AlertEventType.IdentityAuthMethodChanged]: "Auth Method Change",
  [AlertEventType.AuditLogStreamDeliveryFailed]: "Delivery Failure"
};

export const ALERT_EVENT_TYPE_DESCRIPTIONS: Record<AlertEventType, string> = {
  [AlertEventType.IdentityAuthenticationExpiry]:
    "Notify a set number of days before a Universal Auth client secret or Token Auth access token expires.",
  [AlertEventType.IdentityAuthMethodChanged]:
    "Notify whenever an auth method is added, updated, or removed, or one of its credentials is created, updated, or revoked.",
  [AlertEventType.AuditLogStreamDeliveryFailed]:
    "Notify when audit log events are being dropped because an external log stream keeps failing to deliver them."
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
  enabled: boolean;
  config: Record<string, unknown>;
  recipients: TAlertChannelRecipient[];
};

export type TAlertFilterValue = { id: string; name: string | null };

export type TAlert = {
  id: string;
  name: string;
  description: string | null;
  resourceType: string;
  resourceId: string | null;
  eventType: string;
  condition: {
    alertBefore?: string;
    dailyReminder?: boolean;
    applicationIds?: string[];
    profileIds?: string[];
    sources?: CertSource[];
  } | null;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  resourceName: string | null;
  filters?: Record<string, TAlertFilterValue[]>;
  channels: TAlertChannelEmbedded[];
  lastRun: { timestamp: string; status: AlertRunStatus } | null;
  createdAt: string;
  updatedAt: string;
};

export type TListAlertsDTO = {
  resourceType: string;
  projectId?: string;
  resourceId?: string;
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
  enabled?: boolean;
  projectId?: string | null;
  channels: TAlertChannelInput[];
};

export type TTestAlertChannelDTO = {
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  alertId?: string;
  channelId?: string;
  channelType: AlertChannelType;
  config?: Record<string, unknown>;
  recipients?: TAlertChannelRecipient[];
};

export type TTestAlertChannelResponse = {
  success: boolean;
  deliveredTo?: number;
  error?: string;
};

export type TUpdateAlertDTO = {
  alertId: string;
  name?: string;
  description?: string | null;
  condition?: unknown;
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

// The part of an alert form the shared channel fields read and write.
export type TChannelsForm = { channels: TChannelForm[] };

const alertFormBaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(1000).optional(),
  resourceType: z.nativeEnum(AlertResourceType),
  eventType: z.nativeEnum(AlertEventType),
  // Only the expiry event reads these; validated in superRefine so a hidden field can't block submit.
  alertBeforeDays: z.number().or(z.nan()),
  dailyReminder: z.boolean().default(false),
  enabled: z.boolean().default(true),
  channels: z.array(channelFormSchema).min(1, "At least one channel is required")
});

const alertBeforeDaysIssue = (days: number): string | null => {
  if (Number.isNaN(days)) return "Enter a number";
  if (!Number.isInteger(days)) return "Must be a whole number";
  if (days < MIN_ALERT_BEFORE_DAYS) return `Must be at least ${MIN_ALERT_BEFORE_DAYS} day`;
  if (days > MAX_ALERT_BEFORE_DAYS) return `Must be at most ${MAX_ALERT_BEFORE_DAYS} days`;
  return null;
};

export const alertFormSchema = alertFormBaseSchema.superRefine((form, ctx) => {
  if (form.eventType !== AlertEventType.IdentityAuthenticationExpiry) return;
  const message = alertBeforeDaysIssue(form.alertBeforeDays);
  if (message) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["alertBeforeDays"], message });
  }
});

export type TAlertForm = z.infer<typeof alertFormSchema>;
