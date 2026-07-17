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

// Lightweight channel reference embedded in an alarm (full channel lives in the alarmChannels domain).
export type TAlarmChannelSummary = {
  id: string;
  name: string;
  channelType: AlarmChannelType;
  directed: boolean;
  enabled: boolean;
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
  channels: TAlarmChannelSummary[];
  createdAt: string;
  updatedAt: string;
};

export type TListAlarmsDTO = {
  resourceType: string;
  projectId?: string;
  resourceId?: string;
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
  channelIds: string[];
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
  channelIds?: string[];
};

export type TDeleteAlarmDTO = {
  alarmId: string;
  projectId?: string | null;
};

export const alarmFormSchema = z.object({
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
  channelIds: z.array(z.string()).min(1, "At least one channel is required")
});

export type TAlarmForm = z.infer<typeof alarmFormSchema>;
