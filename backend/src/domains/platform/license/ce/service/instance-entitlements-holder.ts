import { InstanceEntitlements } from "../model/instance-entitlements";

// The instance's license, set by start() and replaced by the background sync of an online license.
export class InstanceEntitlementsHolder {
  private current: InstanceEntitlements | null = null;

  get(): InstanceEntitlements {
    if (!this.current) throw new Error("The License domain was read before LicenseModule.start() resolved the license");
    return this.current;
  }

  set(entitlements: InstanceEntitlements) {
    this.current = entitlements;
  }

  isCloud() {
    return this.get().isCloud();
  }
}
