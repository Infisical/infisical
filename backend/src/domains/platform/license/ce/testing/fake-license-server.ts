/* eslint-disable class-methods-use-this */
import { ExternalSystemError } from "@app/domains/lib/errors";

import { InstanceEntitlements, InstanceType, TInstanceEntitlementsProps } from "../model/instance-entitlements";
import { Plan, TPlanProps } from "../model/plan";
import {
  TLicenseProvider,
  TLicenseServer,
  TMeteringEvent,
  TUsageSnapshot,
  TUsageSnapshotOutcome
} from "../service/dependencies";
import { TEntitlementOrg } from "../service/license-server-types/license-server-types";
import { FakeLicenseServerBilling } from "./fake-license-server-billing";
import { enterprisePlan, testFeatures } from "./test-features";

// Plays both EE's provider and the License Server in memory. Cloud by default.
export class FakeLicenseServer implements TLicenseProvider, TLicenseServer {
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

  fetchedOrgs: TEntitlementOrg[] = [];

  failNextFetches = 0;

  meteringEnabled = true;

  reporting = true;

  snapshots: { orgId: string; snapshot: TUsageSnapshot }[] = [];

  events: { orgId: string; event: TMeteringEvent }[] = [];

  // Each entry answers the next report: a final outcome, or an Error to retry.
  failNextReports: (Exclude<TUsageSnapshotOutcome, "reported"> | "rejected" | Error)[] = [];

  // Reports the server receives but whose reply never comes back.
  loseNextReplies = 0;

  deletedOrgs: string[] = [];

  deleteFailure: Error | null = null;

  billing = new FakeLicenseServerBilling();

  resolveInstanceEntitlements = async () => InstanceEntitlements.restore(this.instance);

  refreshInstanceEntitlements = async () => {
    if (!this.online) return null;
    if (this.refreshFailure) throw this.refreshFailure;
    return InstanceEntitlements.restore(this.instance);
  };

  hasOnlineLicense = () => this.online;

  isOffline = () => this.offline;

  fetchPlan = async (rootOrg: TEntitlementOrg) => {
    const rootOrgId = rootOrg.id;
    this.fetches.push(rootOrgId);
    this.fetchedOrgs.push(rootOrg);
    if (this.failNextFetches > 0) {
      this.failNextFetches -= 1;
      throw new ExternalSystemError({ message: "License Server entitlements are unavailable" });
    }
    return Plan.restore(this.plans.get(rootOrgId) ?? enterprisePlan());
  };

  fallbackPlan = () => Plan.restore({ ...InstanceEntitlements.restore(this.instance).plan().toJSON(), slug: null });

  isEnabled = () => this.meteringEnabled;

  canReportUsage = () => this.reporting;

  reportSnapshot = async (orgId: string, snapshot: TUsageSnapshot): Promise<TUsageSnapshotOutcome> => {
    const failure = this.failNextReports.shift();
    if (failure instanceof Error) throw failure;
    if (failure === "no-license" || failure === "not-priced") return failure;
    this.snapshots.push({ orgId, snapshot });
    if (this.loseNextReplies > 0) {
      this.loseNextReplies -= 1;
      throw new Error("License Server reply lost");
    }
    return "reported";
  };

  reportEvents = async (orgId: string, events: TMeteringEvent[]) => {
    const failure = this.failNextReports.shift();
    if (failure instanceof Error) throw failure;
    if (failure) return { status: "rejected" as const, reason: failure };
    events.forEach((event) => this.events.push({ orgId, event }));
    return { status: "reported" as const, accepted: events.length, deduped: 0 };
  };

  deleteOrganization = async (orgId: string) => {
    if (this.deleteFailure) throw this.deleteFailure;
    this.deletedOrgs.push(orgId);
    return { licensesClosed: 1, canceledSubscriptionIds: [], commitmentForfeited: false };
  };
}
