import { PlanCache } from "../data-access/plan-cache";
import { InstanceType, TInstanceEntitlementsProps, TInstanceFeatures } from "../model/instance-entitlements";
import { TPlanFeature, TPlanProps } from "../model/plan";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { OrganizationDirectory } from "./organization-directory";
import { PlanResolver, TRefreshPlanOptions } from "./plan-resolver";

export type TEntitlementServiceDeps = {
  instance: InstanceEntitlementsHolder;
  planCache: PlanCache;
  organizations: OrganizationDirectory;
  planResolver: PlanResolver;
};

export class EntitlementService {
  constructor(private readonly deps: TEntitlementServiceDeps) {}

  getInstanceEntitlements(): TInstanceEntitlementsProps {
    return this.deps.instance.get().toJSON();
  }

  getInstanceType(): InstanceType {
    return this.deps.instance.get().instanceType;
  }

  hasInstanceFeature(feature: keyof TInstanceFeatures): boolean {
    return this.deps.instance.get().has(feature);
  }

  getLicenseId(): string {
    return this.deps.instance.get().licenseId;
  }

  async getPlan(orgId: string): Promise<TPlanProps> {
    return (await this.deps.planResolver.resolve(orgId)).toJSON();
  }

  async hasFeature(orgId: string, feature: TPlanFeature): Promise<boolean> {
    return (await this.deps.planResolver.resolve(orgId)).has(feature);
  }

  async assertFeature(orgId: string, feature: TPlanFeature): Promise<void> {
    (await this.deps.planResolver.resolve(orgId)).assert(feature);
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

  async getLastKnownPlan(orgId: string): Promise<{ plan: TPlanProps; fetchedAt: number } | null> {
    const lastKnown = await this.deps.planCache.lastKnown(await this.deps.organizations.rootOrgIdOf(orgId));
    return lastKnown ? { plan: lastKnown.plan.toJSON(), fetchedAt: lastKnown.fetchedAt } : null;
  }
}
