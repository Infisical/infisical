/* eslint-disable class-methods-use-this */
import { InstanceEntitlements, InstanceType, TInstanceEntitlementsRecord } from "../models/instance-entitlements";
import { Plan, TPlanFeatures } from "../models/plan";
import { SeatUsage } from "../models/seat-usage";
import { TLicenseService } from "../services/license/service";
import { testFeatures } from "./test-features";

const noSeatsUsed = () => SeatUsage.create({ membersUsed: 0, identitiesUsed: 0 });

// For tests of code that uses License: set a plan per org.
export class FakeLicenseService implements TLicenseService {
  instance: TInstanceEntitlementsRecord = {
    instanceType: InstanceType.Cloud,
    features: testFeatures(),
    licenseId: null
  };

  plans = new Map<string, TPlanFeatures>();

  defaultPlan: TPlanFeatures = testFeatures();

  fallbackOrgs = new Set<string>();

  lastKnown = new Map<string, { plan: TPlanFeatures; fetchedAt: number }>();

  setPlan(orgId: string, plan: Partial<TPlanFeatures>) {
    this.plans.set(orgId, { ...testFeatures(), ...plan });
    return this;
  }

  getInstanceEntitlements = () => InstanceEntitlements.restore(this.instance);

  refreshInstanceEntitlements = async () => undefined;

  getPlan = async (orgId: string) => {
    const plan = Plan.restore(this.plans.get(orgId) ?? this.defaultPlan);
    return this.fallbackOrgs.has(orgId) ? plan.asFallback() : plan;
  };

  refreshPlan = async () => undefined;

  invalidatePlan = async () => undefined;

  getLastKnownPlan = async (orgId: string) => {
    const lastKnown = this.lastKnown.get(orgId);
    return lastKnown ? { plan: Plan.restore(lastKnown.plan), fetchedAt: lastKnown.fetchedAt } : null;
  };

  getSeatUsage: TLicenseService["getSeatUsage"] = async () => noSeatsUsed();

  getSeatCountScope = (orgId: string) => (this.instance.instanceType === InstanceType.Cloud ? orgId : null);

  closeDeletedOrg = async () => ({ licensesClosed: 0, canceledSubscriptionIds: [], commitmentForfeited: false });

  hasOfflineLicenseKey = () => false;
}
