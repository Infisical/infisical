/* eslint-disable class-methods-use-this */
import { InstanceType, TInstanceEntitlementsProps, TInstanceFeatures } from "../model/instance-entitlements";
import { Plan, TPlanFeature, TPlanProps } from "../model/plan";
import { SeatUsage } from "../model/seat-usage";
import { TLicenseDomain } from "../module";
import { FakeLicenseServerBilling } from "./fake-license-server-billing";
import { testFeatures } from "./test-features";

// For consumers of the License domain: a plan per org that the test sets, and a record of what was reported.
export class FakeLicenseDomain implements TLicenseDomain {
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

  seats = new Map<string, SeatUsage>();

  emitted: { orgId: string; dimensionKey: string }[] = [];

  syncedSeats: string[] = [];

  cancelled: string[] = [];

  billing = new FakeLicenseServerBilling();

  setPlan(orgId: string, plan: Partial<TPlanProps>) {
    this.plans.set(orgId, { ...testFeatures(), ...plan } as TPlanProps);
    return this;
  }

  getInstanceEntitlements = () => this.instance;

  getInstanceType = () => this.instance.instanceType;

  hasInstanceFeature = (feature: keyof TInstanceFeatures) => Boolean(this.instance.features[feature]);

  getLicenseId = () => this.instance.licenseId ?? "unknown";

  getPlan = async (orgId: string) => this.plans.get(orgId) ?? this.defaultPlan;

  hasFeature = async (orgId: string, feature: TPlanFeature) => Plan.restore(await this.getPlan(orgId)).has(feature);

  assertFeature = async (orgId: string, feature: TPlanFeature) =>
    Plan.restore(await this.getPlan(orgId)).assert(feature);

  refreshPlan = async () => undefined;

  invalidatePlan = async () => undefined;

  isServingFallbackPlan = async (orgId: string) => this.fallbackOrgs.has(orgId);

  getLastKnownPlan = async (orgId: string) => this.lastKnown.get(orgId) ?? null;

  getSeatUsage = async (orgId: string) =>
    this.seats.get(orgId) ?? SeatUsage.create({ membersUsed: 0, identitiesUsed: 0 });

  instanceSeats = SeatUsage.create({ membersUsed: 0, identitiesUsed: 0 });

  getInstanceSeatUsage = async () => this.instanceSeats;

  syncSeats = async (orgId: string) => {
    this.syncedSeats.push(orgId);
  };

  cancelSubscription = async (orgId: string) => {
    this.cancelled.push(orgId);
  };

  emit = (orgId: string, dimensionKey: string) => {
    this.emitted.push({ orgId, dimensionKey });
  };

  countUsage = async () => null;

  recordMeteringEvents = () => undefined;

  hasOfflineLicenseKey = () => false;
}
