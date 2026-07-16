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

  test("SAML login for a stale unverified alias is NOT promoted when the asserted email mismatches", async () => {
    // Simulate the legacy flow that persisted an alias before email verification completed: an
    // unverified SAML alias for `externalId` points at user A's account.
    const victimEmail = `victim-${crypto.randomUUID()}@${TEST_DOMAIN}`;
    const [victim] = await getDb()(TableName.Users)
      .insert({
        username: victimEmail,
        email: victimEmail,
        isAccepted: true,
        isEmailVerified: true,
        isGhost: false,
        authMethods: []
      })
      .returning("*");
    createdUserIds.push(victim.id);

    const externalId = `stale-alias-${crypto.randomUUID()}`;
    const [alias] = await getDb()(TableName.UserAliases)
      .insert({
        userId: victim.id,
        aliasType: "saml",
        externalId,
        emails: [victimEmail],
        orgId: TEST_ORG_ID,
        isEmailVerified: false
      })
      .returning("*");

    // A different identity (same verified domain) presents the externalId of the stale alias.
    const attackerEmail = `attacker-${crypto.randomUUID()}@${TEST_DOMAIN}`;
    const result = await getServices().saml.samlLogin({
      externalId,
      email: attackerEmail,
      firstName: "Stale",
      lastName: "Alias",
      authProvider: "okta-saml",
      orgId: TEST_ORG_ID,
      ip: "127.0.0.1",
      userAgent: "test-agent"
    });

    // No session should be issued for the victim's account.
    expect(result.result).not.toBe(ProviderAuthResult.SESSION);

    // The stale alias must remain unverified, and the victim's account must be untouched.
    const aliasAfter = await getDb()(TableName.UserAliases).where({ id: alias.id }).first();
    expect(aliasAfter?.isEmailVerified).toBe(false);
    const victimAfter = await getDb()(TableName.Users).where({ id: victim.id }).first();
    expect(victimAfter?.isAccepted).toBe(true);
    expect(victimAfter?.isEmailVerified).toBe(true);

    // The stale-alias guard must run BEFORE any state mutation: the victim is not enrolled into the
    // org (no membership created) since the IdP never proved control of the victim's account.
    const victimMembership = await getDb()(TableName.Membership)
      .where({ actorUserId: victim.id, scopeOrgId: TEST_ORG_ID })
      .first();
    expect(victimMembership).toBeUndefined();
  });

  test("SAML login promotes an unverified alias when the asserted email matches the account", async () => {
    const email = `match-${crypto.randomUUID()}@${TEST_DOMAIN}`;
    const [user] = await getDb()(TableName.Users)
      .insert({
        username: email,
        email,
        // Provisioned before enforcement: not yet accepted/verified.
        isAccepted: false,
        isEmailVerified: false,
        isGhost: false,
        authMethods: []
      })
      .returning("*");
    createdUserIds.push(user.id);

    const externalId = `match-alias-${crypto.randomUUID()}`;
    const [alias] = await getDb()(TableName.UserAliases)
      .insert({
        userId: user.id,
        aliasType: "saml",
        externalId,
        emails: [email],
        orgId: TEST_ORG_ID,
        isEmailVerified: false
      })
      .returning("*");

    const result = await getServices().saml.samlLogin({
      externalId,
      email, // the user's own email — matches the aliased account
      firstName: "Match",
      lastName: "User",
      authProvider: "okta-saml",
      orgId: TEST_ORG_ID,
      ip: "127.0.0.1",
      userAgent: "test-agent"
    });

    expect(result.result).toBe(ProviderAuthResult.SESSION);

    const aliasAfter = await getDb()(TableName.UserAliases).where({ id: alias.id }).first();
    expect(aliasAfter?.isEmailVerified).toBe(true);
    const userAfter = await getDb()(TableName.Users).where({ id: user.id }).first();
    expect(userAfter?.isAccepted).toBe(true);
    expect(userAfter?.isEmailVerified).toBe(true);
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
