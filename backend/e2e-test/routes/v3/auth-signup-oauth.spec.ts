import crypto from "node:crypto";

import { decode } from "jsonwebtoken";
import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AuthMethod, AuthTokenType, ProviderAuthResult } from "@app/services/auth/auth-type";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

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
// per-provider flag is set. Pin providerUserId to simulate repeat logins from the same
// provider account.
const oauthLogin = (opts: {
  email: string;
  isEmailVerifiedByProvider: boolean;
  authMethod?: AuthMethod;
  providerUserId?: string;
}) =>
  getServices().login.oauth2Login({
    email: opts.email,
    firstName: "OAuth",
    lastName: "Test",
    authMethod: opts.authMethod ?? AuthMethod.GOOGLE,
    providerUserId: opts.providerUserId ?? `oauth-${crypto.randomUUID()}`,
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

const findUser = (id: string) => getDb()(TableName.Users).where({ id }).first();
const findAlias = (userId: string) => getDb()(TableName.UserAliases).where({ userId }).first();

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
      expect(result.didCompleteSignup).toBe(false);
      createdUserIds.push(result.user.id);

      const decoded = decode(result.signupToken) as Record<string, unknown>;
      expect(decoded.authTokenType).toBe(AuthTokenType.SIGNUP_TOKEN);
      expect(decoded.isEmailVerified).toBe(false);
      expect(decoded.aliasId).toBeDefined();

      // a verification code email must have been sent
      const verificationEmail = findEmailTo(email);
      expect(verificationEmail).toBeDefined();
      expect((verificationEmail?.substitutions as Record<string, string>)?.code).toBeDefined();

      // and the user is persisted as unverified and not accepted
      const user = await findUser(result.user.id);
      expect(user?.isEmailVerified).toBe(false);
      expect(user?.isAccepted).toBe(false);
      expect(user?.isGoogleVerified ?? false).toBe(false);
    });

    test("completion rejects wrong and empty codes and accepts the emailed code", async () => {
      const email = `oauth-code-${crypto.randomUUID()}@localhost.local`;
      const result = await oauthLogin({ email, isEmailVerifiedByProvider: false });
      createdUserIds.push(result.user.id);

      const code = (findEmailTo(email)?.substitutions as Record<string, string>)?.code;
      expect(code).toBeDefined();

      const wrong = await completeAccount(result.signupToken, "000000");
      expect(wrong.statusCode).toBeGreaterThanOrEqual(400);

      // an empty code must never bypass verification
      const empty = await completeAccount(result.signupToken, "");
      expect(empty.statusCode).toBeGreaterThanOrEqual(400);

      const ok = await completeAccount(result.signupToken, code);
      expect(ok.statusCode).toBe(200);

      const user = await findUser(result.user.id);
      expect(user?.isEmailVerified).toBe(true);
      expect(user?.isAccepted).toBe(true);
    });

    test("repeat login after completion returns a session without a signup signal", async () => {
      const email = `oauth-repeat-${crypto.randomUUID()}@localhost.local`;
      const providerUserId = `oauth-${crypto.randomUUID()}`;

      const first = await oauthLogin({ email, isEmailVerifiedByProvider: false, providerUserId });
      createdUserIds.push(first.user.id);
      const code = (findEmailTo(email)?.substitutions as Record<string, string>)?.code;
      expect(code).toBeDefined();
      const completion = await completeAccount(first.signupToken, code);
      expect(completion.statusCode).toBe(200);

      const second = await oauthLogin({ email, isEmailVerifiedByProvider: false, providerUserId });
      expect(second.result).toBe(ProviderAuthResult.SESSION);
      expect(second.didCompleteSignup).toBe(false);
    });

    test("a brand-new alias must not inherit a user-level provider flag for a provider-unverified email", async () => {
      // The victim previously completed a verified GitHub login, so their per-account GitHub flag is
      // set. authMethods already includes GitHub, so this login takes the email-fallback backfill
      // path (a new alias for a different externalId) rather than the link path.
      const email = `oauth-flag-inherit-${crypto.randomUUID()}@localhost.local`;
      const [victim] = await getDb()(TableName.Users)
        .insert({
          username: email,
          email,
          isAccepted: true,
          isEmailVerified: true,
          isGhost: false,
          isGitHubVerified: true,
          authMethods: [AuthMethod.GITHUB]
        })
        .returning("*");
      createdUserIds.push(victim.id);

      // A different GitHub account lists the victim's email as UNVERIFIED.
      const attackerExternalId = `github-attacker-${crypto.randomUUID()}`;
      const result = await oauthLogin({
        email,
        isEmailVerifiedByProvider: false,
        authMethod: AuthMethod.GITHUB,
        providerUserId: attackerExternalId
      });

      // No session off the inherited flag: our own verification is still required.
      expect(result.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
      expect(result.signupToken).toBeDefined();
      expect(result.didCompleteSignup).toBe(false);

      // The verification code goes to the real inbox owner, who alone can complete it.
      expect(findEmailTo(email)).toBeDefined();

      // The backfilled alias for the new identity stays unverified.
      const attackerAlias = await getDb()(TableName.UserAliases)
        .where({ userId: victim.id, externalId: attackerExternalId })
        .first();
      expect(attackerAlias?.isEmailVerified).toBe(false);
    });

    test("an unverified alias cannot be flipped to verified to take over the attached account", async () => {
      // Two-step stale-alias takeover (the OAuth analogue of the SAML stale-alias guard):
      // 1) an attacker provider identity asserts the victim's email UNVERIFIED, backfilling an
      //    unverified alias onto the victim via the email fallback (no session is issued);
      // 2) the attacker switches their provider email to one they control and re-logs in VERIFIED.
      // The asserted email no longer matches the victim account, so the alias is stale and must not
      // be promoted: no session, and the victim's email/username are left untouched.
      const victimEmail = `oauth-victim-${crypto.randomUUID()}@localhost.local`;
      const attackerEmail = `oauth-attacker-${crypto.randomUUID()}@localhost.local`;
      const attackerExternalId = `github-attacker-${crypto.randomUUID()}`;

      const [victim] = await getDb()(TableName.Users)
        .insert({
          username: victimEmail,
          email: victimEmail,
          isAccepted: true,
          isEmailVerified: true,
          isGhost: false,
          authMethods: [AuthMethod.EMAIL]
        })
        .returning("*");
      createdUserIds.push(victim.id);

      // Step 1: seed an unverified alias on the victim by asserting their email unverified.
      const seed = await oauthLogin({
        email: victimEmail,
        isEmailVerifiedByProvider: false,
        authMethod: AuthMethod.GITHUB,
        providerUserId: attackerExternalId
      });
      expect(seed.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
      expect(seed.user.id).toBe(victim.id);

      const seededAlias = await getDb()(TableName.UserAliases)
        .where({ userId: victim.id, externalId: attackerExternalId })
        .first();
      expect(seededAlias?.isEmailVerified).toBe(false);

      smtp().clear();

      // Step 2: same provider identity, now asserting an attacker-controlled VERIFIED email.
      const takeover = await oauthLogin({
        email: attackerEmail,
        isEmailVerifiedByProvider: true,
        authMethod: AuthMethod.GITHUB,
        providerUserId: attackerExternalId
      });

      // No session: the stale alias is not promoted.
      expect(takeover.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
      expect(takeover.didCompleteSignup).toBe(false);

      // The victim account is untouched: the attacker could neither overwrite the email/username nor
      // scribble on the profile (names), link their auth method, or flip a verified flag.
      const victimAfter = await findUser(victim.id);
      expect(victimAfter?.username).toBe(victimEmail);
      expect(victimAfter?.email).toBe(victimEmail);
      expect(victimAfter?.authMethods).not.toContain(AuthMethod.GITHUB);
      expect(victimAfter?.authMethods).toEqual([AuthMethod.EMAIL]);
      expect(victimAfter?.firstName ?? null).toBeNull();
      expect(victimAfter?.lastName ?? null).toBeNull();
      expect(victimAfter?.isGitHubVerified ?? false).toBe(false);

      // The alias stays unverified and never adopts the attacker's email.
      const aliasAfter = await getDb()(TableName.UserAliases)
        .where({ userId: victim.id, externalId: attackerExternalId })
        .first();
      expect(aliasAfter?.isEmailVerified).toBe(false);
      expect(aliasAfter?.emails ?? []).not.toContain(attackerEmail);

      // The verification code went to the victim's real inbox, never to the attacker's address.
      expect(findEmailTo(attackerEmail)).toBeUndefined();
      expect(findEmailTo(victimEmail)).toBeDefined();
    });
  });

  describe("provider verified the email -> a session is issued directly, no completion step", () => {
    test("new user gets a session, a fully accepted account, and no verification email", async () => {
      const email = `oauth-verified-${crypto.randomUUID()}@localhost.local`;

      const result = await oauthLogin({ email, isEmailVerifiedByProvider: true });
      createdUserIds.push(result.user.id);

      expect(result.result).toBe(ProviderAuthResult.SESSION);
      expect(typeof result.tokens.access).toBe("string");
      expect(typeof result.tokens.refresh).toBe("string");
      expect(result.signupToken).toBeUndefined();
      expect(result.didCompleteSignup).toBe(true);

      const decodedAccess = decode(result.tokens.access) as Record<string, unknown>;
      expect(decodedAccess.authTokenType).toBe(AuthTokenType.ACCESS_TOKEN);

      // no verification email should have been sent
      expect(findEmailTo(email)).toBeUndefined();

      const user = await findUser(result.user.id);
      expect(user?.isAccepted).toBe(true);
      expect(user?.isEmailVerified).toBe(true);
      expect(user?.isGoogleVerified).toBe(true);

      const alias = await findAlias(result.user.id);
      expect(alias?.isEmailVerified).toBe(true);
    });

    test("repeat verified login returns a session without a duplicate signup signal", async () => {
      const email = `oauth-verified-repeat-${crypto.randomUUID()}@localhost.local`;
      const providerUserId = `oauth-${crypto.randomUUID()}`;

      const first = await oauthLogin({ email, isEmailVerifiedByProvider: true, providerUserId });
      createdUserIds.push(first.user.id);
      expect(first.didCompleteSignup).toBe(true);

      const second = await oauthLogin({ email, isEmailVerifiedByProvider: true, providerUserId });
      expect(second.result).toBe(ProviderAuthResult.SESSION);
      expect(second.didCompleteSignup).toBe(false);
    });

    test("GitHub sets the GitHub-specific verified flag", async () => {
      const email = `oauth-github-${crypto.randomUUID()}@localhost.local`;
      const result = await oauthLogin({ email, isEmailVerifiedByProvider: true, authMethod: AuthMethod.GITHUB });
      createdUserIds.push(result.user.id);

      expect(result.result).toBe(ProviderAuthResult.SESSION);
      expect(findEmailTo(email)).toBeUndefined();
      const user = await findUser(result.user.id);
      expect(user?.isGitHubVerified).toBe(true);
    });

    test("a verified login completes a previously abandoned unverified signup", async () => {
      const email = `oauth-resumed-${crypto.randomUUID()}@localhost.local`;
      const providerUserId = `oauth-${crypto.randomUUID()}`;

      const first = await oauthLogin({ email, isEmailVerifiedByProvider: false, providerUserId });
      createdUserIds.push(first.user.id);
      expect(first.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);

      smtp().clear();

      const second = await oauthLogin({ email, isEmailVerifiedByProvider: true, providerUserId });
      expect(second.result).toBe(ProviderAuthResult.SESSION);
      expect(second.didCompleteSignup).toBe(true);
      expect(findEmailTo(email)).toBeUndefined();

      const user = await findUser(first.user.id);
      expect(user?.isAccepted).toBe(true);
      expect(user?.isEmailVerified).toBe(true);
      const alias = await findAlias(first.user.id);
      expect(alias?.isEmailVerified).toBe(true);
    });

    test("an existing accepted user without an alias gets a session and a verified backfilled alias", async () => {
      const email = `oauth-backfill-${crypto.randomUUID()}@localhost.local`;
      const [existingUser] = await getDb()(TableName.Users)
        .insert({
          username: email,
          email,
          isAccepted: true,
          isEmailVerified: true,
          isGhost: false,
          authMethods: [AuthMethod.EMAIL]
        })
        .returning("*");
      createdUserIds.push(existingUser.id);

      const result = await oauthLogin({ email, isEmailVerifiedByProvider: true });

      expect(result.result).toBe(ProviderAuthResult.SESSION);
      // the account was already accepted, so this login must not look like a signup
      expect(result.didCompleteSignup).toBe(false);
      expect(result.user.id).toBe(existingUser.id);

      const alias = await findAlias(existingUser.id);
      expect(alias?.aliasType).toBe(UserAliasType.GOOGLE);
      expect(alias?.isEmailVerified).toBe(true);
    });
  });
});
