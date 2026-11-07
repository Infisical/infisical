import { TLicenseServerBilling } from "../model/license-server-types";
import { TFeatureSet } from "../model/license-types";
import { TInstanceEntitlements, TPlan } from "../model/plan";
import { TRootOrg } from "../model/root-org";
import { TUsageReporter } from "../model/usage-report";

// The steps the EE edition supplies. Without them the instance runs the community edition.
export type TLicenseHooks = {
  // The instance's own license, read once at boot.
  resolveInstanceEntitlements: () => Promise<TInstanceEntitlements>;
  // Reads an online license again. Null when the instance has none; throws when the License Server fails.
  refreshInstanceEntitlements: () => Promise<TInstanceEntitlements | null>;
  // Whether refreshInstanceEntitlements should also run on a timer.
  hasOnlineLicense: () => boolean;
  // Cloud: a root org's plan from the License Server. Throws when it cannot be read.
  fetchPlan: (rootOrg: TRootOrg) => Promise<TPlan>;
  // Cloud: what an org gets while the License Server cannot be reached.
  fallbackPlan: (instanceFeatures: TFeatureSet) => TPlan;
  // Cloud: cancels a root org's subscription. A 4xx answer is a BadRequestError.
  cancelSubscription: (orgId: string) => Promise<void>;
  // False when no License Server is configured, so usage is not queued.
  isMeteringEnabled: () => boolean;
  usageReporter: TUsageReporter | null;
  // Whether this instance meters usage events at all (an offline license never reports).
  isOffline: () => boolean;
  billing: TLicenseServerBilling;
};
