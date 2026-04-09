import crypto from "node:crypto";

import { Knex } from "knex";

import { AccessScope, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ProviderAuthResult } from "@app/services/auth/auth-type";

import { cleanupEmailDomains, seedVerifiedEmailDomain } from "../../testUtils/email-domains";

const TEST_ORG_ID = seedData1.organization.id;
const TEST_DOMAIN = "testdomain.local";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getServices = () => (globalThis as any).testServices;

describe("Auth IdP Service-Level Tests", () => {
  const createdUserIds: string[] = [];
  // Use a dummy LDAP config ID — ldapLogin only uses it for group mapping, which we don't test here
  const ldapConfigId = "00000000-0000-0000-0000-000000000000";

  beforeAll(async () => {
    const db = getDb();
    await seedVerifiedEmailDomain(TEST_ORG_ID, TEST_DOMAIN, db);
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

  describe("SAML Login", () => {
    test("Creates new user + alias + membership as Invited", async () => {
      const externalId = `saml-ext-${crypto.randomUUID()}`;
      const email = `samluser-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const result = await getServices().saml.samlLogin({
        externalId,
        email,
        firstName: "SAML",
        lastName: "User",
        authProvider: "okta-saml",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(result.userId).toBeDefined();
      createdUserIds.push(result.userId);

      const db = getDb();
      const [membership] = await db(TableName.Membership).where({
        actorUserId: result.userId,
        scopeOrgId: TEST_ORG_ID,
        scope: AccessScope.Organization
      });
      expect(membership).toBeDefined();
      expect(membership.status).toBe("invited");
    });

    test("Returns SIGNUP_REQUIRED for new unverified user", async () => {
      const externalId = `saml-ext-${crypto.randomUUID()}`;
      const email = `newuser-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const result = await getServices().saml.samlLogin({
        externalId,
        email,
        firstName: "New",
        lastName: "User",
        authProvider: "okta-saml",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(result.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
      expect(result).toHaveProperty("signupToken");
      createdUserIds.push(result.userId);
    });

    test("Same externalId reuses existing user", async () => {
      const externalId = `saml-reuse-${crypto.randomUUID()}`;
      const email = `reuse-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const result1 = await getServices().saml.samlLogin({
        externalId,
        email,
        firstName: "Reuse",
        lastName: "User",
        authProvider: "okta-saml",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });
      createdUserIds.push(result1.userId);

      const result2 = await getServices().saml.samlLogin({
        externalId,
        email,
        firstName: "Reuse",
        lastName: "User",
        authProvider: "okta-saml",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(result2.userId).toBe(result1.userId);
    });

    test("Login without verified domain throws", async () => {
      await expect(
        getServices().saml.samlLogin({
          externalId: `saml-no-domain-${crypto.randomUUID()}`,
          email: "user@unverified-domain.local",
          firstName: "No",
          lastName: "Domain",
          authProvider: "okta-saml",
          orgId: TEST_ORG_ID,
          ip: "127.0.0.1",
          userAgent: "test-agent"
        })
      ).rejects.toThrow();
    });
  });

  describe("LDAP Login", () => {
    test("Creates new user + alias", async () => {
      const externalId = `ldap-ext-${crypto.randomUUID()}`;
      const email = `ldapuser-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const result = await getServices().ldap.ldapLogin({
        ldapConfigId,
        externalId,
        username: email,
        email,
        firstName: "LDAP",
        lastName: "User",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(result.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
      expect(result).toHaveProperty("signupToken");

      const db = getDb();
      const alias = await db(TableName.UserAliases).where({ externalId, orgId: TEST_ORG_ID }).first();
      expect(alias).toBeDefined();
      if (alias) createdUserIds.push(alias.userId);
    });

    test("Same externalId reuses existing user", async () => {
      const externalId = `ldap-reuse-${crypto.randomUUID()}`;
      const email = `ldapreuse-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      await getServices().ldap.ldapLogin({
        ldapConfigId,
        externalId,
        username: email,
        email,
        firstName: "LDAP",
        lastName: "Reuse",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      const db = getDb();
      const alias1 = await db(TableName.UserAliases).where({ externalId, orgId: TEST_ORG_ID }).first();
      expect(alias1).toBeDefined();
      if (alias1) createdUserIds.push(alias1.userId);

      await getServices().ldap.ldapLogin({
        ldapConfigId,
        externalId,
        username: email,
        email,
        firstName: "LDAP",
        lastName: "Reuse",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      const alias2 = await db(TableName.UserAliases).where({ externalId, orgId: TEST_ORG_ID }).first();
      expect(alias2?.userId).toBe(alias1?.userId);
    });

    test("Login without verified domain throws", async () => {
      await expect(
        getServices().ldap.ldapLogin({
          ldapConfigId,
          externalId: `ldap-no-domain-${crypto.randomUUID()}`,
          username: "user@unverified-ldap.local",
          email: "user@unverified-ldap.local",
          firstName: "No",
          lastName: "Domain",
          orgId: TEST_ORG_ID,
          ip: "127.0.0.1",
          userAgent: "test-agent"
        })
      ).rejects.toThrow();
    });
  });

  describe("OIDC Login", () => {
    test("Creates new user + alias", async () => {
      const externalId = `oidc-ext-${crypto.randomUUID()}`;
      const email = `oidcuser-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const result = await getServices().oidc.oidcLogin({
        externalId,
        email,
        firstName: "OIDC",
        lastName: "User",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(result.userId).toBeDefined();
      createdUserIds.push(result.userId);

      const db = getDb();
      const alias = await db(TableName.UserAliases).where({ externalId, orgId: TEST_ORG_ID }).first();
      expect(alias).toBeDefined();
    });

    test("Returns SIGNUP_REQUIRED for new user", async () => {
      const externalId = `oidc-signup-${crypto.randomUUID()}`;
      const email = `oidcsignup-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const result = await getServices().oidc.oidcLogin({
        externalId,
        email,
        firstName: "OIDC",
        lastName: "Signup",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(result.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
      createdUserIds.push(result.userId);
    });

    test("Same externalId reuses existing user", async () => {
      const externalId = `oidc-reuse-${crypto.randomUUID()}`;
      const email = `oidcreuse-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const result1 = await getServices().oidc.oidcLogin({
        externalId,
        email,
        firstName: "OIDC",
        lastName: "Reuse",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });
      createdUserIds.push(result1.userId);

      const result2 = await getServices().oidc.oidcLogin({
        externalId,
        email,
        firstName: "OIDC",
        lastName: "Reuse",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(result2.userId).toBe(result1.userId);
    });

    test("Login without verified domain throws", async () => {
      await expect(
        getServices().oidc.oidcLogin({
          externalId: `oidc-no-domain-${crypto.randomUUID()}`,
          email: "user@unverified-oidc.local",
          firstName: "No",
          lastName: "Domain",
          orgId: TEST_ORG_ID,
          ip: "127.0.0.1",
          userAgent: "test-agent"
        })
      ).rejects.toThrow();
    });
  });

  describe("OAuth Login", () => {
    test("GitHub OAuth creates new user + alias", async () => {
      const providerUserId = `github-${crypto.randomUUID()}`;
      const email = `githubuser-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const result = await getServices().login.oauth2Login({
        email,
        firstName: "GitHub",
        lastName: "User",
        authMethod: "github",
        providerUserId,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(result.user).toBeDefined();
      createdUserIds.push(result.user.id);
    });

    test("Same providerUserId reuses existing user", async () => {
      const providerUserId = `github-reuse-${crypto.randomUUID()}`;
      const email = `githubreuse-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const result1 = await getServices().login.oauth2Login({
        email,
        firstName: "GitHub",
        lastName: "Reuse",
        authMethod: "github",
        providerUserId,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });
      createdUserIds.push(result1.user.id);

      const result2 = await getServices().login.oauth2Login({
        email,
        firstName: "GitHub",
        lastName: "Reuse",
        authMethod: "github",
        providerUserId,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(result2.user.id).toBe(result1.user.id);
    });
  });
});
