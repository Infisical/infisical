import { createHmac } from "node:crypto";

import { decode } from "jsonwebtoken";
import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { normalizeEmail } from "@app/lib/validator";
import { AuthTokenType } from "@app/services/auth/auth-type";
import { EmailDispatchPurpose } from "@app/services/auth/email-dispatch-guard";

import { TTestSmtpService } from "../../mocks/smtp";
import { cleanupEmailDomains, seedVerifiedEmailDomain } from "../../testUtils/email-domains";

const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;
const keyStore = () => (globalThis as unknown as { testKeyStore: TKeyStoreFactory }).testKeyStore;
const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const mailboxHashOf = (email: string) =>
  createHmac("sha256", process.env.AUTH_SECRET as string)
    .update(normalizeEmail(email))
    .digest("hex");

const cooldownKeyOf = (email: string) =>
  KeyStorePrefixes.EmailDispatchCooldown(EmailDispatchPurpose.Signup, mailboxHashOf(email));
const sendsKeyOf = (email: string) =>
  KeyStorePrefixes.EmailDispatchMailboxSends(EmailDispatchPurpose.Signup, mailboxHashOf(email));

const beginSignup = (email: string) =>
  testServer.inject({ method: "POST", url: "/api/v3/signup/email/signup", body: { email } });

// Steps past the 60s wait without sleeping. The send allowance under test is left untouched.
const skipCooldown = async (email: string) => {
  await keyStore().deleteItem(cooldownKeyOf(email));
};

const codesSentTo = (email: string) =>
  smtp()
    .getEmails()
    .filter((e) => e.recipients?.includes(email)).length;

describe("Auth Email Signup V3", () => {
  beforeEach(() => {
    smtp().clear();
  });

  test("Begin email signup sends verification code", async () => {
    const testEmail = "signuptest-begin@localhost.local";
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email: testEmail }
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.message).toContain(testEmail);

    // Verify email was sent via SMTP mock
    const lastEmail = smtp().getLastEmail();
    expect(lastEmail).toBeDefined();
    expect(lastEmail?.recipients).toContain(testEmail);
  });

  test("Verify email signup with correct code returns signup token", async () => {
    const testEmail = "signuptest-verify@localhost.local";

    // Step 1: Begin signup
    await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email: testEmail }
    });

    // Extract code from SMTP mock
    const lastEmail = smtp().getLastEmail();
    const code = (lastEmail?.substitutions as Record<string, string>)?.code;
    expect(code).toBeDefined();

    // Step 2: Verify
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/verify",
      body: { email: testEmail, code }
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload).toHaveProperty("token");
    expect(payload).toHaveProperty("user");

    // Token should be a signup token
    const decoded = decode(payload.token) as Record<string, unknown>;
    expect(decoded.authTokenType).toBe(AuthTokenType.SIGNUP_TOKEN);
  });

  test("Verify email signup with wrong code fails", async () => {
    const testEmail = "signuptest-wrongcode@localhost.local";

    // Begin signup first
    await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email: testEmail }
    });

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/verify",
      body: { email: testEmail, code: "000000" }
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      statusCode: 401,
      message: "Invalid token",
      error: "InvalidToken"
    });
    expect(res.json()).not.toHaveProperty("details");

    const missingChallenge = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/verify",
      body: { email: "signup-missing-challenge@localhost.local", code: "000000" }
    });
    expect(missingChallenge.statusCode).toBe(401);
    expect(missingChallenge.json()).toMatchObject({
      statusCode: 401,
      message: "Invalid token",
      error: "InvalidToken"
    });
    expect(missingChallenge.json()).not.toHaveProperty("details");
  });

  test("Complete account with valid signup token creates user", async () => {
    const newEmail = "completesignup@localhost.local";

    // Step 1: Begin signup
    await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email: newEmail }
    });

    const signupEmail = smtp().getLastEmail();
    const code = (signupEmail?.substitutions as Record<string, string>)?.code;

    // Step 2: Verify email
    const verifyRes = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/verify",
      body: { email: newEmail, code }
    });
    const { token: signupToken } = verifyRes.json();

    // Step 3: Complete account
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/complete-account",
      headers: {
        authorization: `Bearer ${signupToken}`
      },
      body: {
        type: "email",
        email: newEmail,
        firstName: "Test",
        lastName: "Signup",
        password: "testPassword123!",
        organizationName: "Test Org"
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload).toHaveProperty("token");
    expect(payload).toHaveProperty("user");
    expect(payload.user.username).toBe(newEmail);
  });

  test("Complete account without signup token fails", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/complete-account",
      body: {
        type: "email",
        email: "notoken@localhost.local",
        firstName: "No",
        lastName: "Token",
        password: "testPassword123!"
      }
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("Begin signup response includes cooldownSeconds", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email: "cooldown-check@localhost.local" }
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(typeof payload.cooldownSeconds).toBe("number");
    expect(payload.cooldownSeconds).toBeGreaterThan(0);
  });

  test("Second signup request within cooldown period returns 400", async () => {
    const email = "cooldown-twice@localhost.local";

    const first = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email }
    });
    expect(first.statusCode).toBe(200);

    const second = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email }
    });
    expect(second.statusCode).toBe(400);
  });

  test("Second signup request for accepted account also returns 400 (no enumeration oracle)", async () => {
    const email = "cooldown-accepted@localhost.local";

    // Step 1: full signup flow to create an accepted user
    await testServer.inject({ method: "POST", url: "/api/v3/signup/email/signup", body: { email } });
    const signupEmail = smtp().getLastEmail();
    const code = (signupEmail?.substitutions as Record<string, string>)?.code;

    const verifyRes = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/verify",
      body: { email, code }
    });
    const { token: signupToken } = verifyRes.json();

    await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/complete-account",
      headers: { authorization: `Bearer ${signupToken}` },
      body: {
        type: "email",
        email,
        firstName: "Cool",
        lastName: "Down",
        password: "testPassword123!",
        organizationName: "Cooldown Org"
      }
    });

    smtp().clear();

    // Step 2: first re-signup request for the now-accepted account — should succeed (informational email)
    const first = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email }
    });
    expect(first.statusCode).toBe(200);

    // Step 3: wrong-code verification must match the response for a new-account challenge
    const verifyAttempt = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/verify",
      body: { email, code: "000000" }
    });
    expect(verifyAttempt.statusCode).toBe(401);
    expect(verifyAttempt.json()).not.toHaveProperty("details");

    // Step 4: second request within cooldown — must return 400 for both paths to be indistinguishable
    const second = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email }
    });
    expect(second.statusCode).toBe(400);
  });

  test("Exhausting all OTP tries prevents verification even with the correct code", async () => {
    const email = "exhausted-tries@localhost.local";

    await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/signup",
      body: { email }
    });

    const lastEmail = smtp().getLastEmail();
    const correctCode = (lastEmail?.substitutions as Record<string, string>)?.code;
    expect(correctCode).toBeDefined();

    // Exhaust all 3 tries with a wrong code
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const attempt = await testServer.inject({
        method: "POST",
        url: "/api/v3/signup/email/verify",
        body: { email, code: "000000" }
      });
      expect(attempt.statusCode).toBe(401);
      expect(attempt.json()).not.toHaveProperty("details");
    }

    // Correct code should now also fail because the record was deleted
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/verify",
      body: { email, code: correctCode }
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("Auth Email Signup V3 - dispatch caps", () => {
  const MAILBOX_ALLOWANCE = 5;
  const touched: string[] = [];

  const track = (email: string) => {
    touched.push(email);
    return email;
  };

  beforeEach(() => {
    smtp().clear();
  });

  afterEach(async () => {
    for (const email of touched) {
      // eslint-disable-next-line no-await-in-loop
      await keyStore().deleteItemsByKeyIn([cooldownKeyOf(email), sendsKeyOf(email)]);
    }
    touched.length = 0;
  });

  test("A mailbox stops receiving codes once its allowance is spent", async () => {
    const email = track("cap-exhausted@localhost.local");

    for (let i = 0; i < MAILBOX_ALLOWANCE + 1; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await skipCooldown(email);
      // eslint-disable-next-line no-await-in-loop
      const res = await beginSignup(email);
      expect(res.statusCode).toBe(200);
    }

    expect(codesSentTo(email)).toBe(MAILBOX_ALLOWANCE);
  });

  test("Alias variants of one mailbox share a single allowance", async () => {
    const canonical = track("capalias@gmail.com");
    const variants = [
      "capalias@gmail.com",
      "c.a.p.alias@gmail.com",
      "capalias+8bc4e8@gmail.com",
      "CAPALIAS@GMAIL.COM",
      "c.apalias+zz@googlemail.com",
      "cap.alias+another@gmail.com"
    ];

    for (const variant of variants) {
      // eslint-disable-next-line no-await-in-loop
      await skipCooldown(variant);
      // eslint-disable-next-line no-await-in-loop
      await beginSignup(variant);
    }

    const delivered = smtp()
      .getEmails()
      .filter((e) => e.recipients?.some((r) => normalizeEmail(r) === normalizeEmail(canonical))).length;
    expect(delivered).toBe(MAILBOX_ALLOWANCE);
    expect(await keyStore().getItem(sendsKeyOf(canonical))).toBe(String(MAILBOX_ALLOWANCE));
  });

  test("A refused request does not extend the window", async () => {
    const email = track("cap-window@localhost.local");

    for (let i = 0; i < MAILBOX_ALLOWANCE; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await skipCooldown(email);
      // eslint-disable-next-line no-await-in-loop
      await beginSignup(email);
    }

    await keyStore().setExpiry(sendsKeyOf(email), 100);
    await skipCooldown(email);
    await beginSignup(email);

    const ttl = await keyStore().ttl(sendsKeyOf(email));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(100);
  });

  test("A request refused for an SSO-enforced domain leaves no cooldown", async () => {
    const db = getDb();
    const orgId = seedData1.organization.id;
    const domain = "cap-ordering-sso.local";
    const email = track(`blocked@${domain}`);

    await seedVerifiedEmailDomain(orgId, domain, db);
    await db(TableName.Organization).where({ id: orgId }).update({ authEnforced: true });

    try {
      const refused = await beginSignup(email);
      expect(refused.statusCode).toBe(400);
      expect(await keyStore().getItem(cooldownKeyOf(email))).toBeNull();
    } finally {
      await db(TableName.Organization).where({ id: orgId }).update({ authEnforced: false });
      await cleanupEmailDomains(orgId, db);
    }

    smtp().clear();
    const owner = await beginSignup(email);
    expect(owner.statusCode).toBe(200);
    expect(codesSentTo(email)).toBe(1);
  });

  test("Verifying a code clears the mailbox throttle", async () => {
    const email = track("cap-cleared@localhost.local");

    await beginSignup(email);
    const code = (smtp().getLastEmail()?.substitutions as Record<string, string>)?.code;
    expect(code).toBeDefined();

    await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/verify",
      body: { email, code }
    });

    expect(await keyStore().getItem(sendsKeyOf(email))).toBeNull();
    expect(await keyStore().getItem(cooldownKeyOf(email))).toBeNull();
  });
});
