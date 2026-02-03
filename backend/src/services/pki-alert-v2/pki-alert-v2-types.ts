import RE2 from "re2";
import { z } from "zod";

import { TGenericPermission } from "@app/lib/types";

const createSecureNameValidator = () => {
  // Validates name format: lowercase alphanumeric characters with optional hyphens
  // Pattern: starts and ends with alphanumeric, allows hyphens between segments
  // Examples: "my-alert", "alert1", "test-alert-2"
  const nameRegex = new RE2("^[a-z0-9]+(?:-[a-z0-9]+)*$");
  return (value: string) => nameRegex.test(value);
};

export const createSecureAlertBeforeValidator = () => {
  // Validates alertBefore duration format: number followed by time unit
  // Pattern: one or more digits followed by d(days), w(weeks), m(months), or y(years)
  // Examples: "30d", "2w", "6m", "1y"
  const alertBeforeRegex = new RE2("^\\d+[dwmy]$");
  return (value: string) => {
    if (value.length > 32) return false;
    return alertBeforeRegex.test(value);
  };
};

export enum PkiAlertEventType {
  EXPIRATION = "expiration",
  RENEWAL = "renewal",
  ISSUANCE = "issuance",
  REVOCATION = "revocation"
}

export enum PkiAlertChannelType {
  EMAIL = "email",
  WEBHOOK = "webhook",
  SLACK = "slack"
}

export enum PkiFilterOperator {
  EQUALS = "equals",
  MATCHES = "matches",
  CONTAINS = "contains",
  STARTS_WITH = "starts_with",
  ENDS_WITH = "ends_with"
}

export enum PkiFilterField {
  PROFILE_NAME = "profile_name",
  COMMON_NAME = "common_name",
  SAN = "san",
  INCLUDE_CAS = "include_cas"
}

export enum CertificateOrigin {
  UNKNOWN = "unknown",
  PROFILE = "profile",
  IMPORT = "import",
  CA = "ca"
}

export enum PkiAlertRunStatus {
  SUCCESS = "success",
  FAILED = "failed"
}

export enum PkiWebhookEventType {
  CERTIFICATE_EXPIRATION = "com.infisical.pki.certificate.expiration",
  CERTIFICATE_TEST = "com.infisical.pki.certificate.test"
}

// Alert info used across event types
export type TAlertInfo = {
  id: string;
  name: string;
  alertBefore: string;
  projectId: string;
};

// Certificate data for webhook payloads
export type TCertificateData = {
  id: string;
  serialNumber: string;
  commonName: string;
  san: string[];
  profileName: string | null;
  notBefore: string;
  notAfter: string;
  status: string;
  daysUntilExpiry: number;
};

export type TPkiWebhookPayload = {
  // Required CloudEvents attributes
  specversion: "1.0";
  type: PkiWebhookEventType;
  source: string;
  id: string;

  // Optional CloudEvents attributes
  time: string;
  datacontenttype: "application/json";
  subject: string;

  // Event data
  data: {
    alert: TAlertInfo;
    certificates: TCertificateData[];
    metadata: {
      totalCertificates: number;
      viewUrl: string;
    };
  };
};

export const PkiFilterRuleSchema = z.object({
  field: z.nativeEnum(PkiFilterField),
  operator: z.nativeEnum(PkiFilterOperator),
  value: z.union([z.string(), z.array(z.string()), z.boolean()])
});

export type TPkiFilterRule = z.infer<typeof PkiFilterRuleSchema>;

export const PkiFiltersSchema = z.array(PkiFilterRuleSchema);
export type TPkiFilters = z.infer<typeof PkiFiltersSchema>;

export const EmailChannelConfigSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(10)
});

export const WebhookChannelConfigSchema = z.object({
  url: z
    .string()
    .url()
    .refine((url) => url.startsWith("https://"), "Webhook URL must use HTTPS"),
  signingSecret: z.string().max(256).optional().nullable()
});

// Response type for webhook config - signingSecret is replaced with hasSigningSecret
export type TWebhookChannelConfigResponse = {
  url: string;
  hasSigningSecret: boolean;
};

export const SlackChannelConfigSchema = z.object({
  webhookUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith("https://"), "Slack webhook URL must use HTTPS")
    // Validate hostname to prevent SSRF via URL manipulation (e.g. hooks.slack.com.evil.com)
    .refine((url) => {
      try {
        const parsed = new URL(url);
        return parsed.hostname === "hooks.slack.com";
      } catch {
        return false;
      }
    }, "Must be a valid Slack webhook URL")
});

export const ChannelConfigSchema = z.union([
  EmailChannelConfigSchema,
  WebhookChannelConfigSchema,
  SlackChannelConfigSchema
]);

export type TEmailChannelConfig = z.infer<typeof EmailChannelConfigSchema>;
export type TWebhookChannelConfig = z.infer<typeof WebhookChannelConfigSchema>;
export type TSlackChannelConfig = z.infer<typeof SlackChannelConfigSchema>;
export type TChannelConfig = z.infer<typeof ChannelConfigSchema>;

export const CreateChannelSchema = z.object({
  id: z.string().uuid().optional(),
  channelType: z.nativeEnum(PkiAlertChannelType),
  config: ChannelConfigSchema,
  enabled: z.boolean().default(true)
});

export type TCreateChannel = z.infer<typeof CreateChannelSchema>;

export const CreatePkiAlertV2Schema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .refine(createSecureNameValidator(), "Must be a valid name (lowercase, numbers, hyphens only)"),
  description: z.string().max(1000).optional(),
  eventType: z.nativeEnum(PkiAlertEventType),
  alertBefore: z.string().refine(createSecureAlertBeforeValidator(), "Must be in format like '30d', '1w', '3m', '1y'"),
  filters: PkiFiltersSchema,
  enabled: z.boolean().default(true),
  channels: z.array(CreateChannelSchema).max(10).default([])
});

export type TCreatePkiAlertV2 = z.infer<typeof CreatePkiAlertV2Schema>;

export const UpdatePkiAlertV2Schema = CreatePkiAlertV2Schema.partial();
export type TUpdatePkiAlertV2 = z.infer<typeof UpdatePkiAlertV2Schema>;

export type TCreateAlertV2DTO = TGenericPermission & {
  projectId: string;
} & TCreatePkiAlertV2;

export type TUpdateAlertV2DTO = TGenericPermission & {
  alertId: string;
} & TUpdatePkiAlertV2;

export type TGetAlertV2DTO = TGenericPermission & {
  alertId: string;
};

export type TDeleteAlertV2DTO = TGenericPermission & {
  alertId: string;
};

export type TListAlertsV2DTO = TGenericPermission & {
  projectId: string;
  search?: string;
  eventType?: PkiAlertEventType;
  enabled?: boolean;
  limit?: number;
  offset?: number;
};

export type TListMatchingCertificatesDTO = TGenericPermission & {
  alertId: string;
  limit?: number;
  offset?: number;
};

export type TListCurrentMatchingCertificatesDTO = TGenericPermission & {
  projectId: string;
  filters: TPkiFilters;
  alertBefore: string;
  limit?: number;
  offset?: number;
};

export type TCertificatePreview = {
  id: string;
  serialNumber: string;
  commonName: string;
  san: string[];
  profileName: string | null;
  enrollmentType: CertificateOrigin | null;
  notBefore: Date;
  notAfter: Date;
  status: string;
};

// Channel config type for responses (webhook has hasSigningSecret instead of signingSecret)
export type TChannelConfigResponse = TEmailChannelConfig | TWebhookChannelConfigResponse | TSlackChannelConfig;

export type TLastRun = {
  timestamp: Date;
  status: PkiAlertRunStatus;
  error: string | null;
};

export type TAlertV2Response = {
  id: string;
  name: string;
  description: string | null;
  eventType: PkiAlertEventType;
  alertBefore: string;
  filters: TPkiFilters;
  enabled: boolean;
  projectId: string;
  channels: Array<{
    id: string;
    channelType: PkiAlertChannelType;
    config: TChannelConfigResponse;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  lastRun: TLastRun | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TListAlertsV2Response = {
  alerts: TAlertV2Response[];
  total: number;
};

export type TListMatchingCertificatesResponse = {
  certificates: TCertificatePreview[];
  total: number;
};

export type TTestWebhookConfigDTO = TGenericPermission & {
  projectId: string;
  url: string;
  signingSecret?: string;
};

// Slack notification types
export type TSlackField = {
  title: string;
  value: string;
  short: boolean;
};

export type TSlackAttachment = {
  color: string;
  fields: TSlackField[];
  footer: string;
};

export type TSlackPayload = {
  text: string;
  attachments: TSlackAttachment[];
};

export type TBuildSlackPayloadParams = {
  alert: TAlertInfo;
  certificates: TCertificatePreview[];
  appUrl?: string;
};

export type TTriggerSlackWebhookParams = {
  webhookUrl: string;
  payload: TSlackPayload;
};

export type TTriggerSlackWebhookResult = {
  success: boolean;
  statusCode?: number;
  error?: string;
};
