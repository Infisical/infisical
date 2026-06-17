import jwt from "jsonwebtoken";

import {
  catalogResponseSchema,
  entitlementsResponseSchema,
  sessionResponseSchema,
  subscriptionResponseSchema,
  TCatalogResponse,
  TCreateCheckoutPayload,
  TCreatePortalPayload,
  TEntitlementsResponse,
  TLicenseClientBackend,
  TSessionResponse,
  TSubscriptionResponse
} from "./license-client-types";

const ENTITLEMENTS_PATH = "/v1/entitlements";
const PRODUCTS_PATH = "/v1/products";
const SUBSCRIPTION_PATH = "/v1/subscription";
const CHECKOUT_SESSION_PATH = "/v1/billing/checkout-session";
const PORTAL_SESSION_PATH = "/v1/billing/portal-session";

export type TLicenseServerAuth = {
  hmacSecret: string;
  issuer: string;
  audience: string;
};

// The license server validates a short-lived HS256 service JWT (iss/aud/exp/sub), not the raw secret.
// Mint a fresh token per request; signing is cheap and entitlement results are cached upstream.
const mintServiceToken = (auth: TLicenseServerAuth): string =>
  jwt.sign({}, auth.hmacSecret, {
    algorithm: "HS256",
    issuer: auth.issuer,
    audience: auth.audience,
    subject: "infisical-cloud",
    expiresIn: "2m"
  });

export const licenseServerBackend = (serverUrl: string, auth: TLicenseServerAuth): TLicenseClientBackend => ({
  fetchEntitlements: async (orgId: string): Promise<TEntitlementsResponse> => {
    const url = new URL(ENTITLEMENTS_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${mintServiceToken(auth)}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return entitlementsResponseSchema.parse(body);
  },

  fetchCatalog: async (): Promise<TCatalogResponse> => {
    const url = new URL(PRODUCTS_PATH, serverUrl);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${mintServiceToken(auth)}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return catalogResponseSchema.parse(body);
  },

  // A brand-new org has no subscription; the server answers with a 404/500 or an empty status.
  // Any non-200 or empty payload is treated as "no subscription" so a new customer renders the
  // no-subscription state instead of an error.
  fetchSubscription: async (orgId: string): Promise<TSubscriptionResponse | null> => {
    const url = new URL(SUBSCRIPTION_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${mintServiceToken(auth)}` },
      redirect: "manual"
    });
    if (!res.ok) {
      return null;
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

  createCheckoutSession: async (orgId: string, payload: TCreateCheckoutPayload): Promise<TSessionResponse> => {
    const url = new URL(CHECKOUT_SESSION_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mintServiceToken(auth)}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return sessionResponseSchema.parse(body);
  },

  createPortalSession: async (orgId: string, payload: TCreatePortalPayload): Promise<TSessionResponse> => {
    const url = new URL(PORTAL_SESSION_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mintServiceToken(auth)}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return sessionResponseSchema.parse(body);
  }
});
