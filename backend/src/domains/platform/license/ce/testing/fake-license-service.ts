/* eslint-disable class-methods-use-this */
import { InstanceType, TInstanceEntitlementsProps } from "../model/instance-entitlements";
import { Plan, TPlanProps } from "../model/plan";
import { SeatUsage } from "../model/seat-usage";
import { TLicenseService } from "../service/license-service";
import { testFeatures } from "./test-features";

const noSeatsUsed = () => SeatUsage.create({ membersUsed: 0, identitiesUsed: 0 });

// For tests of code that uses License: set a plan per org.
export class FakeLicenseService implements TLicenseService {
  instance: TInstanceEntitlementsProps = {
    instanceType: InstanceType.Cloud,
    features: testFeatures(),
    licenseId: null,
    customerId: null
  };

  plans = new Map<string, TPlanProps>();

  defaultPlan: TPlanProps = testFeatures();

  fallbackOrgs = new Set<string>();

  lastKnown = new Map<string, { plan: TPlanProps; fetchedAt: number }>();

  setPlan(orgId: string, plan: Partial<TPlanProps>) {
    this.plans.set(orgId, { ...testFeatures(), ...plan } as TPlanProps);
    return this;
  }

  getInstanceEntitlements = () => this.instance;

  getInstanceType = () => this.instance.instanceType;

  getLicenseId = () => this.instance.licenseId ?? "unknown";

  getPlan = async (orgId: string) => Plan.restore(this.plans.get(orgId) ?? this.defaultPlan);

  refreshPlan = async () => undefined;

  invalidatePlan = async () => undefined;

  isServingFallbackPlan = async (orgId: string) => this.fallbackOrgs.has(orgId);

  getLastKnownPlan = async (orgId: string) => {
    const lastKnown = this.lastKnown.get(orgId);
    return lastKnown ? { plan: Plan.restore(lastKnown.plan), fetchedAt: lastKnown.fetchedAt } : null;
  };

  getSeatUsage: TLicenseService["getSeatUsage"] = async () => noSeatsUsed();

  getInstanceSeatUsage = async () => noSeatsUsed();

  getSeatCountScope = (orgId: string) => (this.instance.instanceType === InstanceType.Cloud ? orgId : null);

  closeDeletedOrg = async () => ({ licensesClosed: 0, canceledSubscriptionIds: [], commitmentForfeited: false });

  hasOfflineLicenseKey = () => false;
}
