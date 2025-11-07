import { z } from "zod";

export enum PkiAlertEventTypeV2 {
  EXPIRATION = "expiration",
  RENEWAL = "renewal",
  ISSUANCE = "issuance",
  REVOCATION = "revocation"
}

export enum PkiAlertChannelTypeV2 {
  EMAIL = "email"
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

// In the future other channels like webhooks will be supported here
export type TPkiAlertChannelConfig = TPkiAlertChannelConfigEmail;

export interface TPkiAlertChannelV2 {
  id: string;
  channelType: PkiAlertChannelTypeV2;
  config: TPkiAlertChannelConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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
  channels: Omit<TPkiAlertChannelV2, "id" | "createdAt" | "updatedAt">[];
}

export interface TUpdatePkiAlertV2 {
  alertId: string;
  name?: string;
  description?: string;
  eventType?: PkiAlertEventTypeV2;
  alertBefore?: string;
  filters?: TPkiFilterRuleV2[];
  enabled?: boolean;
  channels?: Omit<TPkiAlertChannelV2, "id" | "createdAt" | "updatedAt">[];
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
    .transform((emails) => emails.filter(Boolean).map((email) => email.trim()))
    .refine((emails) => emails.length > 0, "At least one email recipient is required")
    .refine((emails) => emails.length <= 10, "Maximum 10 email recipients allowed")
    .refine(
      (emails) => emails.every((email) => z.string().email().safeParse(email).success),
      "All recipients must be valid email addresses"
    )
});

export const pkiAlertChannelV2Schema = z.object({
  channelType: z.nativeEnum(PkiAlertChannelTypeV2),
  config: emailChannelConfigSchema,
  enabled: z.boolean().default(true)
});

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
  channels: z.array(pkiAlertChannelV2Schema).min(1)
});

export const updatePkiAlertV2Schema = createPkiAlertV2Schema.partial().omit({ projectId: true });
