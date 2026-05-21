import { expect, Page, request, test, type Response } from "@playwright/test";

import { GAMMA_BASE_URL } from "../helpers/constants";
import { primeSamlIdentity, startSamlLogin } from "../helpers/idp-client";
import { createScimUser, deleteScimUser, ensureScimUserAbsent } from "../helpers/scim";

// Each sub-test verifies one passport-saml strictness gate by having the mock
// IdP emit a deliberately-broken assertion and asserting gamma's ACS POST
// returns 4xx. The happy-path test (`scim-saml-auth.spec.ts`) covers the
// reverse direction — that the same assertion shape, sans break, succeeds.
//
// Gamma's saml-router translates passport-saml validation errors into
// `BadRequestError({ message: "Saml authentication failed. <reason>" })`
// (saml-router.ts:325) → fastify returns 400 JSON. A regression that
// silently disabled signature/audience/InResponseTo/Conditions checks would
// flip these to 302 redirects to /signup/sso or /login/select-organization.

const TEST_FIRST_NAME = "E2E";
const TEST_LAST_NAME = "RejectionTest";

const makeExternalId = (): string => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-rej-${runId}@infisical-e2e.test`;
};

const waitForAcsPostResponse = (page: Page): Promise<Response> =>
  page.waitForResponse(
    (response) => response.url().includes("/api/v1/sso/saml2/") && response.request().method() === "POST",
    { timeout: 20_000 }
  );

test.describe("SAML response rejection", () => {
  let orgMembershipId: string | null = null;
  let externalId: string | null = null;

  test.beforeEach(async () => {
    externalId = makeExternalId();
    const apiContext = await request.newContext({ baseURL: GAMMA_BASE_URL });
    await ensureScimUserAbsent(apiContext, externalId);
    await apiContext.dispose();
    orgMembershipId = null;
  });

  test.afterEach(async () => {
    if (!orgMembershipId) {
      return;
    }
    const apiContext = await request.newContext({ baseURL: GAMMA_BASE_URL });
    await deleteScimUser(apiContext, orgMembershipId);
    await apiContext.dispose();
  });

  test("audience mismatch is rejected", async ({ page, request: apiRequest }) => {
    const created = await createScimUser(apiRequest, {
      externalId: externalId as string,
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME
    });
    orgMembershipId = created.id;

    await primeSamlIdentity(page, {
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME,
      assertionOverrides: {
        audience: "https://wrong-audience.example.com"
      }
    });

    const acsResponse = waitForAcsPostResponse(page);
    await startSamlLogin(page);
    const response = await acsResponse;
    expect(response.status(), "gamma must reject when assertion audience != SITE_URL").toBe(400);
  });

  test("expired NotOnOrAfter is rejected", async ({ page, request: apiRequest }) => {
    const created = await createScimUser(apiRequest, {
      externalId: externalId as string,
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME
    });
    orgMembershipId = created.id;

    await primeSamlIdentity(page, {
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME,
      assertionOverrides: {
        // 10 minutes in the past — well outside passport-saml's clock-skew tolerance.
        notOnOrAfterOffsetSeconds: -600
      }
    });

    const acsResponse = waitForAcsPostResponse(page);
    await startSamlLogin(page);
    const response = await acsResponse;
    expect(response.status(), "gamma must reject when Conditions/@NotOnOrAfter is in the past").toBe(400);
  });

  test("InResponseTo mismatch is rejected", async ({ page, request: apiRequest }) => {
    const created = await createScimUser(apiRequest, {
      externalId: externalId as string,
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME
    });
    orgMembershipId = created.id;

    await primeSamlIdentity(page, {
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME,
      assertionOverrides: {
        inResponseTo: "_does-not-match-the-real-authn-request-id"
      }
    });

    const acsResponse = waitForAcsPostResponse(page);
    await startSamlLogin(page);
    const response = await acsResponse;
    expect(response.status(), "gamma must reject when InResponseTo doesn't echo the AuthnRequest ID").toBe(400);
  });
});
