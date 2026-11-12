import { InstanceEntitlements } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { Plan } from "../model/plan";
import { TEntitlementOrg, TOrgDeletedResult } from "./helpers/license-server-types";

export type TPlanCache = {
  read(rootOrgId: string): Promise<{ plan: Plan | null; passThrough: boolean }>;
  write(rootOrgId: string, plan: Plan): Promise<void>;
  writeFallback(rootOrgId: string, plan: Plan): Promise<void>;
  isFallback(rootOrgId: string): Promise<boolean>;
  lastKnown(rootOrgId: string): Promise<{ plan: Plan; fetchedAt: number } | null>;
  markForRevalidation(rootOrgId: string, checkout: boolean): Promise<void>;
  invalidate(rootOrgId: string): Promise<void>;
  acquireRevalidateLock(rootOrgId: string): Promise<boolean>;
};

export type TUsageReportCache = {
  acquireReconcileMarker(orgId: string): Promise<boolean>;
  isReconciled(orgId: string): Promise<boolean>;
  lastReported(reportOrgId: string, meterKey: string): Promise<number | null>;
  recordReported(reportOrgId: string, meterKey: string, value: number): Promise<void>;
};

export type TUsageCounter = {
  readonly meter: Meter;
  // A null orgId counts the whole instance: a self-hosted license covers every org in the database.
  count(orgId: string | null): Promise<number>;
};

// All licensing decisions go through EE. No CE fallback on purpose, so the free tier stays EE-licensed.
export type TLicenseProvider = {
  resolveInstanceEntitlements(): Promise<InstanceEntitlements>;
  // Null when there's no online license; throws when the License Server fails.
  refreshInstanceEntitlements(): Promise<InstanceEntitlements | null>;
  // Whether refreshInstanceEntitlements should run on a timer.
  hasOnlineLicense(): boolean;
  // Whether LICENSE_KEY or LICENSE_KEY_OFFLINE holds an offline key, whether or not it verifies.
  isOffline(): boolean;
  // Cloud only. Throws when the License Server can't be read.
  fetchPlan(rootOrg: TEntitlementOrg): Promise<Plan>;
  // Cloud only: what an org gets while the License Server is down.
  fallbackPlan(): Plan;
};

export type TUsageSource = "cloud" | "self-hosted";

export type TUsageSnapshot = {
  dimensionKey: string;
  value: number;
  // When it was counted. The server drops a second snapshot with the same time, so a recount needs a new one.
  observedAt: Date;
  source: TUsageSource;
};

// "no-license" and "not-priced" are final: nothing was recorded and resending won't change that.
export type TUsageSnapshotOutcome = "reported" | "no-license" | "not-priced";

// A metered fact for a sum or count meter. The server dedups on eventId, so a retry resends the same one.
export type TMeteringEvent = {
  eventId: string;
  dimensionKey: string;
  quantity: number;
  occurredAt: string;
};

// "rejected" is final for the whole batch; reason is for the log.
export type TMeteringEventsOutcome =
  | { status: "reported"; accepted: number; deduped: number }
  | { status: "rejected"; reason: string };

export type TLicenseServer = {
  // False when no License Server is configured, so usage isn't queued.
  isEnabled(): boolean;
  // False when usage can't be sent, which a plain-http License Server URL outside development also causes.
  canReportUsage(): boolean;
  // Throws only when worth retrying.
  reportSnapshot(orgId: string, snapshot: TUsageSnapshot): Promise<TUsageSnapshotOutcome>;
  // Throws only when worth retrying.
  reportEvents(orgId: string, events: TMeteringEvent[], source: TUsageSource): Promise<TMeteringEventsOutcome>;
  // Cloud only. Cancels the subscription right away and closes the licenses. Safe to repeat.
  deleteOrganization(orgId: string): Promise<TOrgDeletedResult>;
};
