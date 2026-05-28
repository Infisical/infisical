import type { BrowserContext, Page } from "@playwright/test";

import { E2E_ORG_SLUG, GAMMA_BASE_URL, IDP_BASE_URL, SAML_CONFIG_ID } from "./constants";
import { env } from "./env";

// samlify reads `email` for both the assertion's NameID and the templated
// `email` attribute — match the Worker-side IdpIdentity type so the test
// owns NameID by setting email to the same value as SCIM externalId.
type AssertionOverrides = {
  audience?: string;
  notOnOrAfterOffsetSeconds?: number;
  inResponseTo?: string;
};
type IdpIdentity = {
  email: string;
  firstName?: string;
  lastName?: string;
  // Required for the IdP-initiated flow (consumed by GET /saml-idp/initiate);
  // ignored by the SP-initiated /sso path. Worker validates against an
  // allowlist of gamma SAML ACS URLs before storing.
  acsUrl?: string;
  // SAML-rejection tests use these to emit deliberately-broken assertions
  // (wrong audience, expired NotOnOrAfter, mismatched InResponseTo) and assert
  // gamma rejects. Worker contract: `src/saml-idp/router.ts:identityBody`.
  assertionOverrides?: AssertionOverrides;
};

type IdentityResponse = {
  sessionId: string;
  cookieName: string;
  ttlSeconds: number;
};

// Stash an identity with the mock IdP and set the corresponding session cookie
// on the test browser context. After this returns, navigating the same `page`
// to gamma's SAML start URL will cause the IdP to emit an assertion for this
// identity (cookie travels along on the redirect from gamma -> IdP).
export const primeSamlIdentity = async (page: Page, identity: IdpIdentity): Promise<void> => {
  const response = await fetch(`${IDP_BASE_URL}/saml-idp/identity`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.idpAdminToken}`
    },
    body: JSON.stringify(identity)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to prime SAML identity (${response.status}): ${detail}`);
  }
  const body = (await response.json()) as IdentityResponse;
  await setIdpSessionCookie(page.context(), body);
};

const setIdpSessionCookie = async (ctx: BrowserContext, body: IdentityResponse): Promise<void> => {
  const url = new URL(IDP_BASE_URL);
  await ctx.addCookies([
    {
      name: body.cookieName,
      value: body.sessionId,
      domain: url.hostname,
      path: "/saml-idp",
      expires: Math.floor(Date.now() / 1000) + body.ttlSeconds,
      // sameSite=None + secure is required for the cookie to travel on the
      // cross-origin redirect from gamma to the Worker.
      sameSite: "None",
      secure: true,
      httpOnly: false
    }
  ]);
};

export const startSamlLogin = async (page: Page): Promise<void> => {
  await page.goto(`/api/v1/sso/redirect/saml2/organizations/${encodeURIComponent(E2E_ORG_SLUG)}`);
};

// ACS URL gamma exposes for the configured SAML provider. The IdP-initiated
// flow needs this baked into the SAMLResponse since there's no AuthnRequest
// to read it from. Mirrors `${appCfg.SITE_URL}/api/v1/sso/saml2/${configId}`
// in backend/src/ee/routes/v1/saml-router.ts:85.
export const gammaSamlAcsUrl = (): string =>
  `${GAMMA_BASE_URL}/api/v1/sso/saml2/${SAML_CONFIG_ID}`;

// Triggers the IdP-initiated flow. The page navigates to the Worker's
// /initiate endpoint, which serves an auto-submitting form POSTing a signed
// unsolicited SAMLResponse directly to gamma's ACS URL. `primeSamlIdentity`
// must be called first with `acsUrl: gammaSamlAcsUrl()` so the Worker knows
// where to deliver the response.
export const startIdpInitiatedLogin = async (page: Page): Promise<void> => {
  await page.goto(`${IDP_BASE_URL}/saml-idp/initiate`);
};
