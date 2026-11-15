import { InstanceEntitlements } from "../models/instance-entitlements";
import { TInstanceEntitlementsCache } from "../services/dependencies";

// In memory, per process: every pod resolves the instance license at boot and refreshes its own copy.
export class InstanceEntitlementsCache implements TInstanceEntitlementsCache {
  constructor(private instanceEntitlements: InstanceEntitlements) {}

  get(): InstanceEntitlements {
    return this.instanceEntitlements;
  }

  set(instanceEntitlements: InstanceEntitlements): void {
    this.instanceEntitlements = instanceEntitlements;
  }
}
