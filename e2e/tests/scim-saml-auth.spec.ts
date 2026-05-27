import { expect, Page, request, test } from "@playwright/test";

import { GAMMA_BASE_URL } from "../helpers/constants";
import {
  gammaSamlAcsUrl,
  primeSamlIdentity,
  startIdpInitiatedLogin,
  startSamlLogin
} from "../helpers/idp-client";
import { createScimUser, deleteScimUser, ensureScimUserAbsent } from "../helpers/scim";

// SCIM userName (== externalId), SAML NameID, and UserAlias.externalId are
// all this same string by construction — the test owns it end-to-end.
// samlify uses `email` for the NameID and the SCIM provisioner sets
// externalId from userName, so the chain holds as long as we pass the
// same value as `email` to the IdP and `externalId`/`userName` to SCIM.
// Email domain must match the verified row the seed script created in
// email_domains for the e2e org. `.test` (RFC 2606) avoids any collision
// with real Infisical domain rows that might be claimed by other orgs.
const TEST_FIRST_NAME = "E2E";
const TEST_LAST_NAME = "ScimUser";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const makeExternalId = (): string => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${runId}@infisical-e2e.test`;
};

// Decodes a JWT payload without verifying the signature. The signature is
// gamma's; we trust it because we just received it from gamma over TLS.
const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const payload = token.split(".")[1];
  if (!payload) {
    throw new Error("token does not look like a JWT");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
};

// SCIM-provisioned users currently land at /signup/sso (not /login/select-organization)
// because gamma's SCIM service hardcodes user_aliases.isEmailVerified = false
// (scim-service.ts:506) and processProviderCallback (auth-login-service.ts:322)
// routes any !isEmailVerified through SIGNUP_REQUIRED. The signup token JWT is
// the strongest verifiable signal that the full SAML flow worked for the
// intended identity end-to-end — gamma trusted the IdP's signature, validated
// audience (and InResponseTo on the SP-initiated branch), extracted the
// attributes from the assertion, and reached the same user_alias SCIM created.
const expectSignupSsoRedirectFor = async (page: Page, email: string): Promise<void> => {
  await expect(page).toHaveURL(/\/signup\/sso\?token=/);

  const token = new URL(page.url()).searchParams.get("token");
  expect(token, "signup token must be present in the /signup/sso URL").toBeTruthy();

  const claims = decodeJwtPayload(token as string);
  expect(claims.authTokenType, "must be a provider-issued signup token").toBe("signupToken");
  expect(claims.authMethod, "auth method should reflect the configured SAML provider").toBe("keycloak-saml");
  expect(claims.email, "email in the token must match the IdP-emitted NameID").toBe(email);
  expect(claims.firstName).toBe(TEST_FIRST_NAME);
  expect(claims.lastName).toBe(TEST_LAST_NAME);
  expect(claims.userId, "gamma should reference a user row").toMatch(UUID_PATTERN);
  expect(claims.aliasId, "gamma should reference a user_alias row").toMatch(UUID_PATTERN);
  expect(claims.organizationId, "auth should be scoped to the e2e org").toMatch(UUID_PATTERN);
};

test.describe("SCIM provisioning + SAML login", () => {
  let orgMembershipId: string | null = null;
  let externalId: string | null = null;

  test.beforeEach(async () => {
    externalId = makeExternalId();
    orgMembershipId = null;
    const apiContext = await request.newContext({ baseURL: GAMMA_BASE_URL });
    await ensureScimUserAbsent(apiContext, externalId);
    await apiContext.dispose();
  });

  test.afterEach(async () => {
    if (!orgMembershipId) {
      return;
    }
    const apiContext = await request.newContext({ baseURL: GAMMA_BASE_URL });
    await deleteScimUser(apiContext, orgMembershipId);
    await apiContext.dispose();
  });

  // SP-initiated: browser starts at gamma, gamma 302s to the IdP with an
  // AuthnRequest. The IdP's /sso route signs an assertion bound to that
  // request and auto-POSTs SAMLResponse back to gamma's ACS.
  test("SP-initiated SAML login succeeds for a SCIM-provisioned user", async ({ page, request: apiRequest }) => {
    const created = await createScimUser(apiRequest, {
      externalId: externalId as string,
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME
    });
    orgMembershipId = created.id;

    expect(created.userName).toBe(externalId);
    expect(created.active).toBe(true);

    await primeSamlIdentity(page, {
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME
    });

    await startSamlLogin(page);
    await expectSignupSsoRedirectFor(page, externalId as string);
  });

  // IdP-initiated: browser starts at the Worker's /saml-idp/initiate, which
  // mints an *unsolicited* signed SAMLResponse (no InResponseTo per SAML 2.0
  // §3.4.1.5) and auto-POSTs it directly to gamma's ACS. Exercises gamma's
  // unsolicited-response branch that the SP-initiated path doesn't touch.
  test("IdP-initiated SAML login succeeds for a SCIM-provisioned user", async ({ page, request: apiRequest }) => {
    const created = await createScimUser(apiRequest, {
      externalId: externalId as string,
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME
    });
    orgMembershipId = created.id;

    expect(created.userName).toBe(externalId);
    expect(created.active).toBe(true);

    await primeSamlIdentity(page, {
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME,
      acsUrl: gammaSamlAcsUrl()
    });

    await startIdpInitiatedLogin(page);
    await expectSignupSsoRedirectFor(page, externalId as string);
  });
});
