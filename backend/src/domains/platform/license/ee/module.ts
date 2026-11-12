import { TEnvConfig } from "@app/lib/config/env";

import { LicenseServerClient } from "./license-server-client/license-server-client";
import { getLicenseKeyConfig, isOfflineLicenseKey, LicenseResolver } from "./services/license-resolver/service";

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
  readonly resolver: LicenseResolver;

  readonly licenseServerClient: LicenseServerClient;

  constructor({ envConfig }: TLicenseEeDeps) {
    const licenseKeyConfig = getLicenseKeyConfig(envConfig);
    this.licenseServerClient = LicenseServerClient.fromConfig({
      envConfig,
      isOffline: isOfflineLicenseKey(licenseKeyConfig)
    });
    this.resolver = new LicenseResolver({
      isCloud: envConfig.isCloud,
      licenseKeyConfig,
      licenseServerClient: this.licenseServerClient
    });
  }
}
