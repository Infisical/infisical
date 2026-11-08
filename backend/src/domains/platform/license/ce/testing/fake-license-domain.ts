/* eslint-disable class-methods-use-this */
import { getDefaultOnPremFeatures } from "../model/default-features";
import { InstanceType } from "../model/license-types";
import { Plan, TInstanceEntitlements, TPlan, TPlanFeature } from "../model/plan";
import { TLicenseDomain } from "../module";
import { dormantBilling } from "../service/dormant-billing";

// For consumers of the License domain: a plan per org that the test sets, and a record of what was reported.
export class FakeLicenseDomain implements TLicenseDomain {
  instance: TInstanceEntitlements = {
    instanceType: InstanceType.Cloud,
    features: getDefaultOnPremFeatures(),
    licenseId: null,
    customerId: null
  };

  plans = new Map<string, TPlan>();

  defaultPlan: TPlan = getDefaultOnPremFeatures();

  fallbackOrgs = new Set<string>();

  lastKnown = new Map<string, { plan: TPlan; fetchedAt: number }>();

  seats = new Map<string, { membersUsed: number; identitiesUsed: number }>();

  emitted: { orgId: string; dimensionKey: string }[] = [];

  syncedSeats: string[] = [];

  cancelled: string[] = [];

  billing = dormantBilling;

  setPlan(orgId: string, plan: Partial<TPlan>) {
    this.plans.set(orgId, { ...getDefaultOnPremFeatures(), ...plan } as TPlan);
    return this;
  }

  getInstanceEntitlements = () => this.instance;

  getInstanceType = () => this.instance.instanceType;

  hasInstanceFeature = (feature: keyof TInstanceEntitlements["features"]) => Boolean(this.instance.features[feature]);

  getLicenseId = () => this.instance.licenseId ?? "unknown";

  getPlan = async (orgId: string) => this.plans.get(orgId) ?? this.defaultPlan;

  hasFeature = async (orgId: string, feature: TPlanFeature) => Plan.restore(await this.getPlan(orgId)).has(feature);

  assertFeature = async (orgId: string, feature: TPlanFeature) =>
    Plan.restore(await this.getPlan(orgId)).assert(feature);

  refreshPlan = async () => undefined;

  invalidatePlan = async () => undefined;

  isServingFallbackPlan = async (orgId: string) => this.fallbackOrgs.has(orgId);

  getLastKnownPlan = async (orgId: string) => this.lastKnown.get(orgId) ?? null;

  getSeatUsage = async (orgId: string) => this.seats.get(orgId) ?? { membersUsed: 0, identitiesUsed: 0 };

  instanceSeats = { membersUsed: 0, identitiesUsed: 0 };

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
