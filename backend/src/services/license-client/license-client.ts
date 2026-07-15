import { TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { featureReaderFactory } from "./feature-reader";
import { licenseServerBackend, licenseServerSelfHostedBackend } from "./license-client-backends";
import { entitlementResolverFactory } from "./license-client-cache";
import {
  TAddSubscriptionItemsPayload,
  TChangeCommitmentPayload,
  TCreateCheckoutPayload,
  TCreatePortalPayload,
  TEntitlementOrg,
  TLicenseClientBackend,
  TStartTrialPayload,
  TSubscriptionPreviewPayload
} from "./license-client-types";

type TLicenseClientFactoryDep = {
  envConfig: Pick<
    TEnvConfig,
    | "LICENSE_SERVER_V2_MODE"
    | "LICENSE_SERVER_V2_URL"
    | "LICENSE_SERVER_V2_SERVICE_KEY"
    | "LICENSE_KEY"
    | "INTERNAL_REGION"
  >;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
};

export type TLicenseClientFactory = ReturnType<typeof licenseClientFactory>;

// Mirrors SELF_HOSTED_V2_LICENSE_KEY_PREFIX in ee/license-fns; inlined to avoid a services -> ee
// runtime import cycle (license-client <- license-service <- license-fns).
const SELF_HOSTED_V2_LICENSE_KEY_PREFIX = "infisical_lk_";

// Returns null (SDK dormant -> getFeature serves fallbacks) unless the kill switch is on and either a
// self-hosted v2 license key or the cloud service key (plus server URL) is configured.
const buildBackend = (envConfig: TLicenseClientFactoryDep["envConfig"]): TLicenseClientBackend | null => {
  if (envConfig.LICENSE_SERVER_V2_MODE === "off") {
    return null;
  }

  const serverUrl = envConfig.LICENSE_SERVER_V2_URL;
  if (!serverUrl) {
    logger.warn("license-client: enabled but LICENSE_SERVER_V2_URL is missing; serving feature fallbacks");
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

  // A self-hosted v2 license authenticates with its own key as a bearer token; the cloud path mints an
  // RS256 service JWT from the service key instead.
  const licenseKey = envConfig.LICENSE_KEY;
  if (licenseKey?.startsWith(SELF_HOSTED_V2_LICENSE_KEY_PREFIX)) {
    return licenseServerSelfHostedBackend(serverUrl, licenseKey, envConfig.INTERNAL_REGION);
  }

  const signingKey = envConfig.LICENSE_SERVER_V2_SERVICE_KEY;
  if (!signingKey) {
    logger.warn("license-client: enabled but LICENSE_SERVER_V2_SERVICE_KEY is missing; serving feature fallbacks");
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

  const invalidateEntitlements = async (orgId: string) => {
    if (!resolver) {
      return;
    }
    await resolver.invalidateEntitlements(orgId);
  };

  // Ask the license server to recompute its cached entitlements (used after a license change), then
  // drop the local cache so the next read reflects them. No-op when the backend is dormant.
  const refreshEntitlements = async (org: TEntitlementOrg) => {
    if (!backend) {
      return;
    }
    await backend.refreshEntitlements(org);
    await invalidateEntitlements(org.id);
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

  const previewSubscriptionChange = async (orgId: string, payload: TSubscriptionPreviewPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.previewSubscriptionChange(orgId, payload);
  };

  const addSubscriptionItems = async (orgId: string, payload: TAddSubscriptionItemsPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.addSubscriptionItems(orgId, payload);
  };

  const removeSubscriptionItem = async (orgId: string, productId: string, prorationDate?: number) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.removeSubscriptionItem(orgId, productId, prorationDate);
  };

  const changeCommitment = async (orgId: string, payload: TChangeCommitmentPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.changeCommitment(orgId, payload);
  };

  const startTrial = async (orgId: string, payload: TStartTrialPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.startTrial(orgId, payload);
  };

  const cancelSubscription = async (orgId: string) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.cancelSubscription(orgId);
  };

  const resumeSubscription = async (orgId: string) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.resumeSubscription(orgId);
  };

  return {
    ...featureReaderFactory({ getEntitlements }),
    getEntitlements,
    invalidateEntitlements,
    refreshEntitlements,
    getCatalog,
    getSubscription,
    getCloudPlan,
    getBillingProfile,
    createCheckout,
    createPortal,
    previewSubscriptionChange,
    addSubscriptionItems,
    removeSubscriptionItem,
    changeCommitment,
    startTrial,
    cancelSubscription,
    resumeSubscription
  };
};
