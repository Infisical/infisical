import crypto from "node:crypto";

import { decode } from "jsonwebtoken";
import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AuthMethod, AuthTokenType, ProviderAuthResult } from "@app/services/auth/auth-type";

import { TTestSmtpService } from "../../mocks/smtp";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;
const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getServices = () => (globalThis as any).testServices;

const findEmailTo = (recipient: string) =>
  smtp()
    .getEmails()
    .find((e) => e.recipients?.includes(recipient));

// Drives the OAuth login the way each passport strategy does, varying only the provider's
// email-verification signal. authMethod defaults to Google; pass GITHUB/GITLAB to assert the
// per-provider flag is set.
const oauthLogin = (opts: { email: string; isEmailVerifiedByProvider: boolean; authMethod?: AuthMethod }) =>
  getServices().login.oauth2Login({
    email: opts.email,
    firstName: "OAuth",
    lastName: "Test",
    authMethod: opts.authMethod ?? AuthMethod.GOOGLE,
    providerUserId: `oauth-${crypto.randomUUID()}`,
    isEmailVerifiedByProvider: opts.isEmailVerifiedByProvider,
    ip: "127.0.0.1",
    userAgent: "test-agent"
  });

const completeAccount = (signupToken: string, code: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v3/signup/complete-account",
    headers: { authorization: `Bearer ${signupToken}` },
    body: { type: "alias", code }
  });

describe("Auth OAuth Signup V3 (provider-attested email verification)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    const db = getDb();
    if (createdUserIds.length > 0) {
      await db(TableName.UserAliases).whereIn("userId", createdUserIds).del();
      await db(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
      await db(TableName.Users).whereIn("id", createdUserIds).where("id", "!=", seedData1.id).del();
    }
  });

  beforeEach(() => {
    smtp().clear();
  });

  describe("provider did NOT verify the email -> our verification is still required", () => {
    test("new user gets SIGNUP_REQUIRED, an unverified token, and a verification email", async () => {
      const email = `oauth-unverified-${crypto.randomUUID()}@localhost.local`;

      const result = await oauthLogin({ email, isEmailVerifiedByProvider: false });

      expect(result.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
      expect(result.signupToken).toBeDefined();
      createdUserIds.push(result.user.id);

      const decoded = decode(result.signupToken) as Record<string, unknown>;
      expect(decoded.authTokenType).toBe(AuthTokenType.SIGNUP_TOKEN);
      expect(decoded.isEmailVerified).toBe(false);

      // a verification code email must have been sent
      const verificationEmail = findEmailTo(email);
      expect(verificationEmail).toBeDefined();
      expect((verificationEmail?.substitutions as Record<string, string>)?.code).toBeDefined();

      // and the user is persisted as unverified
      const user = await getDb()(TableName.Users).where({ id: result.user.id }).first();
      expect(user?.isEmailVerified).toBe(false);
      expect(user?.isGoogleVerified ?? false).toBe(false);
    });

    test("completion rejects a wrong code and accepts the emailed code", async () => {
      const email = `oauth-code-${crypto.randomUUID()}@localhost.local`;
      const result = await oauthLogin({ email, isEmailVerifiedByProvider: false });
      createdUserIds.push(result.user.id);

      const code = (findEmailTo(email)?.substitutions as Record<string, string>)?.code;
      expect(code).toBeDefined();

      const wrong = await completeAccount(result.signupToken, "000000");
      expect(wrong.statusCode).toBeGreaterThanOrEqual(400);

      const ok = await completeAccount(result.signupToken, code);
      expect(ok.statusCode).toBe(200);

      const user = await getDb()(TableName.Users).where({ id: result.user.id }).first();
      expect(user?.isEmailVerified).toBe(true);
      expect(user?.isAccepted).toBe(true);
    });
  });

  describe("provider verified the email -> our verification is skipped", () => {
    test("new user gets a verified token, no verification email, and a verified user record", async () => {
      const email = `oauth-verified-${crypto.randomUUID()}@localhost.local`;

      const result = await oauthLogin({ email, isEmailVerifiedByProvider: true });

      expect(result.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
      createdUserIds.push(result.user.id);

      const decoded = decode(result.signupToken) as Record<string, unknown>;
      expect(decoded.isEmailVerified).toBe(true);

      // no verification email should have been sent
      expect(findEmailTo(email)).toBeUndefined();

      const user = await getDb()(TableName.Users).where({ id: result.user.id }).first();
      expect(user?.isEmailVerified).toBe(true);
      expect(user?.isGoogleVerified).toBe(true);
    });

    test("completion succeeds with no code (validation skipped) and accepts the account", async () => {
      const email = `oauth-verified-complete-${crypto.randomUUID()}@localhost.local`;
      const result = await oauthLogin({ email, isEmailVerifiedByProvider: true });
      createdUserIds.push(result.user.id);

      const res = await completeAccount(result.signupToken, "");
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty("token");

      const user = await getDb()(TableName.Users).where({ id: result.user.id }).first();
      expect(user?.isAccepted).toBe(true);
      expect(user?.isEmailVerified).toBe(true);
    });

    test("GitHub sets the GitHub-specific verified flag", async () => {
      const email = `oauth-github-${crypto.randomUUID()}@localhost.local`;
      const result = await oauthLogin({ email, isEmailVerifiedByProvider: true, authMethod: AuthMethod.GITHUB });
      createdUserIds.push(result.user.id);

      expect(findEmailTo(email)).toBeUndefined();
      const user = await getDb()(TableName.Users).where({ id: result.user.id }).first();
      expect(user?.isGitHubVerified).toBe(true);
    });
  });
});
