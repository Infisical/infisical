import { Knex } from "knex";
import { z } from "zod";

import { TGenericPermission } from "@app/lib/types";

import { TAlarmPayload } from "./alarm-channel-types";

export enum AlarmPrincipalType {
  USER = "user",
  GROUP = "group",
  EMAIL = "email"
}

export enum AlarmRunStatus {
  SUCCESS = "success",
  PARTIAL = "partial",
  FAILED = "failed"
}

export enum AlarmPermissionAction {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export type TAlarmPermissionInput = {
  action: AlarmPermissionAction;
  orgId: string;
  projectId?: string | null;
  resourceId?: string | null;
  actor: TGenericPermission;
};

export const DEFAULT_DEDUP_WINDOW_HOURS = 24;

export type TAlarmContext = {
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
  tx?: Knex;
};

export interface IResourceAlarmProvider<TTarget = unknown> {
  // Dot-namespaced, e.g. "pki.certificate", "identity.ua-secret".
  resourceType: string;
  // Event keys this provider understands, e.g. ["pki.certificate.expiration"].
  eventTypes: string[];
  // Validates an alarm's `condition` (the "when"), e.g. { alertBefore: "30d" }.
  conditionSchema: z.ZodTypeAny;

  // Resources currently due to alarm for this alarm's scope + condition. The engine handles dedup
  // afterwards, so this returns all current matches in the window (not minus already-alarmed).
  findDueTargets(input: TFindDueTargetsInput): Promise<TTarget[]>;

  // One neutral payload describing all due targets for a firing (channels render it per medium).
  buildPayload(alarm: TAlarmContext, targets: TTarget[]): TAlarmPayload;

  // Stable id per target, used for dedup and history. Must be stable across cron runs.
  targetId(target: TTarget): string;

  // Optional per-condition dedup window override (hours). Defaults to DEFAULT_DEDUP_WINDOW_HOURS.
  dedupWindowHours?(condition: unknown): number;

  // Authorizes a CRUD action on an alarm of this resource type. Throws (e.g. ForbiddenError) if
  // denied. The alarm module owns no CASL subject of its own: each provider reuses its resource's
  // existing permissions (e.g. PKI reuses the `pki-alerts` subject, project- or application-scoped).
  assertPermission(input: TAlarmPermissionInput): Promise<void>;

  // Assert that a resource-bound alarm's resource belongs to the alarm's scope (org, and project
  // when project-scoped). Called at create. Throws if the resource is out of scope, so an alarm
  // cannot be bound to a foreign/out-of-scope resource. When there is no resourceId (a filter-based
  // alarm), there is nothing to bind-check, so implementations return immediately.
  assertResourceInScope(input: { orgId: string; projectId?: string | null; resourceId?: string | null }): Promise<void>;
}
