import { TEnvConfig } from "@app/lib/config/env";

import { LicenseServerClient } from "./clients/license-server/client";
import { getLicenseKeyConfig, isOfflineLicenseKey } from "./services/license-policy/license-key";
import { LicensePolicyService } from "./services/license-policy/service";

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

export class LicenseEeModule {
  readonly licensePolicyService: LicensePolicyService;

  readonly licenseServerClient: LicenseServerClient;

  constructor({ envConfig }: TLicenseEeDeps) {
    const licenseKeyConfig = getLicenseKeyConfig(envConfig);
    this.licenseServerClient = LicenseServerClient.fromConfig({
      envConfig,
      isOffline: isOfflineLicenseKey(licenseKeyConfig)
    });
    this.licensePolicyService = new LicensePolicyService(envConfig.isCloud, licenseKeyConfig, this.licenseServerClient);
  }
}
