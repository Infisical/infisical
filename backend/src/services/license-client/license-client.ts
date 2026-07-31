import { TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { featureReaderFactory } from "./feature-reader";
import { licenseServerBackend, licenseServerSelfHostedBackend } from "./license-client-backends";
import { entitlementResolverFactory } from "./license-client-cache";
import {
  TBuyProductPayload,
  TCancelTrialPayload,
  TChangeCommitmentsPayload,
  TCreatePortalPayload,
  TEntitlementOrg,
  TLicenseClientBackend,
  TStartTrialPayload,
  TSubscriptionPreviewPayload
} from "./license-client-types";
import { createSelfHostedTokenProvider } from "./license-token-provider";

type TLicenseClientFactoryDep = {
  envConfig: Pick<
    TEnvConfig,
    | "LICENSE_SERVER_V2_MODE"
    | "LICENSE_SERVER_V2_URL"
    | "LICENSE_SERVER_V2_SERVICE_KEY"
    | "LICENSE_SERVER_URL"
    | "LICENSE_KEY"
    | "INTERNAL_REGION"
  >;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
};

export type TLicenseClientFactory = ReturnType<typeof licenseClientFactory>;

// Returns null (SDK dormant -> getFeature serves fallbacks) unless the kill switch is on and either a
// self-hosted license key or the cloud service key (plus server URL) is configured.
const buildBackend = (envConfig: TLicenseClientFactoryDep["envConfig"]): TLicenseClientBackend | null => {
  const licenseKey = envConfig.LICENSE_KEY;
  if (licenseKey) {
    if (!envConfig.LICENSE_SERVER_URL) {
      logger.warn(
        "license-client: self-hosted key set but LICENSE_SERVER_URL (token endpoint) is missing; serving feature fallbacks"
      );
      return null;
    }
    const tokenProvider = createSelfHostedTokenProvider(licenseKey, { serverUrl: envConfig.LICENSE_SERVER_URL });
    return licenseServerSelfHostedBackend(envConfig.LICENSE_SERVER_URL, tokenProvider, envConfig.INTERNAL_REGION);
  }

  // Self-hosted sets only LICENSE_SERVER_URL (that one host now serves both the token endpoint and the
  // v2 API after the DNS switch); cloud sets LICENSE_SERVER_V2_URL. Accept either as the v2 API base.
  const serverUrl = envConfig.LICENSE_SERVER_V2_URL || envConfig.LICENSE_SERVER_URL;
  if (!serverUrl) {
    logger.warn(
      "license-client: enabled but neither LICENSE_SERVER_V2_URL nor LICENSE_SERVER_URL is set; serving feature fallbacks"
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

  // Flag the org's license caches for stale-while-revalidate after a billing mutation instead of a hard
  // bust, so reads keep serving cached data while a background refresh converges once Stripe reconciles.
  const markEntitlementsStale = async (orgId: string, opts?: { checkout?: boolean }) => {
    if (!resolver) {
      return;
    }
    await resolver.markPassThrough(orgId, opts);
  };

  // Drop the local plan cache so the next read reflects a change immediately. The license server no
  // longer caches entitlements (reads are always live), so there's nothing to ask it to recompute.
  // No-op when the backend is dormant.
  const refreshEntitlements = async (org: TEntitlementOrg) => {
    if (!backend) {
      return;
    }
    await invalidateEntitlements(org.id);
  };

  const getCatalog = async (orgId: string) => {
    if (!backend) {
      return null;
    }
    return backend.fetchCatalog(orgId);
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

  const buyProduct = async (orgId: string, payload: TBuyProductPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.buyProduct(orgId, payload);
  };

  const removeProduct = async (orgId: string, productId: string) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.removeProduct(orgId, productId);
  };

  const changeCommitments = async (orgId: string, payload: TChangeCommitmentsPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.changeCommitments(orgId, payload);
  };

  const startTrial = async (orgId: string, payload: TStartTrialPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.startTrial(orgId, payload);
  };

  const cancelTrial = async (orgId: string, payload: TCancelTrialPayload) => {
    if (!backend) {
      throw new Error("license client backend is not configured");
    }
    return backend.cancelTrial(orgId, payload);
  };

  // The org's trial history; returns an empty history when no backend is configured (self-hosted).
  const getTrials = async (orgId: string) => {
    if (!backend) {
      return { trials: [] };
    }
    return backend.fetchTrials(orgId);
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
    markEntitlementsStale,
    refreshEntitlements,
    getCatalog,
    getSubscription,
    getCloudPlan,
    getBillingProfile,
    createPortal,
    previewSubscriptionChange,
    buyProduct,
    removeProduct,
    changeCommitments,
    startTrial,
    cancelTrial,
    getTrials,
    cancelSubscription,
    resumeSubscription
  };
};
