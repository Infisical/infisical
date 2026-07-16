import { z } from "zod";

// Resource types an alarm can attach to. Only identity credentials are supported for now.
export enum AlarmResourceType {
  IdentityCredential = "identity.credential"
}

// Events an alarm can fire on. Only expiration is supported for now.
export enum AlarmEventType {
  IdentityCredentialExpiry = "identity.credential.expiry"
}

export enum AlarmChannelType {
  Email = "email",
  Slack = "slack",
  Webhook = "webhook",
  PagerDuty = "pagerduty"
}

export enum AlarmPrincipalType {
  User = "user",
  Group = "group",
  Role = "role",
  Email = "email"
}

export enum AlarmTimeUnit {
  Days = "d",
  Weeks = "w",
  Months = "m",
  Years = "y"
}

export const ALARM_TIME_UNIT_LABELS: Record<AlarmTimeUnit, string> = {
  [AlarmTimeUnit.Days]: "days",
  [AlarmTimeUnit.Weeks]: "weeks",
  [AlarmTimeUnit.Months]: "months",
  [AlarmTimeUnit.Years]: "years"
};

export const ALARM_PRINCIPAL_TYPE_LABELS: Record<AlarmPrincipalType, string> = {
  [AlarmPrincipalType.Email]: "Email",
  [AlarmPrincipalType.User]: "User",
  [AlarmPrincipalType.Group]: "Group",
  [AlarmPrincipalType.Role]: "Role"
};

export const ALARM_RESOURCE_TYPE_LABELS: Record<AlarmResourceType, string> = {
  [AlarmResourceType.IdentityCredential]: "Identity Credential"
};

export const ALARM_EVENT_TYPE_LABELS: Record<AlarmEventType, string> = {
  [AlarmEventType.IdentityCredentialExpiry]: "Expiration"
};

export const ALARM_CHANNEL_TYPE_LABELS: Record<AlarmChannelType, string> = {
  [AlarmChannelType.Email]: "Email",
  [AlarmChannelType.Slack]: "Slack",
  [AlarmChannelType.Webhook]: "Webhook",
  [AlarmChannelType.PagerDuty]: "PagerDuty"
};

export type TAlarmRecipient = {
  principalType: AlarmPrincipalType;
  principalId: string;
};

export type TAlarmChannel = {
  id: string;
  channelType: AlarmChannelType;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TAlarm = {
  id: string;
  name: string;
  description: string | null;
  resourceType: string;
  resourceId: string | null;
  eventType: string;
  condition: { alertBefore?: string } | null;
  filters: unknown | null;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  recipients: TAlarmRecipient[];
  channels: TAlarmChannel[];
  createdAt: string;
  updatedAt: string;
};

export type TListAlarmsDTO = {
  resourceType: string;
  projectId?: string;
  resourceId?: string;
  enabled?: boolean;
};

export type TAlarmChannelInput = {
  // Present when editing an existing channel; lets the server preserve secret fields left blank.
  id?: string;
  channelType: AlarmChannelType;
  config: Record<string, unknown>;
  enabled?: boolean;
};

export type TCreateAlarmDTO = {
  name: string;
  description?: string;
  resourceType: string;
  resourceId?: string | null;
  eventType: string;
  condition?: unknown;
  filters?: unknown;
  enabled?: boolean;
  projectId?: string | null;
  recipients: TAlarmRecipient[];
  channels: TAlarmChannelInput[];
};

export type TUpdateAlarmDTO = {
  alarmId: string;
  // Carried only so mutations can invalidate the right scope; not sent to the API.
  projectId?: string | null;
  name?: string;
  description?: string | null;
  condition?: unknown;
  filters?: unknown;
  enabled?: boolean;
  recipients?: TAlarmRecipient[];
  channels?: TAlarmChannelInput[];
};

export type TDeleteAlarmDTO = {
  alarmId: string;
  projectId?: string | null;
};

// --- Form schema (mirrors the PKI alert channel schemas) ---

// A recipient chosen in the form. `label` is display-only (not sent to the API); `principalId` is
// the user id, group id, role slug, or raw email address depending on `principalType`.
export const alarmRecipientFormSchema = z.object({
  principalType: z.nativeEnum(AlarmPrincipalType),
  principalId: z.string().min(1),
  label: z.string().optional()
});

export type TAlarmRecipientForm = z.infer<typeof alarmRecipientFormSchema>;

const emailChannelConfigSchema = z.object({
  recipients: z
    .array(alarmRecipientFormSchema)
    .min(1, "At least one recipient is required")
    .refine((recipients) => recipients.length <= 100, "Maximum 100 recipients allowed")
    .refine(
      (recipients) =>
        recipients
          .filter((recipient) => recipient.principalType === AlarmPrincipalType.Email)
          .every((recipient) => z.string().email().safeParse(recipient.principalId).success),
      "All email recipients must be valid email addresses"
    )
    .refine(
      (recipients) =>
        new Set(recipients.map((r) => `${r.principalType}:${r.principalId}`)).size ===
        recipients.length,
      "Duplicate recipients are not allowed"
    )
});

const slackChannelConfigSchema = z.object({
  webhookUrl: z
    .string()
    .optional()
    .refine((url) => {
      if (!url) return true;
      try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && parsed.hostname === "hooks.slack.com";
      } catch {
        return false;
      }
    }, "Must be a valid https://hooks.slack.com/... URL")
});

const webhookChannelConfigSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .refine((url) => url.startsWith("https://"), "Webhook URL must use HTTPS"),
  signingSecret: z.string().max(256).nullable().optional()
});

const pagerdutyChannelConfigSchema = z.object({
  integrationKey: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[a-f0-9]{32}$/i.test(val),
      "Integration key must be a 32-character hex string"
    )
});

export const alarmChannelFormSchema = z.discriminatedUnion("channelType", [
  z.object({
    id: z.string().optional(),
    channelType: z.literal(AlarmChannelType.Email),
    config: emailChannelConfigSchema,
    enabled: z.boolean().default(true)
  }),
  z.object({
    id: z.string().optional(),
    channelType: z.literal(AlarmChannelType.Slack),
    config: slackChannelConfigSchema,
    enabled: z.boolean().default(true)
  }),
  z.object({
    id: z.string().optional(),
    channelType: z.literal(AlarmChannelType.Webhook),
    config: webhookChannelConfigSchema,
    enabled: z.boolean().default(true)
  }),
  z.object({
    id: z.string().optional(),
    channelType: z.literal(AlarmChannelType.PagerDuty),
    config: pagerdutyChannelConfigSchema,
    enabled: z.boolean().default(true)
  })
]);

export const alarmFormSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().max(1000).optional(),
    resourceType: z.nativeEnum(AlarmResourceType),
    eventType: z.nativeEnum(AlarmEventType),
    alertBeforeValue: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Must be a whole number")
      .min(1, "Must be at least 1")
      .max(3650, "Too large"),
    alertBeforeUnit: z.nativeEnum(AlarmTimeUnit),
    enabled: z.boolean().default(true),
    channels: z
      .array(alarmChannelFormSchema)
      .min(1, "At least one notification channel is required")
      .refine(
        (channels) => channels.some((channel) => channel.enabled),
        "At least one notification channel must be enabled"
      )
  })
  .superRefine((data, ctx) => {
    data.channels.forEach((channel, index) => {
      if (
        channel.channelType === AlarmChannelType.Slack &&
        !channel.id &&
        !channel.config.webhookUrl
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["channels", index, "config", "webhookUrl"],
          message: "Slack webhook URL is required"
        });
      }
      if (
        channel.channelType === AlarmChannelType.PagerDuty &&
        !channel.id &&
        !channel.config.integrationKey
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["channels", index, "config", "integrationKey"],
          message: "Integration key is required"
        });
      }
    });
  });

export type TAlarmForm = z.infer<typeof alarmFormSchema>;
