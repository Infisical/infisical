import { InstanceEntitlements } from "../model/instance-entitlements";
import { Plan } from "../model/plan";
import { TLicenseServerBilling } from "./license-server-types/license-server-types";
import { TUsageEvent, TUsageEventResult, TUsageSnapshot } from "./license-server-types/usage-reports";

// Licensing policy and the License Server, supplied by the EE edition. CE holds the mechanism (caching,
// queues, counting, gating) and asks these for every licensing decision; there is no community fallback, so
// the free tier's features stay EE-licensed.
export type TLicenseHooks = {
  // The instance's own license, read once at boot.
  resolveInstanceEntitlements: () => Promise<InstanceEntitlements>;
  // Reads an online license again. Null when the instance has none; throws when the License Server fails.
  refreshInstanceEntitlements: () => Promise<InstanceEntitlements | null>;
  // Whether refreshInstanceEntitlements should also run on a timer.
  hasOnlineLicense: () => boolean;
  // Whether LICENSE_KEY holds an offline key, whether or not it verifies.
  isOffline: () => boolean;
  // Cloud: a root org's plan from the License Server. Throws when it cannot be read.
  fetchPlan: (rootOrgId: string) => Promise<Plan>;
  // Cloud: what an org gets while the License Server cannot be reached.
  fallbackPlan: () => Plan;
  // False when no License Server is configured, so usage is not queued.
  isMeteringEnabled: () => boolean;
  // Whether usage can be sent: a License Server URL and credentials are configured.
  canReportUsage: () => boolean;
  reportSnapshots: (orgId: string, snapshots: TUsageSnapshot[]) => Promise<void>;
  reportEvents: (orgId: string, events: TUsageEvent[]) => Promise<TUsageEventResult[]>;
  // Cloud: cancels a root org's subscription. A 4xx answer is a BadRequestError.
  cancelSubscription: (orgId: string) => Promise<void>;
  billing: TLicenseServerBilling;
};
