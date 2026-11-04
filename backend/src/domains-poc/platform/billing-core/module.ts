import { TDomainModule } from "@app/domains-poc/lib/domain-module";

import { PlanFeatureService, TPlanFeature } from "./service/plan-feature-service";

export type { TPlanFeature };

export interface TBillingCoreService {
  assertFeature(orgId: string, feature: TPlanFeature): Promise<void>;
}

export class BillingCoreModule implements TDomainModule<TBillingCoreService> {
  readonly name = "billing-core";

  readonly service: TBillingCoreService;

  readonly routes: TDomainModule<TBillingCoreService>["routes"] = {};

  constructor({ licensedFeatures }: { licensedFeatures: TPlanFeature[] }) {
    const planFeatureService = new PlanFeatureService({ licensedFeatures });

    this.service = {
      assertFeature: (orgId, feature) => planFeatureService.assertFeature(orgId, feature)
    };
  }
}
