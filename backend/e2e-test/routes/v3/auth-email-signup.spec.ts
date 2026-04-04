import { decode } from "jsonwebtoken";

import { AuthTokenType } from "@app/services/auth/auth-type";

import { TTestSmtpService } from "../../mocks/smtp";

const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;

describe("Auth Email Signup V3", () => {
  const testEmail = "signuptest@localhost.local";

  beforeEach(() => {
    smtp().clear();
  });

  test("Begin email signup sends verification code", async () => {
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
      url: "/api/v3/signup/complete-account/signup",
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
      url: "/api/v3/signup/complete-account/signup",
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
});
