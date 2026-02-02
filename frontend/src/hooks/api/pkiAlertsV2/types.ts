import { z } from "zod";

// Sentinel value for masked signing secret display in edit mode
export const SIGNING_SECRET_MASK = "*****";

export enum PkiAlertEventTypeV2 {
  EXPIRATION = "expiration",
  RENEWAL = "renewal",
  ISSUANCE = "issuance",
  REVOCATION = "revocation"
}

export enum PkiAlertChannelTypeV2 {
  EMAIL = "email",
  WEBHOOK = "webhook"
}

export enum PkiFilterFieldV2 {
  COMMON_NAME = "common_name",
  PROFILE_NAME = "profile_name",
  SAN = "san",
  INCLUDE_CAS = "include_cas"
}

export enum PkiFilterOperatorV2 {
  EQUALS = "equals",
  CONTAINS = "contains",
  STARTS_WITH = "starts_with",
  ENDS_WITH = "ends_with",
  MATCHES = "matches"
}

export interface TPkiFilterRuleV2 {
  field: PkiFilterFieldV2;
  operator: PkiFilterOperatorV2;
  value: string | string[] | boolean;
}

export interface TPkiAlertChannelConfigEmail {
  recipients: string[];
}

export interface TPkiAlertChannelConfigWebhook {
  url: string;
  signingSecret?: string | null;
}

// Response type for webhook config - signingSecret is replaced with hasSigningSecret
export interface TPkiAlertChannelConfigWebhookResponse {
  url: string;
  hasSigningSecret: boolean;
}

export type TPkiAlertChannelConfig = TPkiAlertChannelConfigEmail | TPkiAlertChannelConfigWebhook;

export interface TPkiAlertChannelV2 {
  id: string;
  channelType: PkiAlertChannelTypeV2;
  config: TPkiAlertChannelConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TPkiAlertChannelInput = Omit<TPkiAlertChannelV2, "createdAt" | "updatedAt" | "id"> & {
  id?: string;
};

export interface TLastRun {
  timestamp: string;
  status: "success" | "failed";
  error: string | null;
}

export interface TPkiAlertV2 {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  eventType: PkiAlertEventTypeV2;
  alertBefore?: string;
  filters: TPkiFilterRuleV2[];
  enabled: boolean;
  channels: TPkiAlertChannelV2[];
  lastRun: TLastRun | null;
  createdAt: string;
  updatedAt: string;
}

export interface TPkiCertificateMatchV2 {
  id: string;
  serialNumber: string;
  commonName?: string;
  san?: string[];
  profileName?: string;
  enrollmentType?: string;
  notBefore: string;
  notAfter: string;
  status: string;
}

export interface TGetPkiAlertsV2 {
  projectId: string;
  search?: string;
  eventType?: PkiAlertEventTypeV2;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface TGetPkiAlertsV2Response {
  alerts: TPkiAlertV2[];
  total: number;
}

export interface TGetPkiAlertV2ById {
  alertId: string;
}

export interface TCreatePkiAlertV2 {
  projectId: string;
  name: string;
  description?: string;
  eventType: PkiAlertEventTypeV2;
  alertBefore?: string;
  filters: TPkiFilterRuleV2[];
  enabled?: boolean;
  channels: TPkiAlertChannelInput[];
}

export interface TUpdatePkiAlertV2 {
  alertId: string;
  name?: string;
  description?: string;
  eventType?: PkiAlertEventTypeV2;
  alertBefore?: string;
  filters?: TPkiFilterRuleV2[];
  enabled?: boolean;
  channels?: TPkiAlertChannelInput[];
}

export interface TDeletePkiAlertV2 {
  alertId: string;
}

export interface TGetPkiAlertV2MatchingCertificates {
  alertId: string;
  limit?: number;
  offset?: number;
}

export interface TGetPkiAlertV2MatchingCertificatesResponse {
  certificates: TPkiCertificateMatchV2[];
  total: number;
  limit: number;
  offset: number;
}

export interface TGetPkiAlertV2CurrentMatchingCertificates {
  projectId: string;
  filters: TPkiFilterRuleV2[];
  alertBefore: string;
  limit?: number;
  offset?: number;
}

export interface TGetPkiAlertV2CurrentMatchingCertificatesResponse {
  certificates: TPkiCertificateMatchV2[];
  total: number;
  limit: number;
  offset: number;
}

export const pkiFilterRuleV2Schema = z.object({
  field: z.nativeEnum(PkiFilterFieldV2),
  operator: z.nativeEnum(PkiFilterOperatorV2),
  value: z.union([z.string(), z.array(z.string()), z.boolean()])
});

const emailChannelConfigSchema = z.object({
  recipients: z
    .array(z.string())
    .transform((emails) => emails.filter(Boolean).map((email) => email.trim().toLowerCase()))
    .refine((emails) => emails.length > 0, "At least one email recipient is required")
    .refine((emails) => emails.length <= 10, "Maximum 10 email recipients allowed")
    .refine(
      (emails) => emails.every((email) => z.string().email().safeParse(email).success),
      "All recipients must be valid email addresses"
    )
    .refine(
      (emails) => new Set(emails).size === emails.length,
      "Duplicate email addresses are not allowed"
    )
});

const webhookChannelConfigSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .refine((url) => url.startsWith("https://"), "Webhook URL must use HTTPS"),
  signingSecret: z.string().max(256).nullable().optional()
});

const emailChannelSchema = z.object({
  id: z.string().uuid().optional(),
  channelType: z.literal(PkiAlertChannelTypeV2.EMAIL),
  config: emailChannelConfigSchema,
  enabled: z.boolean().default(true)
});

const webhookChannelSchema = z.object({
  id: z.string().uuid().optional(),
  channelType: z.literal(PkiAlertChannelTypeV2.WEBHOOK),
  config: webhookChannelConfigSchema,
  enabled: z.boolean().default(true)
});

export const pkiAlertChannelV2Schema = z.discriminatedUnion("channelType", [
  emailChannelSchema,
  webhookChannelSchema
]);

export const createPkiAlertV2Schema = z.object({
  projectId: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a valid name (lowercase, numbers, hyphens only)"),
  description: z.string().max(1000).optional(),
  eventType: z.nativeEnum(PkiAlertEventTypeV2),
  alertBefore: z
    .string()
    .regex(/^\d+[dwmy]$/, "Must be in format like '30d', '1w', '3m', '1y'")
    .refine((val) => val.length <= 32, "Alert timing too long")
    .optional(),
  filters: z.array(pkiFilterRuleV2Schema),
  enabled: z.boolean().default(true),
  channels: z.array(pkiAlertChannelV2Schema).default([])
});

export const updatePkiAlertV2Schema = createPkiAlertV2Schema.partial().omit({ projectId: true });
