/* eslint-disable class-methods-use-this */
import { TEntitlementsResponse } from "../../ce/model/license-server-types";
import { dormantBilling } from "../../ce/service/dormant-billing";
import { TLicenseServerClient } from "../service/license-server/license-server-client";

// A License Server that answers every entitlements read with `entitlements`, or fails with `failure`. Billing
// calls behave as with no License Server.
export class FakeLicenseServerClient implements TLicenseServerClient {
  entitlements: TEntitlementsResponse | null = null;

  failure: Error | null = null;

  refreshes = 0;

  isEnabled = () => true;

  getEntitlements = async () => {
    if (this.failure) throw this.failure;
    return this.entitlements;
  };

  invalidateEntitlements = async () => undefined;

  refreshEntitlements = async () => {
    this.refreshes += 1;
  };

  getCatalog = dormantBilling.getCatalog;

  getSubscription = dormantBilling.getSubscription;

  getCloudPlan = dormantBilling.getCloudPlan;

  getBillingProfile = dormantBilling.getBillingProfile;

  createPortal = dormantBilling.createPortal;

  previewSubscriptionChange = dormantBilling.previewSubscriptionChange;

  buyProduct = dormantBilling.buyProduct;

  removeProduct = dormantBilling.removeProduct;

  upgradeProduct = dormantBilling.upgradeProduct;

  changeCommitments = dormantBilling.changeCommitments;

  startTrial = dormantBilling.startTrial;

  cancelTrial = dormantBilling.cancelTrial;

  confirmTrialPayment = dormantBilling.confirmTrialPayment;

  getTrials = dormantBilling.getTrials;

  cancelSubscription = dormantBilling.cancelSubscription;

  resumeSubscription = dormantBilling.resumeSubscription;
}
