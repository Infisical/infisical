import { InstanceEntitlements } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { Plan } from "../model/plan";
import { TEntitlementOrg, TOrgDeletedResult } from "./license-server-types/license-server-types";
import { TUsageEvent, TUsageEventResult, TUsageSnapshot } from "./license-server-types/usage-reports";

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

export type TLicenseServer = {
  // False when no License Server is configured, so usage is not queued.
  isEnabled(): boolean;
  // Whether usage can be sent: a License Server URL and credentials are configured.
  canReportUsage(): boolean;
  reportSnapshots(orgId: string, snapshots: TUsageSnapshot[]): Promise<void>;
  reportEvents(orgId: string, events: TUsageEvent[]): Promise<TUsageEventResult[]>;
  // Cloud: cancels a deleted root org's subscription right away and closes its licenses. Safe to repeat.
  deleteOrganization(orgId: string): Promise<TOrgDeletedResult>;
};
