import {
  TBillingProfileResponse,
  TBuyProductPayload,
  TCancelTrialPayload,
  TCatalogResponse,
  TChangeCommitmentsPayload,
  TCheckoutResult,
  TCloudPlanResponse,
  TConfirmTrialPaymentPayload,
  TConfirmTrialPaymentResult,
  TCreatePortalPayload,
  TEntitlementOrg,
  TEntitlementsResponse,
  TSessionResponse,
  TStartTrialPayload,
  TSubscriptionPreview,
  TSubscriptionPreviewPayload,
  TSubscriptionResponse,
  TTrialCancelResult,
  TTrialResult,
  TTrialsResponse,
  TUpgradePayload,
  TUpgradeResult
} from "./license-server-types";
import { TUsageEvent, TUsageEventResult, TUsageSnapshot } from "./usage-reports";

// A self-hosted license is one tenant on the License Server, so its reads and reports carry this id in
// place of an org id.
export const SELF_HOSTED_LICENSE_ORG_ID = "self-hosted";

// The billing calls the domain exposes to the billing portal.
export type TLicenseServerBilling = {
  isEnabled: () => boolean;
  getEntitlements: (org: TEntitlementOrg) => Promise<TEntitlementsResponse | null>;
  getCatalog: (orgId: string) => Promise<TCatalogResponse | null>;
  getSubscription: (orgId: string) => Promise<TSubscriptionResponse | null>;
  getCloudPlan: (orgId: string) => Promise<TCloudPlanResponse | null>;
  getBillingProfile: (orgId: string) => Promise<TBillingProfileResponse | null>;
  createPortal: (orgId: string, payload: TCreatePortalPayload) => Promise<TSessionResponse>;
  previewSubscriptionChange: (orgId: string, payload: TSubscriptionPreviewPayload) => Promise<TSubscriptionPreview>;
  buyProduct: (orgId: string, payload: TBuyProductPayload) => Promise<TCheckoutResult>;
  removeProduct: (orgId: string, productId: string) => Promise<TCheckoutResult>;
  upgradeProduct: (orgId: string, payload: TUpgradePayload) => Promise<TUpgradeResult>;
  changeCommitments: (orgId: string, payload: TChangeCommitmentsPayload) => Promise<TCheckoutResult>;
  startTrial: (orgId: string, payload: TStartTrialPayload) => Promise<TTrialResult>;
  cancelTrial: (orgId: string, payload: TCancelTrialPayload) => Promise<TTrialCancelResult>;
  confirmTrialPayment: (orgId: string, payload: TConfirmTrialPaymentPayload) => Promise<TConfirmTrialPaymentResult>;
  getTrials: (orgId: string) => Promise<TTrialsResponse>;
  cancelSubscription: (orgId: string) => Promise<TCheckoutResult>;
  resumeSubscription: (orgId: string) => Promise<TCheckoutResult>;
};

// Everything the License domain asks of the License Server. The EE edition supplies the real client; without
// it the domain uses DormantLicenseServerClient.
export type TLicenseServerClient = TLicenseServerBilling & {
  // Whether usage can be reported: a License Server URL and credentials are configured.
  canReportUsage: () => boolean;
  reportSnapshots: (orgId: string, snapshots: TUsageSnapshot[]) => Promise<void>;
  reportEvents: (orgId: string, events: TUsageEvent[]) => Promise<TUsageEventResult[]>;
};
