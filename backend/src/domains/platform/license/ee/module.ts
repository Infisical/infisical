import { TEnvConfig } from "@app/lib/config/env";

import { TLicenseHooks } from "../ce/module";
import { LicenseServerClient } from "./license-server-client/license-server-client";
import { cloudFallbackPlan, getLicenseKeyConfig, LicenseResolver } from "./service/license-resolver";
import { LicenseType } from "./service/offline-license";

export type TLicenseEeDeps = {
  envConfig: Pick<
    TEnvConfig,
    | "LICENSE_KEY"
    | "LICENSE_KEY_OFFLINE"
    | "LICENSE_SERVER_V2_SERVICE_KEY"
    | "LICENSE_SERVER_URL"
    | "INTERNAL_REGION"
    | "isCloud"
  >;
};

// Licensing policy (the free tier, license keys, plans from entitlements) and the License Server, handed to
// the License domain as its hooks.
export class LicenseEeModule {
  readonly hooks: TLicenseHooks;

  constructor({ envConfig }: TLicenseEeDeps) {
    const licenseKeyConfig = getLicenseKeyConfig(envConfig);
    // An offline (air-gapped) license must never reach the License Server.
    const isOffline = licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline;
    const licenseServerClient = LicenseServerClient.fromConfig({ envConfig, isOffline });
    const resolver = new LicenseResolver({ isCloud: envConfig.isCloud, licenseKeyConfig, licenseServerClient });

    this.hooks = {
      resolveInstanceEntitlements: () => resolver.resolveInstanceEntitlements(),
      refreshInstanceEntitlements: () => resolver.refreshInstanceEntitlements(),
      hasOnlineLicense: () => resolver.hasOnlineLicense(),
      isOffline: () => isOffline,
      fetchPlan: (rootOrgId) => resolver.fetchPlan(rootOrgId),
      fallbackPlan: () => cloudFallbackPlan(),
      isMeteringEnabled: () => licenseServerClient.isEnabled(),
      canReportUsage: () => licenseServerClient.canReportUsage(),
      reportSnapshots: (orgId, snapshots) => licenseServerClient.reportSnapshots(orgId, snapshots),
      reportEvents: (orgId, events) => licenseServerClient.reportEvents(orgId, events),
      cancelSubscription: async (orgId) => {
        await licenseServerClient.cancelSubscription(orgId);
      },
      billing: licenseServerClient
    };
  }
}
