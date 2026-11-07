import { getDefaultOnPremFeatures } from "../model/default-features";
import { InstanceType } from "../model/license-types";
import { TInstanceEntitlements } from "../model/plan";

export class InstanceEntitlementsHolder {
  private current: TInstanceEntitlements = {
    instanceType: InstanceType.OnPrem,
    features: getDefaultOnPremFeatures(),
    licenseId: null,
    customerId: null
  };

  get(): TInstanceEntitlements {
    return this.current;
  }

  set(entitlements: TInstanceEntitlements) {
    this.current = entitlements;
  }
}
