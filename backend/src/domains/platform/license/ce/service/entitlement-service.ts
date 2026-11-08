import { InstanceType, TFeatureSet } from "../model/license-types";
import { Plan, TInstanceEntitlements, TPlan, TPlanFeature } from "../model/plan";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { OrganizationDirectory } from "./organization-directory";
import { PlanCache } from "./plan-cache";
import { PlanResolver, TRefreshPlanOptions } from "./plan-resolver";

export type TEntitlementServiceDeps = {
  instance: InstanceEntitlementsHolder;
  planCache: PlanCache;
  organizations: OrganizationDirectory;
  planResolver: PlanResolver;
};

export class EntitlementService {
  constructor(private readonly deps: TEntitlementServiceDeps) {}

  getInstanceEntitlements(): TInstanceEntitlements {
    return this.deps.instance.get();
  }

  getInstanceType(): InstanceType {
    return this.deps.instance.get().instanceType;
  }

  hasInstanceFeature(feature: keyof TFeatureSet): boolean {
    return Boolean(this.deps.instance.get().features[feature]);
  }

  getLicenseId(): string {
    return this.deps.instance.get().licenseId ?? "unknown";
  }

  getPlan(orgId: string): Promise<TPlan> {
    return this.deps.planResolver.resolve(orgId);
  }

  async hasFeature(orgId: string, feature: TPlanFeature): Promise<boolean> {
    return Plan.restore(await this.deps.planResolver.resolve(orgId)).has(feature);
  }

  async assertFeature(orgId: string, feature: TPlanFeature): Promise<void> {
    Plan.restore(await this.deps.planResolver.resolve(orgId)).assert(feature);
  }

  refreshPlan(orgId: string, opts?: TRefreshPlanOptions): Promise<void> {
    return this.deps.planResolver.refresh(orgId, opts);
  }

  async invalidatePlan(orgId: string): Promise<void> {
    await this.deps.planCache.invalidate(await this.deps.organizations.rootOrgIdOf(orgId));
  }

  async isServingFallbackPlan(orgId: string): Promise<boolean> {
    if (!this.deps.instance.isCloud()) return false;
    return this.deps.planCache.isFallback(await this.deps.organizations.rootOrgIdOf(orgId));
  }

  async getLastKnownPlan(orgId: string) {
    return this.deps.planCache.lastKnown(await this.deps.organizations.rootOrgIdOf(orgId));
  }
}
