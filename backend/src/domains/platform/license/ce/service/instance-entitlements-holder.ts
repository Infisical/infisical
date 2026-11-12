import { InstanceEntitlements } from "../model/instance-entitlements";

// Swapped in place by the online license sync and by plan refresh.
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
