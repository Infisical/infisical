import { TEnvConfig } from "@app/lib/config/env";

import { Plan, TLicenseHooks, TLicenseServerClient } from "../ce/module";
import { LicenseServerClient } from "./license-server-client/license-server-client";
import { withCloudPlanDefaults } from "./service/cloud-plan-defaults";
import { cloudPlanFromEntitlements, getLicenseKeyConfig, LicenseResolver } from "./service/license-resolver";
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

// Reads the instance's license and talks to the License Server.
export class LicenseEeModule {
  readonly hooks: TLicenseHooks;

  readonly licenseServerClient: TLicenseServerClient;

  constructor({ envConfig }: TLicenseEeDeps) {
    const licenseKeyConfig = getLicenseKeyConfig(envConfig);
    // An offline (air-gapped) license must never reach the License Server.
    const isOffline = licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline;
    const licenseServerClient = LicenseServerClient.fromConfig({ envConfig, isOffline });
    const resolver = new LicenseResolver({ isCloud: envConfig.isCloud, licenseKeyConfig, licenseServerClient });

    this.licenseServerClient = licenseServerClient;
    this.hooks = {
      resolveInstanceEntitlements: () => resolver.resolveInstanceEntitlements(),
      refreshInstanceEntitlements: () => resolver.refreshInstanceEntitlements(),
      hasOnlineLicense: () => resolver.hasOnlineLicense(),
      planFromEntitlements: (entitlements) => cloudPlanFromEntitlements(entitlements),
      fallbackPlan: (instance) => Plan.restore(withCloudPlanDefaults(instance.features, null)),
      isOffline: () => isOffline
    };
  }
}
