import { TLicenseServerBilling } from "../model/license-server-types";

const notConfigured = () => Promise.reject(new Error("license client backend is not configured"));

// The billing surface with no License Server: reads return nothing and changes are refused.
export const dormantBilling: TLicenseServerBilling = {
  isEnabled: () => false,
  getEntitlements: async () => null,
  getCatalog: async () => null,
  getSubscription: async () => null,
  getCloudPlan: async () => null,
  getBillingProfile: async () => null,
  createPortal: notConfigured,
  previewSubscriptionChange: notConfigured,
  buyProduct: notConfigured,
  removeProduct: notConfigured,
  upgradeProduct: notConfigured,
  changeCommitments: notConfigured,
  startTrial: notConfigured,
  cancelTrial: notConfigured,
  confirmTrialPayment: notConfigured,
  getTrials: async () => ({ trials: [] }),
  cancelSubscription: notConfigured,
  resumeSubscription: notConfigured,
  markEntitlementsStale: async () => undefined,
  refreshEntitlements: async () => undefined
};
