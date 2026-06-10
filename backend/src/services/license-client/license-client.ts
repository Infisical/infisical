import { TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { featureReaderFactory } from "./feature-reader";
import { licenseServerBackend } from "./license-client-backends";
import { entitlementResolverFactory } from "./license-client-cache";
import { TLicenseClientBackend } from "./license-client-types";

type TLicenseClientFactoryDep = {
  envConfig: Pick<TEnvConfig, "LICENSE_SERVER_V2_ENABLED" | "LICENSE_SERVER_V2_URL" | "LICENSE_SERVER_V2_SERVICE_KEY">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TLicenseClientFactory = ReturnType<typeof licenseClientFactory>;

// Returns null (SDK dormant -> getFeature serves fallbacks) unless the kill switch is on and the
// server URL + service key are configured.
const buildBackend = (envConfig: TLicenseClientFactoryDep["envConfig"]): TLicenseClientBackend | null => {
  if (!envConfig.LICENSE_SERVER_V2_ENABLED) {
    return null;
  }

  const serverUrl = envConfig.LICENSE_SERVER_V2_URL;
  if (!serverUrl || !envConfig.LICENSE_SERVER_V2_SERVICE_KEY) {
    logger.warn(
      "license-client: enabled but LICENSE_SERVER_V2_URL / LICENSE_SERVER_V2_SERVICE_KEY is missing; serving feature fallbacks"
    );
    return null;
  }

  return licenseServerBackend(serverUrl, envConfig.LICENSE_SERVER_V2_SERVICE_KEY);
};

export const licenseClientFactory = ({ envConfig, keyStore }: TLicenseClientFactoryDep) => {
  const backend = buildBackend(envConfig);
  const resolver = backend ? entitlementResolverFactory({ keyStore, backend }) : null;

  const getEntitlements = async (orgId: string) => {
    if (!resolver) {
      return null;
    }
    return resolver.getEntitlements(orgId);
  };

  return featureReaderFactory({ getEntitlements });
};
