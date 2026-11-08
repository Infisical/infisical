import { InstanceEntitlements } from "../model/instance-entitlements";

// The instance's license, read at boot and replaced by the background sync of an online license.
export class InstanceEntitlementsHolder {
  private current = InstanceEntitlements.community();

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
