/* eslint-disable class-methods-use-this */
import { TEntitlementsResponse } from "../license-server-client/license-server-types";
import { InstanceEntitlements, InstanceType, TInstanceEntitlementsProps } from "../model/instance-entitlements";
import { Plan } from "../model/plan";
import { TLicenseHooks } from "../service/license-hooks";
import { FakeLicenseServerClient } from "./fake-license-server-client";

// The EE steps in memory. A cloud instance by default; plans come from the FakeLicenseServerClient it is
// given.
export class FakeLicenseHooks implements TLicenseHooks {
  instance: TInstanceEntitlementsProps = { ...InstanceEntitlements.cloud().toJSON(), instanceType: InstanceType.Cloud };

  online = false;

  offline = false;

  refreshFailure: Error | null = null;

  constructor(private readonly licenseServer: FakeLicenseServerClient) {}

  resolveInstanceEntitlements = async () => InstanceEntitlements.restore(this.instance);

  refreshInstanceEntitlements = async () => {
    if (!this.online) return null;
    if (this.refreshFailure) throw this.refreshFailure;
    return InstanceEntitlements.restore(this.instance);
  };

  hasOnlineLicense = () => this.online;

  planFromEntitlements = (entitlements: TEntitlementsResponse) =>
    Plan.restore(this.licenseServer.planFor(entitlements));

  fallbackPlan = (instance: InstanceEntitlements) => Plan.restore({ ...instance.plan().toJSON(), slug: null });

  isOffline = () => this.offline;
}
