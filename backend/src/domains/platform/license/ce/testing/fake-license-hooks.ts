/* eslint-disable class-methods-use-this */
import { BadRequestError } from "@app/lib/errors";

import { InstanceEntitlements, InstanceType, TInstanceEntitlementsProps } from "../model/instance-entitlements";
import { Plan, TPlanProps } from "../model/plan";
import { TLicenseHooks } from "../service/license-hooks";
import { TUsageEvent, TUsageSnapshot, UsageReportError } from "../service/license-server-types/usage-reports";
import { FakeLicenseServerBilling } from "./fake-license-server-billing";
import { enterprisePlan, testFeatures } from "./test-features";

// The EE edition in memory: the instance's license, a plan per root org, the reports the License Server
// received, and failures to inject. A cloud instance by default.
export class FakeLicenseHooks implements TLicenseHooks {
  instance: TInstanceEntitlementsProps = {
    instanceType: InstanceType.Cloud,
    features: testFeatures(),
    licenseId: null,
    customerId: null
  };

  online = false;

  offline = false;

  refreshFailure: Error | null = null;

  plans = new Map<string, TPlanProps>();

  fetches: string[] = [];

  failNextFetches = 0;

  meteringEnabled = true;

  reporting = true;

  snapshots: { orgId: string; snapshot: TUsageSnapshot }[] = [];

  events: { orgId: string; event: TUsageEvent }[] = [];

  failNextReports: UsageReportError[] = [];

  cancellations: string[] = [];

  cancelFailure: Error | null = null;

  billing = new FakeLicenseServerBilling();

  resolveInstanceEntitlements = async () => InstanceEntitlements.restore(this.instance);

  refreshInstanceEntitlements = async () => {
    if (!this.online) return null;
    if (this.refreshFailure) throw this.refreshFailure;
    return InstanceEntitlements.restore(this.instance);
  };

  hasOnlineLicense = () => this.online;

  isOffline = () => this.offline;

  fetchPlan = async (rootOrgId: string) => {
    this.fetches.push(rootOrgId);
    if (this.failNextFetches > 0) {
      this.failNextFetches -= 1;
      throw new BadRequestError({ message: "License Server entitlements are unavailable" });
    }
    return Plan.restore(this.plans.get(rootOrgId) ?? enterprisePlan());
  };

  fallbackPlan = () => Plan.restore({ ...InstanceEntitlements.restore(this.instance).plan().toJSON(), slug: null });

  isMeteringEnabled = () => this.meteringEnabled;

  canReportUsage = () => this.reporting;

  reportSnapshots = async (orgId: string, snapshots: TUsageSnapshot[]) => {
    const failure = this.failNextReports.shift();
    if (failure) throw failure;
    snapshots.forEach((snapshot) => this.snapshots.push({ orgId, snapshot }));
  };

  reportEvents = async (orgId: string, events: TUsageEvent[]) => {
    const failure = this.failNextReports.shift();
    if (failure) throw failure;
    events.forEach((event) => this.events.push({ orgId, event }));
    return events.map((e) => ({ event_id: e.event_id, status: "accepted" as const }));
  };

  cancelSubscription = async (orgId: string) => {
    if (this.cancelFailure) throw this.cancelFailure;
    this.cancellations.push(orgId);
  };
}
