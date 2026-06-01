import crypto from "node:crypto";

import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ProviderAuthResult } from "@app/services/auth/auth-type";

import { TTestSmtpService } from "../../mocks/smtp";
import { cleanupEmailDomains, seedVerifiedEmailDomain } from "../../testUtils/email-domains";
import { cleanupSamlConfig, seedSamlConfig } from "../../testUtils/saml-config";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;
const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getServices = () => (globalThis as any).testServices;

const TEST_ORG_ID = seedData1.organization.id;
const TEST_DOMAIN = "sso-enforced-test.local";

describe("Auth SSO Signup V3 (SSO enforced)", () => {
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await seedVerifiedEmailDomain(TEST_ORG_ID, TEST_DOMAIN, getDb());
    // samlLogin reads the org's SAML config, so seed one to keep this spec self-contained.
    await seedSamlConfig(TEST_ORG_ID, getDb(), { authProvider: "okta-saml" });
    // When SSO is enforced, the verified domain + IdP are authoritative.
    await getDb()(TableName.Organization).where({ id: TEST_ORG_ID }).update({ authEnforced: true });
  });

  afterAll(async () => {
    const db = getDb();
    // Restore the shared seed org so other specs see the default (non-enforced) state.
    await db(TableName.Organization).where({ id: TEST_ORG_ID }).update({ authEnforced: false });
    if (createdUserIds.length > 0) {
      await db(TableName.UserAliases).whereIn("userId", createdUserIds).del();
      await db(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
      await db(TableName.Users).whereIn("id", createdUserIds).where("id", "!=", seedData1.id).del();
    }
    await cleanupSamlConfig(TEST_ORG_ID, db);
    await cleanupEmailDomains(TEST_ORG_ID, db);
  });

  beforeEach(() => {
    smtp().clear();
  });

  test("SAML login for new user with SSO enforced returns a SESSION (no email verification)", async () => {
    const email = `sso-enforced-${crypto.randomUUID()}@${TEST_DOMAIN}`;

    const result = await getServices().saml.samlLogin({
      externalId: `sso-enforced-${crypto.randomUUID()}`,
      email,
      firstName: "SSO",
      lastName: "Enforced",
      authProvider: "okta-saml",
      orgId: TEST_ORG_ID,
      ip: "127.0.0.1",
      userAgent: "test-agent"
    });

    expect(result.result).toBe(ProviderAuthResult.SESSION);
    expect(result.tokens).toBeDefined();
    createdUserIds.push(result.userId);

    // No email-verification code should have been sent.
    const verificationEmail = smtp()
      .getEmails()
      .find((e) => e.recipients?.includes(email));
    expect(verificationEmail).toBeUndefined();

    // The new user is provisioned as accepted + email-verified directly.
    const user = await getDb()(TableName.Users).where({ id: result.userId }).first();
    expect(user?.isAccepted).toBe(true);
    expect(user?.isEmailVerified).toBe(true);
  });

  test("Email/password signup is blocked for a verified domain owned by an SSO-enforced org", async () => {
    const email = `pw-blocked-${crypto.randomUUID()}@${TEST_DOMAIN}`;

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email }
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    // No signup verification email should have been sent.
    const signupEmail = smtp()
      .getEmails()
      .find((e) => e.recipients?.includes(email));
    expect(signupEmail).toBeUndefined();
  });
});
