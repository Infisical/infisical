import { InstanceEntitlements } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { Plan } from "../model/plan";
import { SeatUsage } from "../model/seat-usage";
import { TEntitlementOrg } from "./license-server-types/license-server-types";
import { TUsageEvent, TUsageEventResult, TUsageSnapshot } from "./license-server-types/usage-reports";

// What LicenseService needs from outside it. Data access, other domains and the EE edition implement these;
// License imports none of them, so every product can depend on License.

// The cloud plan cache, implemented by data-access/plan-cache.ts. Every key is the root org's.
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

// What has been reported to the License Server, implemented by data-access/usage-report-cache.ts.
export type TUsageReportCache = {
  acquireReconcileMarker(orgId: string): Promise<boolean>;
  isReconciled(orgId: string): Promise<boolean>;
  lastReported(reportOrgId: string, meterKey: string): Promise<number | null>;
  recordReported(reportOrgId: string, meterKey: string, value: number): Promise<void>;
};

// Organizations, implemented by the organizations-projects domain's service.
export type TLicenseOrganizations = {
  // The org's root: itself for a root org, the root a sub-org belongs to. Null when the org does not exist.
  // The License Server knows only root orgs.
  findRootOrgId(orgId: string): Promise<string | null>;
  // The org's root, or the org itself when it does not exist.
  resolveRootOrgId(orgId: string): Promise<string>;
  // The org's name and slug, read fresh because they can change. Null when the org does not exist.
  findOrganization(orgId: string): Promise<{ id: string; name: string; slug: string } | null>;
  // The projects that count against a plan's workspace limit, shown on the plan as workspacesUsed.
  countWorkspaces(rootOrgId: string): Promise<number>;
  // A null orgId counts the whole instance.
  countSeats(orgId: string | null): Promise<SeatUsage>;
};

// A meter's live count, built by the domain that owns the data it counts.
export type TUsageCounter = {
  readonly meter: Meter;
  // A null orgId counts the whole instance: a self-hosted license covers every org in the database.
  count(orgId: string | null): Promise<number>;
};

// Licensing policy, implemented by the EE edition's LicenseResolver. CE holds the mechanism (caching, queues,
// counting, gating) and asks this for every licensing decision; there is no community fallback, so the free
// tier's features stay EE-licensed.
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

// The License Server's usage and subscription endpoints, implemented by the EE edition's LicenseServerClient.
export type TLicenseServer = {
  // False when no License Server is configured, so usage is not queued.
  isEnabled(): boolean;
  // Whether usage can be sent: a License Server URL and credentials are configured.
  canReportUsage(): boolean;
  reportSnapshots(orgId: string, snapshots: TUsageSnapshot[]): Promise<void>;
  reportEvents(orgId: string, events: TUsageEvent[]): Promise<TUsageEventResult[]>;
  // Cloud: cancels a root org's subscription. A 4xx answer is a BadRequestError.
  cancelSubscription(orgId: string): Promise<unknown>;
};
