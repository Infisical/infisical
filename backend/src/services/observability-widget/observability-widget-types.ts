import { z } from "zod";

// Widget type discriminator
export enum ObservabilityWidgetType {
  Events = "events",
  Metrics = "metrics",
  Logs = "logs",
  PieChart = "pie-chart"
}

// Resource types (used by "events" widget type)
export enum ObservabilityResourceType {
  SecretSync = "secret-sync",
  SecretRotation = "secret-rotation",
  DynamicSecretLease = "dynamic-secret-lease",
  MachineIdentityToken = "machine-identity-token",
  ServiceToken = "service-token",
  Webhook = "webhook",
  PamSession = "pam-session",
  UserSession = "user-session",
  Gateway = "gateway",
  Relay = "relay",
  PkiCertificate = "pki-certificate",
  MachineIdentityUsage = "machine-identity-usage"
}

// Status values match UI semantics (used by "events" widget type)
export enum ObservabilityItemStatus {
  Failed = "failed",
  Pending = "pending",
  Active = "active",
  Expired = "expired"
}

// Metric types for number-based metrics widget
export enum MetricType {
  StatusCount = "status_count",
  ExpiringSoon = "expiring_soon",
  IdentityCount = "identity_count"
}

// Identity types for identity count metrics
export type TIdentityType = "user" | "machine" | "all";

// Org-only resource types that cannot be used in project-scoped widgets
export const ORG_ONLY_RESOURCE_TYPES: readonly ObservabilityResourceType[] = [
  ObservabilityResourceType.Gateway,
  ObservabilityResourceType.Relay,
  ObservabilityResourceType.UserSession
] as const;

// Zod schemas for validation
export const EventsWidgetConfigSchema = z.object({
  resourceTypes: z.nativeEnum(ObservabilityResourceType).array().default([]),
  eventTypes: z.enum(["failed", "pending", "active", "expired"]).array().min(1),
  thresholds: z
    .object({
      expirationDays: z.number().optional(),
      inactivityDays: z.number().optional(),
      heartbeatMinutes: z.number().optional()
    })
    .optional()
});

export const MetricsWidgetConfigSchema = z.object({
  metric: z.string(),
  timeRange: z.string(),
  aggregation: z.string()
});

// Number-based metrics widget config schema
export const NumberMetricsWidgetConfigSchema = z.object({
  metricType: z.nativeEnum(MetricType),
  resourceTypes: z.nativeEnum(ObservabilityResourceType).array().optional(),
  status: z.nativeEnum(ObservabilityItemStatus).optional(),
  thresholdDays: z.number().min(1).max(365).optional(),
  identityType: z.enum(["user", "machine", "all"]).optional()
});

export const LogsWidgetConfigSchema = z.object({
  logSource: z.string(),
  filters: z.record(z.unknown()).optional(),
  limit: z.number()
});

// Audit log event categories for filtering
export const AuditLogEventCategory = {
  SECRETS: "secrets",
  INTEGRATIONS: "integrations",
  IDENTITIES: "identities",
  PKI: "pki",
  SSH: "ssh",
  KMS: "kms",
  AUTH: "auth",
  PROJECTS: "projects",
  ORGANIZATIONS: "organizations"
} as const;

export type TAuditLogEventCategory = (typeof AuditLogEventCategory)[keyof typeof AuditLogEventCategory];

// Live Logs widget config schema (for audit log streaming)
export const LiveLogsWidgetConfigSchema = z.object({
  limit: z.number().min(10).max(300).default(300),
  eventCategories: z.array(z.string()).optional()
});

export const PieChartWidgetConfigSchema = z.object({
  metric: z.string(),
  timeRange: z.string().optional()
});

// Type-specific config schemas
export type TEventsWidgetConfig = z.infer<typeof EventsWidgetConfigSchema>;
export type TMetricsWidgetConfig = z.infer<typeof MetricsWidgetConfigSchema>;
export type TLogsWidgetConfig = z.infer<typeof LogsWidgetConfigSchema>;
export type TPieChartWidgetConfig = z.infer<typeof PieChartWidgetConfigSchema>;
export type TLiveLogsWidgetConfig = z.infer<typeof LiveLogsWidgetConfigSchema>;
export type TNumberMetricsWidgetConfig = z.infer<typeof NumberMetricsWidgetConfigSchema>;

// Scope type for widget items
export interface TObservabilityScope {
  type: "org" | "sub-org" | "project";
  displayName: string;
  fullPath: string;
}

// Widget item (returned by resolvers)
export interface TObservabilityWidgetItem {
  id: string;
  resourceType: ObservabilityResourceType;
  resourceName: string;
  resourceId: string;
  scope: TObservabilityScope;
  status: ObservabilityItemStatus;
  statusTooltip: string | null;
  eventTimestamp: Date;
  resourceLink: string;
  metadata?: Record<string, unknown>;
}

// Widget data response (API response)
export interface TObservabilityWidgetDataResponse {
  widget: {
    id: string;
    name: string;
    description?: string | null;
    type: ObservabilityWidgetType;
    refreshInterval: number;
    icon?: string | null;
    color?: string | null;
  };
  items: TObservabilityWidgetItem[];
  totalCount: number;
  summary: {
    failedCount: number;
    pendingCount: number;
    activeCount: number;
    expiredCount: number;
  };
}

// Resolver params
export interface TResolverParams {
  orgId: string;
  subOrgId?: string | null;
  projectId?: string | null;
  eventTypes: Array<"failed" | "pending" | "active" | "expired">;
  scopeOrgIds?: string[];
  scopeProjectIds?: string[];
  thresholds?: {
    expirationDays?: number;
    inactivityDays?: number;
    heartbeatMinutes?: number;
  };
  limit?: number;
  offset?: number;
  status?: ObservabilityItemStatus;
}

// Resolver result
export interface TResolverResult {
  items: TObservabilityWidgetItem[];
  totalCount: number;
  summary: {
    failedCount: number;
    pendingCount: number;
    activeCount: number;
    expiredCount: number;
  };
}

// Resolver function type
export type TResourceResolver = (params: TResolverParams) => Promise<TResolverResult>;

// Create widget DTO
export interface TCreateObservabilityWidgetDTO {
  name: string;
  description?: string;
  orgId: string;
  subOrgId?: string | null;
  projectId?: string | null;
  type: ObservabilityWidgetType;
  config:
    | TEventsWidgetConfig
    | TMetricsWidgetConfig
    | TLogsWidgetConfig
    | TPieChartWidgetConfig
    | TLiveLogsWidgetConfig
    | TNumberMetricsWidgetConfig;
  refreshInterval?: number;
  icon?: string;
  color?: string;
}

// Update widget DTO
export interface TUpdateObservabilityWidgetDTO {
  name?: string;
  description?: string;
  config?:
    | TEventsWidgetConfig
    | TMetricsWidgetConfig
    | TLogsWidgetConfig
    | TPieChartWidgetConfig
    | TLiveLogsWidgetConfig
    | TNumberMetricsWidgetConfig;
  refreshInterval?: number;
  icon?: string;
  color?: string;
  subOrgId?: string | null;
  projectId?: string | null;
}

// Get widget data options
export interface TGetWidgetDataOptions {
  limit?: number;
  offset?: number;
  status?: ObservabilityItemStatus;
}

// Helper to convert eventTypes array to status set
export const eventTypesToStatusSet = (
  eventTypes: Array<"failed" | "pending" | "active" | "expired">
): Set<ObservabilityItemStatus> => {
  return new Set(
    eventTypes.map((et) => {
      if (et === "failed") return ObservabilityItemStatus.Failed;
      if (et === "pending") return ObservabilityItemStatus.Pending;
      if (et === "expired") return ObservabilityItemStatus.Expired;
      return ObservabilityItemStatus.Active;
    })
  );
};

// Log level for live logs widget
export type TLogLevel = "error" | "warn" | "info";

// Log item for live logs widget
export interface TObservabilityLogItem {
  id: string;
  timestamp: Date;
  level: TLogLevel;
  resourceType: string;
  actor: string;
  message: string;
  metadata: {
    eventType: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    userAgentType?: string | null;
    projectId?: string | null;
    projectName?: string | null;
    actorMetadata?: unknown;
    eventMetadata?: unknown;
  };
}

// Live logs widget data response
export interface TObservabilityLiveLogsResponse {
  widget: {
    id: string;
    name: string;
    description?: string | null;
    type: ObservabilityWidgetType;
    refreshInterval: number;
    icon?: string | null;
    color?: string | null;
  };
  scope: {
    type: "org" | "sub-org" | "project";
    displayName: string;
  };
  items: TObservabilityLogItem[];
  totalCount: number;
  infoText: string;
  auditLogLink: string;
}

// Get live logs widget data options
export interface TGetLiveLogsWidgetDataOptions {
  limit?: number;
}

// Metrics widget data response
export interface TObservabilityMetricsResponse {
  widget: {
    id: string;
    name: string;
    description?: string | null;
    type: ObservabilityWidgetType;
    refreshInterval: number;
    icon?: string | null;
    color?: string | null;
  };
  value: number;
  label: string;
  unit?: string;
  link?: string;
}
