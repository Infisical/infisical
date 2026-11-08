/* eslint-disable class-methods-use-this */
import { DormantLicenseServerClient } from "../license-server-client/dormant-license-server-client";
import { TLicenseServerClient } from "../license-server-client/license-server-client";
import { TEntitlementOrg, TEntitlementsResponse } from "../license-server-client/license-server-types";
import { TUsageEvent, TUsageSnapshot, UsageReportError } from "../license-server-client/usage-reports";
import { InstanceEntitlements, TInstanceFeatures } from "../model/instance-entitlements";
import { TPlanProps } from "../model/plan";

export const enterprisePlan = (): TInstanceFeatures => ({
  ...InstanceEntitlements.communityFeatures(),
  slug: "enterprise",
  rbac: true as false
});

// A License Server in memory: a plan per root org, the reports it received, and failures to inject. Billing
// calls behave as with no License Server.
export class FakeLicenseServerClient extends DormantLicenseServerClient implements TLicenseServerClient {
  plans = new Map<string, TPlanProps>();

  // When set, every entitlements read answers with it, whatever the org.
  entitlements: TEntitlementsResponse | null = null;

  fetches: TEntitlementOrg[] = [];

  failNextFetches = 0;

  snapshots: { orgId: string; snapshot: TUsageSnapshot }[] = [];

  events: { orgId: string; event: TUsageEvent }[] = [];

  failNextReports: UsageReportError[] = [];

  cancellations: string[] = [];

  cancelFailure: Error | null = null;

  enabled = true;

  reporting = true;

  private readonly issued = new WeakMap<TEntitlementsResponse, TPlanProps>();

  isEnabled = () => this.enabled;

  canReportUsage = () => this.reporting;

  getEntitlements = async (org: TEntitlementOrg) => {
    this.fetches.push(org);
    if (this.failNextFetches > 0) {
      this.failNextFetches -= 1;
      return null;
    }
    if (this.entitlements) return this.entitlements;
    const plan = this.plans.get(org.id) ?? enterprisePlan();
    const entitlements = { slug: plan.slug, features: {}, products: [] } as unknown as TEntitlementsResponse;
    this.issued.set(entitlements, plan);
    return entitlements;
  };

  // The plan behind entitlements this fake issued, for FakeLicenseHooks to turn back into a plan.
  planFor(entitlements: TEntitlementsResponse): TPlanProps {
    const plan = this.issued.get(entitlements);
    if (!plan) throw new Error("These entitlements were not issued by this FakeLicenseServerClient");
    return plan;
  }

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
    return {} as Awaited<ReturnType<TLicenseServerClient["cancelSubscription"]>>;
  };
}
