/* eslint-disable class-methods-use-this */
import { TLicenseServerClient } from "./license-server-client";

const notConfigured = () => Promise.reject(new Error("license client backend is not configured"));

// The License Server as the community edition sees it: there is none. Reads return nothing, changes are
// refused, and no usage is reported.
export class DormantLicenseServerClient implements TLicenseServerClient {
  isEnabled: TLicenseServerClient["isEnabled"] = () => false;

  canReportUsage: TLicenseServerClient["canReportUsage"] = () => false;

  getEntitlements: TLicenseServerClient["getEntitlements"] = async () => null;

  getCatalog: TLicenseServerClient["getCatalog"] = async () => null;

  getSubscription: TLicenseServerClient["getSubscription"] = async () => null;

  getCloudPlan: TLicenseServerClient["getCloudPlan"] = async () => null;

  getBillingProfile: TLicenseServerClient["getBillingProfile"] = async () => null;

  getTrials: TLicenseServerClient["getTrials"] = async () => ({ trials: [] });

  reportSnapshots: TLicenseServerClient["reportSnapshots"] = async () => undefined;

  reportEvents: TLicenseServerClient["reportEvents"] = async () => [];

  createPortal: TLicenseServerClient["createPortal"] = notConfigured;

  previewSubscriptionChange: TLicenseServerClient["previewSubscriptionChange"] = notConfigured;

  buyProduct: TLicenseServerClient["buyProduct"] = notConfigured;

  removeProduct: TLicenseServerClient["removeProduct"] = notConfigured;

  upgradeProduct: TLicenseServerClient["upgradeProduct"] = notConfigured;

  changeCommitments: TLicenseServerClient["changeCommitments"] = notConfigured;

  startTrial: TLicenseServerClient["startTrial"] = notConfigured;

  cancelTrial: TLicenseServerClient["cancelTrial"] = notConfigured;

  confirmTrialPayment: TLicenseServerClient["confirmTrialPayment"] = notConfigured;

  cancelSubscription: TLicenseServerClient["cancelSubscription"] = notConfigured;

  resumeSubscription: TLicenseServerClient["resumeSubscription"] = notConfigured;
}
