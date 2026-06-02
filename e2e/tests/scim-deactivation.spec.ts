import { expect, request, test, type Page, type Response } from "@playwright/test";

import { GAMMA_BASE_URL } from "../helpers/constants";
import { primeSamlIdentity, startSamlLogin } from "../helpers/idp-client";
import {
  createScimUser,
  deleteScimUser,
  ensureScimUserAbsent,
  setScimUserActive
} from "../helpers/scim";

const TEST_FIRST_NAME = "E2E";
const TEST_LAST_NAME = "DeactivationTest";

const makeExternalId = (): string => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-deact-${runId}@infisical-e2e.test`;
};

const waitForAcsPostResponse = (page: Page): Promise<Response> =>
  page.waitForResponse(
    (response) => response.url().includes("/api/v1/sso/saml2/") && response.request().method() === "POST",
    { timeout: 20_000 }
  );

test.describe("SCIM deactivation revokes SAML login", () => {
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

  test("SAML login is rejected after SCIM deactivation", async ({ page, request: apiRequest }) => {
    const created = await createScimUser(apiRequest, {
      externalId: externalId as string,
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME
    });
    orgMembershipId = created.id;
    expect(created.active).toBe(true);

    const deactivated = await setScimUserActive(apiRequest, orgMembershipId, false);
    expect(deactivated.active, "SCIM PATCH must persist active=false").toBe(false);

    await primeSamlIdentity(page, {
      email: externalId as string,
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME
    });

    const acsResponse = waitForAcsPostResponse(page);
    await startSamlLogin(page);
    const response = await acsResponse;
    // saml-router.ts:325 wraps any SAML strategy error in BadRequestError (400);
    // a deactivation-aware throw inside samlLogin would surface as 401/403
    // depending on where the check lands. Accept any 4xx so this test stays
    // valid regardless of which layer enforces the gate. The thing we're
    // guarding against is the 302-to-signup-or-login that means "accepted".
    expect(
      response.status(),
      "gamma must reject SAML login for users whose membership.isActive is false"
    ).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });
});
