import { BadRequestError } from "@app/lib/errors";

export type TPlanFeature = "externalKms";

const PLAN_FEATURE_NAMES: Record<TPlanFeature, string> = {
  externalKms: "External KMS"
};

export interface TPlanFeatureService {
  hasFeature(orgId: string, feature: TPlanFeature): Promise<boolean>;
  assertFeature(orgId: string, feature: TPlanFeature): Promise<void>;
}

export class PlanFeatureService implements TPlanFeatureService {
  constructor(private readonly deps: { licensedFeatures: TPlanFeature[] }) {}

  async hasFeature(_orgId: string, feature: TPlanFeature) {
    return this.deps.licensedFeatures.includes(feature);
  }

  async assertFeature(orgId: string, feature: TPlanFeature) {
    if (!(await this.hasFeature(orgId, feature))) {
      throw new BadRequestError({
        message: `Your current plan does not include ${PLAN_FEATURE_NAMES[feature]}. Upgrade your plan to use it.`
      });
    }
  }
}
