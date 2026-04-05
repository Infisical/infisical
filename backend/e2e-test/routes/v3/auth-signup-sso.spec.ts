import crypto from "node:crypto";

import { decode } from "jsonwebtoken";
import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AuthTokenType, ProviderAuthResult } from "@app/services/auth/auth-type";

import { TTestSmtpService } from "../../mocks/smtp";
import { cleanupEmailDomains, seedVerifiedEmailDomain } from "../../testUtils/email-domains";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;
const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getServices = () => (globalThis as any).testServices;

const TEST_ORG_ID = seedData1.organization.id;
const TEST_DOMAIN = "sso-signup-test.local";

describe("Auth SSO Signup V3", () => {
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await seedVerifiedEmailDomain(TEST_ORG_ID, TEST_DOMAIN, getDb());
  });

  afterAll(async () => {
    const db = getDb();
    if (createdUserIds.length > 0) {
      await db(TableName.UserAliases).whereIn("userId", createdUserIds).del();
      await db(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
      await db(TableName.Users).whereIn("id", createdUserIds).where("id", "!=", seedData1.id).del();
    }
    await cleanupEmailDomains(TEST_ORG_ID, db);
  });

  beforeEach(() => {
    smtp().clear();
  });

  test("SAML login for new user returns SIGNUP_REQUIRED with signup token", async () => {
    const email = `sso-new-${crypto.randomUUID()}@${TEST_DOMAIN}`;

    const result = await getServices().saml.samlLogin({
      externalId: `sso-signup-${crypto.randomUUID()}`,
      email,
      firstName: "SSO",
      lastName: "Signup",
      authProvider: "okta-saml",
      orgId: TEST_ORG_ID,
      ip: "127.0.0.1",
      userAgent: "test-agent"
    });

    expect(result.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
    expect(result.signupToken).toBeDefined();
    createdUserIds.push(result.user.id);

    // Verify the signup token is a valid SIGNUP_TOKEN JWT
    const decoded = decode(result.signupToken) as Record<string, unknown>;
    expect(decoded.authTokenType).toBe(AuthTokenType.SIGNUP_TOKEN);
    expect(decoded.userId).toBe(result.user.id);
  });

  test("Email verification code is sent for new SSO user", async () => {
    const email = `sso-verify-${crypto.randomUUID()}@${TEST_DOMAIN}`;

    await getServices().saml.samlLogin({
      externalId: `sso-email-${crypto.randomUUID()}`,
      email,
      firstName: "SSO",
      lastName: "Verify",
      authProvider: "okta-saml",
      orgId: TEST_ORG_ID,
      ip: "127.0.0.1",
      userAgent: "test-agent"
    });

    // Check that a verification email was sent
    const emails = smtp().getEmails();
    const verificationEmail = emails.find((e) => e.recipients?.includes(email));
    expect(verificationEmail).toBeDefined();
    expect((verificationEmail?.substitutions as Record<string, string>)?.code).toBeDefined();
  });

  test("Complete SSO account with valid alias verification code succeeds", async () => {
    const email = `sso-complete-${crypto.randomUUID()}@${TEST_DOMAIN}`;

    const result = await getServices().saml.samlLogin({
      externalId: `sso-complete-${crypto.randomUUID()}`,
      email,
      firstName: "SSO",
      lastName: "Complete",
      authProvider: "okta-saml",
      orgId: TEST_ORG_ID,
      ip: "127.0.0.1",
      userAgent: "test-agent"
    });

    expect(result.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
    createdUserIds.push(result.user.id);

    // Extract verification code from email
    const emails = smtp().getEmails();
    const verificationEmail = emails.find((e) => e.recipients?.includes(email));
    const code = (verificationEmail?.substitutions as Record<string, string>)?.code;
    expect(code).toBeDefined();

    // Complete account with alias type
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/complete-account",
      headers: {
        authorization: `Bearer ${result.signupToken}`
      },
      body: {
        type: "alias",
        code
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload).toHaveProperty("token");
    expect(payload).toHaveProperty("user");

    // Verify user is now accepted
    const db = getDb();
    const user = await db(TableName.Users).where({ id: result.user.id }).first();
    expect(user?.isAccepted).toBe(true);
    expect(user?.isEmailVerified).toBe(true);
  });

  test("Complete SSO account with wrong code fails", async () => {
    const email = `sso-wrongcode-${crypto.randomUUID()}@${TEST_DOMAIN}`;

    const result = await getServices().saml.samlLogin({
      externalId: `sso-wrongcode-${crypto.randomUUID()}`,
      email,
      firstName: "SSO",
      lastName: "WrongCode",
      authProvider: "okta-saml",
      orgId: TEST_ORG_ID,
      ip: "127.0.0.1",
      userAgent: "test-agent"
    });

    createdUserIds.push(result.user.id);

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/complete-account",
      headers: {
        authorization: `Bearer ${result.signupToken}`
      },
      body: {
        type: "alias",
        code: "000000"
      }
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
