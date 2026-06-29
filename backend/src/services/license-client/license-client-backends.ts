import jwt from "jsonwebtoken";

import {
  billingProfileResponseSchema,
  catalogResponseSchema,
  checkoutResultSchema,
  cloudPlanResponseSchema,
  entitlementsResponseSchema,
  sessionResponseSchema,
  subscriptionPreviewResponseSchema,
  subscriptionResponseSchema,
  TAddSubscriptionItemsPayload,
  TBillingProfileResponse,
  TCatalogResponse,
  TCheckoutResult,
  TCloudPlanResponse,
  TCreateCheckoutPayload,
  TCreatePortalPayload,
  TEntitlementOrg,
  TEntitlementsResponse,
  TLicenseClientBackend,
  TSessionResponse,
  TSubscriptionPreview,
  TSubscriptionPreviewPayload,
  TSubscriptionResponse
} from "./license-client-types";

const ENTITLEMENTS_PATH = "/v1/entitlements";
const ENTITLEMENTS_REFRESH_PATH = "/v1/entitlements/refresh";
const PRODUCTS_PATH = "/v1/products";
const SUBSCRIPTION_PATH = "/v1/subscription";
const CLOUD_PLAN_PATH = "/v1/cloud-plan";
const BILLING_PROFILE_PATH = "/v1/billing/profile";
const CHECKOUT_SESSION_PATH = "/v1/billing/checkout-session";
const PORTAL_SESSION_PATH = "/v1/billing/portal-session";
const SUBSCRIPTION_PREVIEW_PATH = "/v1/billing/subscription/preview";
const SUBSCRIPTION_ITEMS_PATH = "/v1/billing/subscription/items";
const SUBSCRIPTION_CANCEL_PATH = "/v1/billing/subscription/cancel";
const SUBSCRIPTION_RESUME_PATH = "/v1/billing/subscription/resume";

// Issuer/audience/subject match the license server's in-code constants (it validates iss/aud against
// them). They are public claims, not per-deployment config, so they live here rather than in env.
const SERVICE_TOKEN_ISSUER = "infisical-cloud";
const SERVICE_TOKEN_AUDIENCE = "infisical-license-server";
const SERVICE_TOKEN_SUBJECT = "infisical-cloud";

// The license server validates a short-lived RS256 service JWT (iss/aud/exp/sub) that we sign with
// our private key and it verifies with the matching public key. Mint a fresh token per request.
const mintServiceToken = (signingKey: string): string =>
  jwt.sign({}, signingKey, {
    algorithm: "RS256",
    issuer: SERVICE_TOKEN_ISSUER,
    audience: SERVICE_TOKEN_AUDIENCE,
    subject: SERVICE_TOKEN_SUBJECT,
    expiresIn: "2m"
  });

export const licenseServerBackend = (
  serverUrl: string,
  signingKey: string,
  region?: string
): TLicenseClientBackend => ({
  fetchEntitlements: async (org: TEntitlementOrg): Promise<TEntitlementsResponse> => {
    const url = new URL(ENTITLEMENTS_PATH, serverUrl);
    url.searchParams.set("org_id", org.id);
    if (org.name) {
      url.searchParams.set("org_name", org.name);
    }
    if (org.slug) {
      url.searchParams.set("org_slug", org.slug);
    }
    if (region) {
      url.searchParams.set("region", region);
    }
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return entitlementsResponseSchema.parse(body);
  },

  refreshEntitlements: async (org: TEntitlementOrg): Promise<void> => {
    const url = new URL(ENTITLEMENTS_REFRESH_PATH, serverUrl);
    url.searchParams.set("org_id", org.id);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
  },

  fetchCatalog: async (): Promise<TCatalogResponse> => {
    const url = new URL(PRODUCTS_PATH, serverUrl);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return catalogResponseSchema.parse(body);
  },

  // A brand-new org has no license yet (404) or a license with no active subscription (200 with
  // status "none"); both are "no subscription". Other non-2xx statuses (auth failure, 5xx) are real
  // errors and must surface so a paying org isn't shown the free state during an outage.
  fetchSubscription: async (orgId: string): Promise<TSubscriptionResponse | null> => {
    const url = new URL(SUBSCRIPTION_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}` },
      redirect: "manual"
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }

    const body: unknown = await res.json();
    const parsed = subscriptionResponseSchema.safeParse(body);
    if (!parsed.success) {
      return null;
    }
    if (!parsed.data.status) {
      return null;
    }
    return parsed.data;
  },

  // 404 means the org has no license/plan yet; treat as "no plan" so the usage meter falls back to
  // unknown limits. Other non-2xx statuses are real errors and surface.
  fetchCloudPlan: async (orgId: string): Promise<TCloudPlanResponse | null> => {
    const url = new URL(CLOUD_PLAN_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}` },
      redirect: "manual"
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return cloudPlanResponseSchema.parse(body);
  },

  // The server returns 200 with everything empty when the org has no Stripe customer yet; a 404
  // means the org has no license at all (same as /v1/subscription), so degrade to "no profile".
  fetchBillingProfile: async (orgId: string): Promise<TBillingProfileResponse | null> => {
    const url = new URL(BILLING_PROFILE_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}` },
      redirect: "manual"
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return billingProfileResponseSchema.parse(body);
  },

  createCheckoutSession: async (orgId: string, payload: TCreateCheckoutPayload): Promise<TCheckoutResult> => {
    const url = new URL(CHECKOUT_SESSION_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return checkoutResultSchema.parse(body);
  },

  createPortalSession: async (orgId: string, payload: TCreatePortalPayload): Promise<TSessionResponse> => {
    const url = new URL(PORTAL_SESSION_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return sessionResponseSchema.parse(body);
  },

  previewSubscriptionChange: async (
    orgId: string,
    payload: TSubscriptionPreviewPayload
  ): Promise<TSubscriptionPreview> => {
    const url = new URL(SUBSCRIPTION_PREVIEW_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return subscriptionPreviewResponseSchema.parse(body);
  },

  addSubscriptionItems: async (orgId: string, payload: TAddSubscriptionItemsPayload): Promise<TCheckoutResult> => {
    const url = new URL(SUBSCRIPTION_ITEMS_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return checkoutResultSchema.parse(body);
  },

  removeSubscriptionItem: async (orgId: string, productId: string): Promise<TCheckoutResult> => {
    const url = new URL(`${SUBSCRIPTION_ITEMS_PATH}/${encodeURIComponent(productId)}`, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return checkoutResultSchema.parse(body);
  },

  cancelSubscription: async (orgId: string): Promise<TCheckoutResult> => {
    const url = new URL(SUBSCRIPTION_CANCEL_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return checkoutResultSchema.parse(body);
  },

  resumeSubscription: async (orgId: string): Promise<TCheckoutResult> => {
    const url = new URL(SUBSCRIPTION_RESUME_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mintServiceToken(signingKey)}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return checkoutResultSchema.parse(body);
  }
});

// Stripe-backed billing (checkout, portal, subscription mutations, cloud plan, billing profile) does
// not exist for self-hosted licenses; the license is managed out-of-band. These reject so a caller
// never silently no-ops.
const notSupportedOnSelfHosted = (operation: string) => (): Promise<never> =>
  Promise.reject(new Error(`license operation "${operation}" is not supported for self-hosted licenses`));

// Backend for a self-hosted License Server v2 license. Unlike the cloud backend it authenticates with
// the raw license key as a bearer token (not a minted RS256 service JWT) and is single-tenant: the key
// identifies the license, so entitlement/subscription reads carry no org_id. Only the read + usage +
// refresh endpoints the self-hosted contract exposes are implemented; everything billing-related throws.
export const licenseServerSelfHostedBackend = (
  serverUrl: string,
  licenseKey: string,
  region?: string
): TLicenseClientBackend => ({
  fetchEntitlements: async (): Promise<TEntitlementsResponse> => {
    const url = new URL(ENTITLEMENTS_PATH, serverUrl);
    if (region) {
      url.searchParams.set("region", region);
    }
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${licenseKey}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return entitlementsResponseSchema.parse(body);
  },

  refreshEntitlements: async (): Promise<void> => {
    const url = new URL(ENTITLEMENTS_REFRESH_PATH, serverUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${licenseKey}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
  },

  fetchCatalog: async (): Promise<TCatalogResponse> => {
    const url = new URL(PRODUCTS_PATH, serverUrl);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${licenseKey}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return catalogResponseSchema.parse(body);
  },

  // The license's subscription/contract view. A 404 (no contract yet) degrades to "no subscription".
  fetchSubscription: async (): Promise<TSubscriptionResponse | null> => {
    const url = new URL(SUBSCRIPTION_PATH, serverUrl);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${licenseKey}` },
      redirect: "manual"
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    const parsed = subscriptionResponseSchema.safeParse(body);
    if (!parsed.success || !parsed.data.status) {
      return null;
    }
    return parsed.data;
  },

  fetchCloudPlan: notSupportedOnSelfHosted("fetchCloudPlan"),
  fetchBillingProfile: notSupportedOnSelfHosted("fetchBillingProfile"),
  createCheckoutSession: notSupportedOnSelfHosted("createCheckoutSession"),
  createPortalSession: notSupportedOnSelfHosted("createPortalSession"),
  previewSubscriptionChange: notSupportedOnSelfHosted("previewSubscriptionChange"),
  addSubscriptionItems: notSupportedOnSelfHosted("addSubscriptionItems"),
  removeSubscriptionItem: notSupportedOnSelfHosted("removeSubscriptionItem"),
  cancelSubscription: notSupportedOnSelfHosted("cancelSubscription"),
  resumeSubscription: notSupportedOnSelfHosted("resumeSubscription")
});
