export enum PkiAlertEventTypeV2 {
  EXPIRATION = "expiration",
  RENEWAL = "renewal",
  ISSUANCE = "issuance",
  REVOCATION = "revocation"
}

export enum PkiAlertChannelTypeV2 {
  EMAIL = "email",
  WEBHOOK = "webhook",
  SLACK = "slack",
  PAGERDUTY = "pagerduty"
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

export interface TPkiAlertChannelConfigSlack {
  webhookUrl: string;
}

export interface TPkiAlertChannelConfigPagerDuty {
  integrationKey: string;
}

export type TPkiAlertChannelConfig =
  | TPkiAlertChannelConfigEmail
  | TPkiAlertChannelConfigWebhook
  | TPkiAlertChannelConfigSlack
  | TPkiAlertChannelConfigPagerDuty;

export interface TPkiAlertChannelV2 {
  id: string;
  channelType: PkiAlertChannelTypeV2;
  config: TPkiAlertChannelConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TLastRun {
  timestamp: string;
  status: "success" | "failed";
  error: string | null;
}

export interface TPkiAlertV2 {
  id: string;
  projectId: string;
  applicationId?: string | null;
  name: string;
  description?: string;
  eventType: PkiAlertEventTypeV2;
  alertBefore?: string;
  filters: TPkiFilterRuleV2[];
  enabled: boolean;
  notificationConfig: { enableDailyNotification: boolean } | null;
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
  applicationId?: string;
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
  filters: TPkiFilterRuleV2[];
  alertBefore?: string;
  limit?: number;
  offset?: number;
}

export interface TGetPkiAlertV2CurrentMatchingCertificatesResponse {
  certificates: TPkiCertificateMatchV2[];
  total: number;
  limit: number;
  offset: number;
}
