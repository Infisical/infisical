/* eslint-disable class-methods-use-this */
import { TLicenseServerBilling } from "../services/helpers/license-server-types";

const notConfigured = () => Promise.reject(new Error("license client backend is not configured"));

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
}
