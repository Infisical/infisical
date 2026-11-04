import { BadRequestError } from "@app/lib/errors";

import { TBillingCoreService, TPlanFeature } from "../module";

export class FakeBillingCoreService implements TBillingCoreService {
  constructor(readonly licensedFeatures: TPlanFeature[] = []) {}

  async assertFeature(_orgId: string, feature: TPlanFeature) {
    if (!this.licensedFeatures.includes(feature)) {
      throw new BadRequestError({ message: `Plan does not include ${feature}` });
    }
  }
}
