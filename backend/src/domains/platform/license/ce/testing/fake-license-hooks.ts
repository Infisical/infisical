/* eslint-disable class-methods-use-this */
import { BadRequestError } from "@app/lib/errors";

import { getDefaultOnPremFeatures } from "../model/default-features";
import { InstanceType, TFeatureSet } from "../model/license-types";
import { TInstanceEntitlements, TPlan } from "../model/plan";
import { TRootOrg } from "../model/root-org";
import { TUsageEvent, TUsageReporter, TUsageSnapshot, UsageReportError } from "../model/usage-report";
import { dormantBilling } from "../service/dormant-billing";
import { TLicenseHooks } from "../service/license-hooks";

export const enterprisePlan = (): TFeatureSet => ({
  ...getDefaultOnPremFeatures(),
  slug: "enterprise",
  rbac: true as false
});

// A License Server in memory: plans per root org, reports it received, and failures to inject.
export class FakeLicenseHooks implements TLicenseHooks {
  instance: TInstanceEntitlements = {
    instanceType: InstanceType.Cloud,
    features: getDefaultOnPremFeatures(),
    licenseId: null,
    customerId: null
  };

  plans = new Map<string, TPlan>();

  planFetches: TRootOrg[] = [];

  snapshots: { orgId: string; snapshot: TUsageSnapshot }[] = [];

  events: { orgId: string; event: TUsageEvent }[] = [];

  cancellations: string[] = [];

  failNextFetches = 0;

  failNextReports: UsageReportError[] = [];

  cancelFailure: Error | null = null;

  refreshFailure: Error | null = null;

  online = false;

  meteringEnabled = true;

  offline = false;

  billing = dormantBilling;

  usageReporter: TUsageReporter | null = {
    reportSnapshots: async (orgId, snapshots) => {
      const failure = this.failNextReports.shift();
      if (failure) throw failure;
      snapshots.forEach((snapshot) => this.snapshots.push({ orgId, snapshot }));
    },
    reportEvents: async (orgId, events) => {
      const failure = this.failNextReports.shift();
      if (failure) throw failure;
      events.forEach((event) => this.events.push({ orgId, event }));
      return events.map((e) => ({ event_id: e.event_id, status: "accepted" as const }));
    }
  };

  resolveInstanceEntitlements = async () => this.instance;

  refreshInstanceEntitlements = async () => {
    if (!this.online) return null;
    if (this.refreshFailure) throw this.refreshFailure;
    return this.instance;
  };

  hasOnlineLicense = () => this.online;

  fetchPlan = async (rootOrg: TRootOrg) => {
    this.planFetches.push(rootOrg);
    if (this.failNextFetches > 0) {
      this.failNextFetches -= 1;
      throw new BadRequestError({ message: "License Server entitlements are unavailable" });
    }
    return this.plans.get(rootOrg.id) ?? enterprisePlan();
  };

  fallbackPlan = (features: TPlan) => ({ ...features, slug: null });

  cancelSubscription = async (orgId: string) => {
    if (this.cancelFailure) throw this.cancelFailure;
    this.cancellations.push(orgId);
  };

  isMeteringEnabled = () => this.meteringEnabled;

  isOffline = () => this.offline;
}
