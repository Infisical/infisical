import { InstanceEntitlements } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { Plan } from "../model/plan";
import { TEntitlementOrg, TOrgDeletedResult } from "./license-server-types/license-server-types";

// Implemented outside the services: by License's data access, by the products (TUsageCounter) and by EE.

// Keys are always the root org's.
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

// Every licensing decision goes through EE. No CE fallback on purpose, so the free tier's features stay
// EE-licensed.
export type TLicenseProvider = {
  // The instance's own license, read once at boot.
  resolveInstanceEntitlements(): Promise<InstanceEntitlements>;
  // Reads an online license again. Null when the instance has none; throws when the License Server fails.
  refreshInstanceEntitlements(): Promise<InstanceEntitlements | null>;
  // Whether refreshInstanceEntitlements should also run on a timer.
  hasOnlineLicense(): boolean;
  // Whether LICENSE_KEY holds an offline key, whether or not it verifies.
  isOffline(): boolean;
  // Cloud: a root org's plan from the License Server. Throws when it cannot be read.
  fetchPlan(rootOrg: TEntitlementOrg): Promise<Plan>;
  // Cloud: what an org gets while the License Server cannot be reached.
  fallbackPlan(): Plan;
};

export type TUsageSource = "cloud" | "self-hosted";

export type TUsageSnapshot = {
  dimensionKey: string;
  value: number;
  // When the value was counted. A recount is a new snapshot: the server drops a second one with the same time.
  observedAt: Date;
  source: TUsageSource;
};

// "no-license" and "not-priced" are the server's final answer for the dimension: nothing was recorded, and
// sending it again would get the same answer.
export type TUsageSnapshotOutcome = "reported" | "no-license" | "not-priced";

// A metered fact for a sum or count meter. The server dedups on eventId, so a retry resends the same one.
export type TMeteringEvent = {
  eventId: string;
  dimensionKey: string;
  quantity: number;
  occurredAt: string;
};

// "rejected" is the server's final answer for the whole batch, with its reason for the log.
export type TMeteringEventsOutcome =
  | { status: "reported"; accepted: number; deduped: number }
  | { status: "rejected"; reason: string };

export type TLicenseServer = {
  // False when no License Server is configured, so usage is not queued.
  isEnabled(): boolean;
  // Whether usage can be sent: a License Server URL and credentials are configured.
  canReportUsage(): boolean;
  // Throws when the report failed in a way worth retrying.
  reportSnapshot(orgId: string, snapshot: TUsageSnapshot): Promise<TUsageSnapshotOutcome>;
  // Throws when the report failed in a way worth retrying.
  reportEvents(orgId: string, events: TMeteringEvent[], source: TUsageSource): Promise<TMeteringEventsOutcome>;
  // Cloud: cancels a deleted root org's subscription right away and closes its licenses. Safe to repeat.
  deleteOrganization(orgId: string): Promise<TOrgDeletedResult>;
};
