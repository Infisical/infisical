/* eslint-disable class-methods-use-this */
import { TLicenseServerBilling } from "../service/license-server-types/license-server-types";

const notConfigured = () => Promise.reject(new Error("license client backend is not configured"));

// Billing with no License Server behind it: reads return nothing and changes are refused.
export class FakeLicenseServerBilling implements TLicenseServerBilling {
  isEnabled: TLicenseServerBilling["isEnabled"] = () => false;

  getEntitlements: TLicenseServerBilling["getEntitlements"] = async () => null;

  getCatalog: TLicenseServerBilling["getCatalog"] = async () => null;

  getSubscription: TLicenseServerBilling["getSubscription"] = async () => null;

  getCloudPlan: TLicenseServerBilling["getCloudPlan"] = async () => null;

  getBillingProfile: TLicenseServerBilling["getBillingProfile"] = async () => null;

  getTrials: TLicenseServerBilling["getTrials"] = async () => ({ trials: [] });

  createPortal: TLicenseServerBilling["createPortal"] = notConfigured;

  previewSubscriptionChange: TLicenseServerBilling["previewSubscriptionChange"] = notConfigured;

  buyProduct: TLicenseServerBilling["buyProduct"] = notConfigured;

  removeProduct: TLicenseServerBilling["removeProduct"] = notConfigured;

  upgradeProduct: TLicenseServerBilling["upgradeProduct"] = notConfigured;

  changeCommitments: TLicenseServerBilling["changeCommitments"] = notConfigured;

  startTrial: TLicenseServerBilling["startTrial"] = notConfigured;

  cancelTrial: TLicenseServerBilling["cancelTrial"] = notConfigured;

  confirmTrialPayment: TLicenseServerBilling["confirmTrialPayment"] = notConfigured;

  cancelSubscription: TLicenseServerBilling["cancelSubscription"] = notConfigured;

  resumeSubscription: TLicenseServerBilling["resumeSubscription"] = notConfigured;
}
