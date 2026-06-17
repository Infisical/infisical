import { TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { featureReaderFactory } from "./feature-reader";
import { licenseServerBackend } from "./license-client-backends";
import { entitlementResolverFactory } from "./license-client-cache";
import { TCreateCheckoutPayload, TCreatePortalPayload, TLicenseClientBackend } from "./license-client-types";

type TLicenseClientFactoryDep = {
  envConfig: Pick<
    TEnvConfig,
    | "LICENSE_SERVER_V2_ENABLED"
    | "LICENSE_SERVER_V2_URL"
    | "LICENSE_SERVER_V2_SERVICE_KEY"
    | "LICENSE_SERVER_V2_ISSUER"
    | "LICENSE_SERVER_V2_AUDIENCE"
  >;
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
  const hmacSecret = envConfig.LICENSE_SERVER_V2_SERVICE_KEY;
  const issuer = envConfig.LICENSE_SERVER_V2_ISSUER;
  const audience = envConfig.LICENSE_SERVER_V2_AUDIENCE;
  if (!serverUrl || !hmacSecret || !issuer || !audience) {
    logger.warn(
      "license-client: enabled but LICENSE_SERVER_V2_URL / _SERVICE_KEY / _ISSUER / _AUDIENCE is missing; serving feature fallbacks"
    );
    return null;
  }

  return licenseServerBackend(serverUrl, { hmacSecret, issuer, audience });
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

  const getCatalog = async () => {
    if (!backend) {
      return null;
    }
    return backend.fetchCatalog();
  };

  const getSubscription = async (orgId: string) => {
    if (!backend) {
      return null;
    }
    return backend.fetchSubscription(orgId);
  };

  const createCheckout = async (orgId: string, payload: TCreateCheckoutPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.createCheckoutSession(orgId, payload);
  };

  const createPortal = async (orgId: string, payload: TCreatePortalPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.createPortalSession(orgId, payload);
  };

  return {
    ...featureReaderFactory({ getEntitlements }),
    getEntitlements,
    getCatalog,
    getSubscription,
    createCheckout,
    createPortal
  };
};
