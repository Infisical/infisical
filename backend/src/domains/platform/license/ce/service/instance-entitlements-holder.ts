import { InstanceEntitlements } from "../model/instance-entitlements";

// The instance's license. Swapped by the online license's background sync and by a plan refresh.
export class InstanceEntitlementsHolder {
  constructor(private current: InstanceEntitlements) {}

  get(): InstanceEntitlements {
    return this.current;
  }

  set(entitlements: InstanceEntitlements) {
    this.current = entitlements;
  }

  isCloud() {
    return this.current.isCloud();
  }
}
