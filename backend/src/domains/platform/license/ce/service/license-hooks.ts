import { TEntitlementsResponse } from "../license-server-client/license-server-types";
import { InstanceEntitlements } from "../model/instance-entitlements";
import { Plan } from "../model/plan";

// The steps the EE edition supplies. Without them the instance runs the community edition.
export type TLicenseHooks = {
  // The instance's own license, read once at boot.
  resolveInstanceEntitlements: () => Promise<InstanceEntitlements>;
  // Reads an online license again. Null when the instance has none; throws when the License Server fails.
  refreshInstanceEntitlements: () => Promise<InstanceEntitlements | null>;
  // Whether refreshInstanceEntitlements should also run on a timer.
  hasOnlineLicense: () => boolean;
  // Cloud: the plan a root org's License Server entitlements grant.
  planFromEntitlements: (entitlements: TEntitlementsResponse) => Plan;
  // Cloud: what an org gets while the License Server cannot be reached.
  fallbackPlan: (instance: InstanceEntitlements) => Plan;
  // Whether LICENSE_KEY holds an offline key, whether or not it verifies.
  isOffline: () => boolean;
};
