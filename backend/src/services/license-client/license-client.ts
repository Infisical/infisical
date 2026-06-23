import { TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { featureReaderFactory } from "./feature-reader";
import { licenseServerBackend } from "./license-client-backends";
import { entitlementResolverFactory } from "./license-client-cache";
import {
  TCreateCheckoutPayload,
  TCreatePortalPayload,
  TEntitlementOrg,
  TLicenseClientBackend
} from "./license-client-types";

type TLicenseClientFactoryDep = {
  envConfig: Pick<
    TEnvConfig,
    "LICENSE_SERVER_V2_MODE" | "LICENSE_SERVER_V2_URL" | "LICENSE_SERVER_V2_SERVICE_KEY" | "INTERNAL_REGION"
  >;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TLicenseClientFactory = ReturnType<typeof licenseClientFactory>;

// Returns null (SDK dormant -> getFeature serves fallbacks) unless the kill switch is on and the
// server URL + service key are configured.
const buildBackend = (envConfig: TLicenseClientFactoryDep["envConfig"]): TLicenseClientBackend | null => {
  if (envConfig.LICENSE_SERVER_V2_MODE === "off") {
    return null;
  }

  const serverUrl = envConfig.LICENSE_SERVER_V2_URL;
  const signingKey = envConfig.LICENSE_SERVER_V2_SERVICE_KEY;
  if (!serverUrl || !signingKey) {
    logger.warn(
      "license-client: enabled but LICENSE_SERVER_V2_URL / _SERVICE_KEY is missing; serving feature fallbacks"
    );
    return null;
  }

  // Guard against a misconfigured base URL pointing the authenticated client at a non-http target.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    logger.warn("license-client: LICENSE_SERVER_V2_URL is not a valid URL; serving feature fallbacks");
    return null;
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    logger.warn("license-client: LICENSE_SERVER_V2_URL must use http(s); serving feature fallbacks");
    return null;
  }

  // The signing key is a PEM private key; env vars often carry it with escaped newlines.
  return licenseServerBackend(serverUrl, signingKey.replace(/\\n/g, "\n"), envConfig.INTERNAL_REGION);
};

export const licenseClientFactory = ({ envConfig, keyStore }: TLicenseClientFactoryDep) => {
  const backend = buildBackend(envConfig);
  const resolver = backend ? entitlementResolverFactory({ keyStore, backend }) : null;

  const getEntitlements = async (org: TEntitlementOrg) => {
    if (!resolver) {
      return null;
    }
    return resolver.getEntitlements(org);
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

  const getCloudPlan = async (orgId: string) => {
    if (!backend) {
      return null;
    }
    return backend.fetchCloudPlan(orgId);
  };

  const getBillingProfile = async (orgId: string) => {
    if (!backend) {
      return null;
    }
    return backend.fetchBillingProfile(orgId);
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
    getCloudPlan,
    getBillingProfile,
    createCheckout,
    createPortal
  };
};
