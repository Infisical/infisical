import { z } from "zod";

import { TGenericPermission } from "@app/lib/types";
import { TPostHogEvent } from "@app/services/telemetry/telemetry-types";

import { TAlertPayload } from "./alert-channel-types";

export enum AlertPrincipalType {
  USER = "user",
  GROUP = "group",
  EMAIL = "email",
  // Everyone in the channel's project at send time. principalId is the project id.
  PROJECT_MEMBERS = "project-members"
}

export enum AlertTriggerType {
  Scheduled = "scheduled",
  Event = "event"
}

export type TAlertEventRef = { resourceType: string; eventKey: string };

export type TAlertEventDefinition = {
  key: string;
  triggerType: AlertTriggerType;
  conditionSchema: z.ZodTypeAny;
  sourceEvent?: TAlertEventRef;
};

export enum AlertRunStatus {
  SUCCESS = "success",
  PARTIAL = "partial",
  FAILED = "failed"
}

export enum AlertPermissionAction {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export type TAlertPermissionInput = {
  action: AlertPermissionAction;
  orgId: string;
  projectId?: string | null;
  resourceId?: string | null;
  actor: TGenericPermission;
};

export const toAlertActor = (dto: TGenericPermission): TGenericPermission => ({
  actor: dto.actor,
  actorId: dto.actorId,
  actorAuthMethod: dto.actorAuthMethod,
  actorOrgId: dto.actorOrgId
});

type TAlertRecipientPolicy = {
  atOrgScope?: boolean;
  allowEmailAddresses?: boolean;
};

export type TAlertRecipientScope = {
  projectId: string | null;
  allowEmailAddresses: boolean;
};

export const DEFAULT_DEDUP_WINDOW_HOURS = 24;

// Providers scan this many days ahead of `alertBefore` so alerts fire at LEAST `alertBefore` before
// expiry despite the coarse daily poll. Keep >= the DailyAlertProcessing cadence (alert-queue.ts).
export const ALERT_SCAN_LEAD_DAYS = 1;
export const ALERT_SCAN_LEAD_INTERVAL = "1 day";

export const MAX_CHANNELS_PER_ALERT = 10;
export const MAX_TARGET_IDS_PER_EVENT = 25;
export const MAX_RECIPIENTS_PER_CHANNEL = 20;

export const ALERT_HISTORY_RETENTION_DAYS = 90;

export const MAX_DEDUP_WINDOW_HOURS = (ALERT_HISTORY_RETENTION_DAYS - 1) * 24;

export type TAlertContext = {
  id: string;
  name: string;
  orgId: string;
  projectId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  eventType: string;
  condition: unknown;
};

export type TFindEventTargetsInput = {
  orgId: string;
  projectId?: string | null;
  resourceId?: string | null;
  eventType: string;
  condition: unknown;
  targetIds: string[];
  payload: Record<string, unknown>;
};

export type TAlreadyAlertedFilter = {
  alertId: string;
  channelIds: string[];
  since: Date;
};

export type TFindScheduledTargetsInput = {
  orgId: string;
  projectId?: string | null;
  resourceId?: string | null;
  eventType: string;
  condition: unknown;
  asOf: Date;
  alreadyAlerted?: TAlreadyAlertedFilter;
};

// Lets a provider factory declare which discovery method it guarantees.
export type IScheduledAlertProvider<TTarget = unknown> = IResourceAlertProvider<TTarget> &
  Required<Pick<IResourceAlertProvider<TTarget>, "findScheduledTargets">>;

export type IEventAlertProvider<TTarget = unknown> = IResourceAlertProvider<TTarget> &
  Required<Pick<IResourceAlertProvider<TTarget>, "findEventTargets">>;

export type TAlertFilterValue = { id: string; name: string | null };

export type TAlertFilters = Record<string, TAlertFilterValue[]>;

export enum AlertAuditAction {
  Create = "create",
  Update = "update",
  Delete = "delete",
  TestChannel = "test-channel"
}

type TAlertAuditAlert = {
  id: string;
  name: string;
  resourceType: string;
  resourceId: string | null;
  eventType: string;
};

type TAlertChannelTestAudit = {
  resourceType: string;
  resourceId?: string | null;
  channelId?: string;
  channelType: string;
  success: boolean;
  deliveredTo?: number;
  error?: string;
};

export type TAlertAuditInput =
  | { action: AlertAuditAction.Create | AlertAuditAction.Update | AlertAuditAction.Delete; alert: TAlertAuditAlert }
  | { action: AlertAuditAction.TestChannel; test: TAlertChannelTestAudit };

export enum AlertTelemetryAction {
  Create = "create",
  Update = "update",
  Delete = "delete"
}

export type TAlertTelemetryInput = {
  action: AlertTelemetryAction;
  orgId: string;
  projectId: string | null;
  resourceId: string | null;
  eventType: string;
};

type TPostHogEventBody<T> = T extends unknown
  ? Omit<T, "distinctId" | "organizationId" | "organizationName" | "anonymous" | "dedup">
  : never;

export type TAlertTelemetryEvent = TPostHogEventBody<TPostHogEvent>;

export interface IResourceAlertProvider<TTarget = unknown> {
  // Dot-namespaced, e.g. "pki.certificate", "identity.ua-secret".
  resourceType: string;
  // Each event declares how it fires and what its condition looks like.
  events: TAlertEventDefinition[];

  // Resources currently due to alert for this alert's scope + condition. The engine handles dedup
  // afterwards, so this returns all current matches in the window (not minus already-alerted).
  // Must be ordered most-urgent-first (soonest expiry): the engine's per-channel maxTargetsPerRun cap
  // keeps the head of this list and defers the tail, so urgency ordering ensures the targets closest
  // to expiry are never the ones dropped.
  // Required for any Scheduled event; the registry enforces that at boot.
  findScheduledTargets?(input: TFindScheduledTargetsInput): Promise<TTarget[]>;

  // Loads the targets an event named. A missing row was deleted between emit and dispatch, so drop it,
  // don't throw. Must read the primary: the target usually commits in the same tx as the event, and an
  // empty result is terminal.
  // Required for any Event-triggered event; the registry enforces that at boot.
  findEventTargets?(input: TFindEventTargetsInput): Promise<TTarget[]>;

  // Deep link to the alert's resource, honouring its scope (org- vs project-scoped). Resolved once
  // per run by the engine and passed into buildPayload, so it may perform async lookups.
  buildViewUrl(alert: TAlertContext): Promise<string>;

  // One neutral payload describing all due targets for a firing (channels render it per medium).
  // Receives the pre-resolved viewUrl so it can stay synchronous.
  buildPayload(alert: TAlertContext, targets: TTarget[], viewUrl: string): TAlertPayload;

  // Stable id per target, used for dedup and history. Must be stable across cron runs.
  targetId(target: TTarget): string;

  // Optional per-condition dedup window override (hours). Defaults to DEFAULT_DEDUP_WINDOW_HOURS.
  dedupWindowHours?(condition: unknown): number;

  // Authorizes a CRUD action on an alert of this resource type. Throws (e.g. ForbiddenError) if
  // denied. The alert module owns no CASL subject of its own: each provider reuses its resource's
  // existing permissions (e.g. PKI reuses the `pki-alerts` subject, project- or application-scoped).
  assertPermission(input: TAlertPermissionInput): Promise<void>;

  supportsScopeWideAlerts?: boolean;

  assertConditionInScope?(input: {
    projectId?: string | null;
    resourceId?: string | null;
    condition: unknown;
    previousCondition?: unknown;
  }): Promise<void>;

  assertChannelTypesAllowed?(input: { orgId: string; channelTypes: string[] }): Promise<void>;

  recipientPolicy?: TAlertRecipientPolicy;

  includeLastRun?: boolean;

  getWebhookSource?: (input: { alertId: string; resourceId?: string | null }) => string | undefined;

  getResourceNames?(input: { orgId: string; resourceIds: string[] }): Promise<Map<string, string>>;

  getFilters?(input: {
    orgId: string;
    projectId: string | null;
    alerts: { id: string; condition: unknown }[];
  }): Promise<Map<string, TAlertFilters>>;

  resolveProjectId?(input: { orgId: string; resourceId?: string | null }): Promise<string>;

  getTelemetryEvent?(input: TAlertTelemetryInput): TAlertTelemetryEvent | undefined;

  // Assert that a resource-bound alert's resource belongs to the alert's scope (org, and project
  // when project-scoped). Called at create. Throws if the resource is out of scope, so an alert
  // cannot be bound to a foreign/out-of-scope resource. When there is no resourceId (a filter-based
  // alert), there is nothing to bind-check, so implementations return immediately.
  assertResourceInScope(input: { orgId: string; projectId?: string | null; resourceId?: string | null }): Promise<void>;
}
