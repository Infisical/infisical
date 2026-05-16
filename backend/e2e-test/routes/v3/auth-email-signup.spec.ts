import { decode } from "jsonwebtoken";

import { AuthTokenType } from "@app/services/auth/auth-type";

import { TTestSmtpService } from "../../mocks/smtp";

const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;

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

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
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

    // Step 3: second request within cooldown — must return 400 for both paths to be indistinguishable
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
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop
      await testServer.inject({
        method: "POST",
        url: "/api/v3/signup/email/verify",
        body: { email, code: "000000" }
      });
    }

    // Correct code should now also fail because the record was deleted
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/signup/email/verify",
      body: { email, code: correctCode }
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
