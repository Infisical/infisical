import { InstanceType, TFeatureSet } from "../model/license-types";
import { Plan, TInstanceEntitlements, TPlan, TPlanFeature } from "../model/plan";
import { isCloud, refreshPlanFor, resolvePlan, rootOrgOf, TLicenseContext } from "./license-context";

export class EntitlementService {
  constructor(private readonly ctx: TLicenseContext) {}

  getInstanceEntitlements(): TInstanceEntitlements {
    return this.ctx.state.instance.get();
  }

  getInstanceType(): InstanceType {
    return this.ctx.state.instance.get().instanceType;
  }

  hasInstanceFeature(feature: keyof TFeatureSet): boolean {
    return Boolean(this.ctx.state.instance.get().features[feature]);
  }

  getLicenseId(): string {
    return this.ctx.state.instance.get().licenseId ?? "unknown";
  }

  getPlan(orgId: string): Promise<TPlan> {
    return resolvePlan(this.ctx, orgId);
  }

  async hasFeature(orgId: string, feature: TPlanFeature): Promise<boolean> {
    return Plan.restore(await resolvePlan(this.ctx, orgId)).has(feature);
  }

  async assertFeature(orgId: string, feature: TPlanFeature): Promise<void> {
    Plan.restore(await resolvePlan(this.ctx, orgId)).assert(feature);
  }

  refreshPlan(orgId: string): Promise<void> {
    return refreshPlanFor(this.ctx, orgId);
  }

  async invalidatePlan(orgId: string): Promise<void> {
    const root = await rootOrgOf(this.ctx, orgId);
    await this.ctx.state.planCache.invalidate(root?.id ?? orgId);
  }

  async isServingFallbackPlan(orgId: string): Promise<boolean> {
    if (!isCloud(this.ctx)) return false;
    const root = await rootOrgOf(this.ctx, orgId);
    return this.ctx.state.planCache.isFallback(root?.id ?? orgId);
  }

  async getLastKnownPlan(orgId: string) {
    const root = await rootOrgOf(this.ctx, orgId);
    return this.ctx.state.planCache.lastKnown(root?.id ?? orgId);
  }
}
