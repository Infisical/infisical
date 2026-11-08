import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TEnvConfig } from "@app/lib/config/env";

import { LicenseType, TLicenseHooks } from "../ce/module";
import { withCloudPlanDefaults } from "./model/cloud-plan-defaults";
import { getLicenseKeyConfig, LicenseResolver } from "./service/license-resolver";
import { licenseServerClientFactory } from "./service/license-server/license-server-client";
import { buildUsageReporter } from "./service/usage-reporter";

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
  keyStore: TDomainKeyStore;
};

// Reads the instance's license and talks to the License Server.
export class LicenseEeModule {
  readonly hooks: TLicenseHooks;

  constructor({ envConfig, keyStore }: TLicenseEeDeps) {
    const licenseKeyConfig = getLicenseKeyConfig(envConfig);
    // An offline (air-gapped) license must never reach the License Server.
    const isOffline = licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline;
    const licenseServerClient = licenseServerClientFactory({ envConfig, keyStore, isOffline });
    const resolver = new LicenseResolver({ isCloud: envConfig.isCloud, licenseKeyConfig, licenseServerClient });
    const usageReporter = isOffline ? null : buildUsageReporter(envConfig);

    this.hooks = {
      resolveInstanceEntitlements: () => resolver.resolveInstanceEntitlements(),
      refreshInstanceEntitlements: () => resolver.refreshInstanceEntitlements(),
      hasOnlineLicense: () => resolver.hasOnlineLicense(),
      fetchPlan: (rootOrg) => resolver.fetchPlan(rootOrg),
      fallbackPlan: (features) => withCloudPlanDefaults(features, null),
      cancelSubscription: async (orgId) => {
        await licenseServerClient.cancelSubscription(orgId);
      },
      isMeteringEnabled: () => licenseServerClient.isEnabled(),
      usageReporter,
      isOffline: () => isOffline,
      billing: licenseServerClient
    };
  }
}
