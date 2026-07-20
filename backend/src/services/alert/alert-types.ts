import { z } from "zod";

import { TGenericPermission } from "@app/lib/types";

import { TAlertPayload } from "./alert-channel-types";

export enum AlertPrincipalType {
  USER = "user",
  GROUP = "group",
  EMAIL = "email"
}

export enum AlertTriggerType {
  Scheduled = "scheduled",
  Event = "event"
}

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

export const DEFAULT_DEDUP_WINDOW_HOURS = 24;

export type TAlertContext = {
  id: string;
  name: string;
  orgId: string;
  projectId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  eventType: string;
  condition: unknown;
  filters: unknown;
};

export type TFindDueTargetsInput = {
  orgId: string;
  projectId?: string | null;
  resourceId?: string | null;
  eventType: string;
  condition: unknown;
  filters: unknown;
};

export interface IResourceAlertProvider<TTarget = unknown> {
  // Dot-namespaced, e.g. "pki.certificate", "identity.ua-secret".
  resourceType: string;
  // Event keys this provider understands, e.g. ["pki.certificate.expiration"].
  eventTypes: string[];
  // Validates an alert's `condition` (the "when"), e.g. { alertBefore: "30d" }.
  conditionSchema: z.ZodTypeAny;

  // Resources currently due to alert for this alert's scope + condition. The engine handles dedup
  // afterwards, so this returns all current matches in the window (not minus already-alerted).
  findDueTargets(input: TFindDueTargetsInput): Promise<TTarget[]>;

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

  // Assert that a resource-bound alert's resource belongs to the alert's scope (org, and project
  // when project-scoped). Called at create. Throws if the resource is out of scope, so an alert
  // cannot be bound to a foreign/out-of-scope resource. When there is no resourceId (a filter-based
  // alert), there is nothing to bind-check, so implementations return immediately.
  assertResourceInScope(input: { orgId: string; projectId?: string | null; resourceId?: string | null }): Promise<void>;
}
