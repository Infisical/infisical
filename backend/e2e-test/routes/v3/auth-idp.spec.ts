import crypto from "node:crypto";

import { decode } from "jsonwebtoken";
import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ActorType, AuthMethod, ProviderAuthResult } from "@app/services/auth/auth-type";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { cleanupEmailDomains, seedVerifiedEmailDomain } from "../../testUtils/email-domains";
import { addUserMembership } from "../../testUtils/users";

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

  // Covers the callback deriving the verdict; org selection acting on it is in auth-mfa.spec.ts.
  describe("Identity provider MFA signal", () => {
    const makeAcceptedSsoUser = async (aliasType: UserAliasType.SAML | UserAliasType.OIDC) => {
      const externalId = `${aliasType}-signal-${crypto.randomUUID()}`;
      const email = `${aliasType}signal-${crypto.randomUUID()}@${TEST_DOMAIN}`;
      const db = getDb();

      const [user] = await db(TableName.Users)
        .insert({
          username: email,
          email,
          firstName: "Signal",
          lastName: "User",
          isAccepted: true,
          isGhost: false,
          authMethods: [aliasType === UserAliasType.SAML ? AuthMethod.OKTA_SAML : AuthMethod.OIDC]
        })
        .returning("*");
      createdUserIds.push(user.id);

      await db(TableName.UserAliases).insert({
        userId: user.id,
        username: email,
        aliasType,
        externalId,
        emails: [email],
        orgId: TEST_ORG_ID,
        isEmailVerified: true
      });
      await addUserMembership({ userId: user.id, orgId: TEST_ORG_ID, role: OrgMembershipRole.Member });

      return { externalId, email };
    };

    const sessionClaims = (result: { result: string; tokens?: { access: string } }) => {
      expect(result.result).toBe(ProviderAuthResult.SESSION);
      return decode(result.tokens?.access as string) as Record<string, unknown>;
    };

    test("a SAML login carries the verdict on its session, and only when the IdP signalled MFA", async () => {
      const { externalId, email } = await makeAcceptedSsoUser(UserAliasType.SAML);
      const login = (idpMfa?: { verified: boolean; evidence: string[]; received: string[] }) =>
        getServices().saml.samlLogin({
          externalId,
          email,
          firstName: "Signal",
          lastName: "User",
          authProvider: AuthMethod.OKTA_SAML,
          orgId: TEST_ORG_ID,
          ip: "127.0.0.1",
          userAgent: "test-agent",
          idpMfa
        });

      expect(
        sessionClaims(await login({ verified: true, evidence: ["amr=mfa"], received: ["amr=pwd", "amr=mfa"] }))
          .idpMfaOrgId
      ).toBe(TEST_ORG_ID);
      expect(
        sessionClaims(await login({ verified: false, evidence: [], received: ["amr=pwd"] })).idpMfaOrgId
      ).toBeUndefined();
      expect(sessionClaims(await login()).idpMfaOrgId).toBeUndefined();
    });

    test("an OIDC login carries the verdict on its session, and only when the IdP signalled MFA", async () => {
      const { externalId, email } = await makeAcceptedSsoUser(UserAliasType.OIDC);
      const login = (idpMfa?: { verified: boolean; evidence: string[]; received: string[] }) =>
        getServices().oidc.oidcLogin({
          externalId,
          email,
          firstName: "Signal",
          lastName: "User",
          orgId: TEST_ORG_ID,
          ip: "127.0.0.1",
          userAgent: "test-agent",
          idpMfa
        });

      expect(
        sessionClaims(await login({ verified: true, evidence: ["mfa"], received: ["pwd", "mfa"] })).idpMfaOrgId
      ).toBe(TEST_ORG_ID);
      expect(sessionClaims(await login()).idpMfaOrgId).toBeUndefined();
    });
  });

  describe("SSO config updates", () => {
    const actor = {
      actor: ActorType.USER,
      actorId: seedData1.id,
      actorOrgId: TEST_ORG_ID,
      actorAuthMethod: AuthMethod.OKTA_SAML
    };

    const enforceSsoAndScim = () =>
      getDb()(TableName.Organization).where({ id: TEST_ORG_ID }).update({ authEnforced: true, scimEnabled: true });

    const orgFlags = () =>
      getDb()(TableName.Organization).where({ id: TEST_ORG_ID }).first("authEnforced", "scimEnabled");

    afterEach(async () => {
      await getDb()(TableName.SamlConfig).where({ orgId: TEST_ORG_ID }).del();
      await getDb()(TableName.OidcConfig).where({ orgId: TEST_ORG_ID }).del();
      await getDb()(TableName.Organization)
        .where({ id: TEST_ORG_ID })
        .update({ authEnforced: false, scimEnabled: false });
    });

    test("editing only the SAML MFA signal keeps SSO enforcement, SCIM and the active config", async () => {
      await getDb()(TableName.SamlConfig).insert({
        orgId: TEST_ORG_ID,
        authProvider: AuthMethod.OKTA_SAML,
        isActive: true,
        lastUsed: new Date(),
        encryptedSamlEntryPoint: Buffer.from("entry-point"),
        encryptedSamlIssuer: Buffer.from("issuer"),
        encryptedSamlCertificate: Buffer.from("cert")
      });
      await enforceSsoAndScim();

      await getServices().saml.updateSamlCfg({
        ...actor,
        orgId: TEST_ORG_ID,
        mfaSignalAttribute: "session_amr",
        mfaAuthnContexts: ["urn:example:mfa"]
      });

      expect(await orgFlags()).toEqual({ authEnforced: true, scimEnabled: true });
      const cfg = await getDb()(TableName.SamlConfig).where({ orgId: TEST_ORG_ID }).first();
      expect(cfg).toMatchObject({ isActive: true, mfaSignalAttribute: "session_amr" });
      expect(cfg?.lastUsed).not.toBeNull();

      await getServices().saml.updateSamlCfg({ ...actor, orgId: TEST_ORG_ID, isActive: false });

      expect(await orgFlags()).toEqual({ authEnforced: false, scimEnabled: false });
    });

    test("editing only the OIDC MFA signal keeps SSO enforcement and SCIM", async () => {
      await getDb()(TableName.OidcConfig).insert({
        orgId: TEST_ORG_ID,
        configurationType: "discoveryURL",
        isActive: true,
        lastUsed: new Date(),
        encryptedOidcClientId: Buffer.from("client-id"),
        encryptedOidcClientSecret: Buffer.from("client-secret")
      });
      await enforceSsoAndScim();

      await getServices().oidc.updateOidcCfg({
        ...actor,
        organizationId: TEST_ORG_ID,
        mfaClaimName: "acr",
        mfaAmrValues: ["phr"]
      });

      expect(await orgFlags()).toEqual({ authEnforced: true, scimEnabled: true });
      const cfg = await getDb()(TableName.OidcConfig).where({ orgId: TEST_ORG_ID }).first();
      expect(cfg).toMatchObject({ isActive: true, mfaClaimName: "acr", mfaAmrValues: ["phr"] });
      expect(cfg?.lastUsed).not.toBeNull();

      await getServices().oidc.updateOidcCfg({ ...actor, organizationId: TEST_ORG_ID, allowedEmailDomains: "" });

      expect(await orgFlags()).toEqual({ authEnforced: false, scimEnabled: false });
    });
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

    test("Backfills name for a pre-invited user with null firstName/lastName", async () => {
      const externalId = `saml-preinvite-${crypto.randomUUID()}`;
      const email = `samlpreinvite-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const db = getDb();

      // Simulate an org/project invite: a user record created without a name
      // (mirrors membership-user-service.createOrGetUserToAdd — both names NULL)
      const [invitedUser] = await db(TableName.Users)
        .insert({
          username: email,
          email,
          isAccepted: false,
          isGhost: false,
          authMethods: [AuthMethod.EMAIL]
        })
        .returning("*");
      createdUserIds.push(invitedUser.id);
      expect(invitedUser.firstName).toBeNull();
      expect(invitedUser.lastName).toBeNull();

      // First SAML login for that pre-invited user, with names from the IdP
      await getServices().saml.samlLogin({
        externalId,
        email,
        firstName: "Saml",
        lastName: "Invitee",
        authProvider: "okta-saml",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      // The existing invited user is reused (not duplicated)...
      const alias = await db(TableName.UserAliases).where({ externalId, orgId: TEST_ORG_ID }).first();
      expect(alias?.userId).toBe(invitedUser.id);

      // ...and its name is backfilled from the IdP claims instead of staying NULL
      const updatedUser = await db(TableName.Users).where({ id: invitedUser.id }).first();
      expect(updatedUser?.firstName).toBe("Saml");
      expect(updatedUser?.lastName).toBe("Invitee");
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

    test("Backfills name for a pre-invited user with null firstName/lastName", async () => {
      const externalId = `ldap-preinvite-${crypto.randomUUID()}`;
      const email = `ldappreinvite-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const db = getDb();

      // Simulate an org/project invite: a user record created without a name
      // (mirrors membership-user-service.createOrGetUserToAdd — both names NULL)
      const [invitedUser] = await db(TableName.Users)
        .insert({
          username: email,
          email,
          isAccepted: false,
          isGhost: false,
          authMethods: [AuthMethod.EMAIL]
        })
        .returning("*");
      createdUserIds.push(invitedUser.id);
      expect(invitedUser.firstName).toBeNull();
      expect(invitedUser.lastName).toBeNull();

      // First LDAP login for that pre-invited user, with names from the directory
      await getServices().ldap.ldapLogin({
        ldapConfigId,
        externalId,
        username: email,
        email,
        firstName: "Ldap",
        lastName: "Invitee",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      // The existing invited user is reused (not duplicated)...
      const alias = await db(TableName.UserAliases).where({ externalId, orgId: TEST_ORG_ID }).first();
      expect(alias?.userId).toBe(invitedUser.id);

      // ...and its name is backfilled from the IdP claims instead of staying NULL
      const updatedUser = await db(TableName.Users).where({ id: invitedUser.id }).first();
      expect(updatedUser?.firstName).toBe("Ldap");
      expect(updatedUser?.lastName).toBe("Invitee");
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

    test("Backfills name for a pre-invited user with null firstName/lastName", async () => {
      const externalId = `oidc-preinvite-${crypto.randomUUID()}`;
      const email = `oidcpreinvite-${crypto.randomUUID()}@${TEST_DOMAIN}`;

      const db = getDb();

      // Simulate an org/project invite: a user record created without a name
      // (mirrors membership-user-service.createOrGetUserToAdd — both names NULL)
      const [invitedUser] = await db(TableName.Users)
        .insert({
          username: email,
          email,
          isAccepted: false,
          isGhost: false,
          authMethods: [AuthMethod.EMAIL]
        })
        .returning("*");
      createdUserIds.push(invitedUser.id);
      expect(invitedUser.firstName).toBeNull();
      expect(invitedUser.lastName).toBeNull();

      // First OIDC login for that pre-invited user, with names from the IdP
      await getServices().oidc.oidcLogin({
        externalId,
        email,
        firstName: "Oidc",
        lastName: "Invitee",
        orgId: TEST_ORG_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      // The existing invited user is reused (not duplicated)...
      const alias = await db(TableName.UserAliases).where({ externalId, orgId: TEST_ORG_ID }).first();
      expect(alias?.userId).toBe(invitedUser.id);

      // ...and its name is backfilled from the IdP claims instead of staying NULL
      const updatedUser = await db(TableName.Users).where({ id: invitedUser.id }).first();
      expect(updatedUser?.firstName).toBe("Oidc");
      expect(updatedUser?.lastName).toBe("Invitee");
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

  // syncSsoUserProfile is unit-tested in isolation; these cover the wiring, that each provider's
  // login actually calls it, after the alias has been promoted to verified, with the assertion's
  // values rather than the stored ones.
  describe("SSO profile sync", () => {
    type TIdpLoginArgs = { externalId: string; email: string; firstName: string; lastName: string };

    const idpLogins: { name: string; slug: string; login: (args: TIdpLoginArgs) => Promise<unknown> }[] = [
      {
        name: "SAML",
        slug: "saml",
        login: (args) =>
          getServices().saml.samlLogin({
            ...args,
            authProvider: "okta-saml",
            orgId: TEST_ORG_ID,
            ip: "127.0.0.1",
            userAgent: "test-agent"
          })
      },
      {
        name: "LDAP",
        slug: "ldap",
        login: (args) =>
          getServices().ldap.ldapLogin({
            ...args,
            username: args.email,
            ldapConfigId,
            orgId: TEST_ORG_ID,
            ip: "127.0.0.1",
            userAgent: "test-agent"
          })
      },
      {
        name: "OIDC",
        slug: "oidc",
        login: (args) =>
          getServices().oidc.oidcLogin({
            ...args,
            orgId: TEST_ORG_ID,
            ip: "127.0.0.1",
            userAgent: "test-agent"
          })
      }
    ];

    const setAuthEnforced = async (authEnforced: boolean) => {
      await getDb()(TableName.Organization).where({ id: TEST_ORG_ID }).update({ authEnforced });
    };

    afterEach(async () => {
      await setAuthEnforced(false);
    });

    describe.each(idpLogins)("$name Login", ({ slug, login }) => {
      // Enforcement is on for the first login of both tests so the alias is created verified,
      // which is what syncSsoUserProfile requires before it will trust the assertion.
      const seedVerifiedAlias = async (externalId: string, email: string) => {
        await setAuthEnforced(true);
        await login({ externalId, email, firstName: "Original", lastName: "Name" });

        const alias = await getDb()(TableName.UserAliases).where({ externalId, orgId: TEST_ORG_ID }).first();
        if (!alias) throw new Error(`No alias created for external id '${externalId}'`);
        expect(alias.isEmailVerified).toBe(true);
        createdUserIds.push(alias.userId);

        return alias;
      };

      test("Carries a renamed mailbox and name onto the account when the org enforces SSO", async () => {
        const externalId = `${slug}-sync-${crypto.randomUUID()}`;
        const email = `${slug}sync-${crypto.randomUUID()}@${TEST_DOMAIN}`;
        const renamedEmail = `${slug}renamed-${crypto.randomUUID()}@${TEST_DOMAIN}`;

        const alias = await seedVerifiedAlias(externalId, email);

        // Same externalId, new mailbox and surname: the person was renamed at the IdP.
        await login({ externalId, email: renamedEmail, firstName: "Original", lastName: "Renamed" });

        const db = getDb();
        const user = await db(TableName.Users).where({ id: alias.userId }).first();
        expect(user?.username).toBe(renamedEmail);
        expect(user?.email).toBe(renamedEmail);
        expect(user?.lastName).toBe("Renamed");

        // The old address stays on the alias so a login in flight from before the rename
        // does not read as stale.
        const updatedAlias = await db(TableName.UserAliases).where({ id: alias.id }).first();
        expect(updatedAlias?.emails).toEqual(expect.arrayContaining([email, renamedEmail]));
      });

      test("Leaves the account alone when the org does not enforce SSO", async () => {
        const externalId = `${slug}-nosync-${crypto.randomUUID()}`;
        const email = `${slug}nosync-${crypto.randomUUID()}@${TEST_DOMAIN}`;
        const renamedEmail = `${slug}nosyncrenamed-${crypto.randomUUID()}@${TEST_DOMAIN}`;

        const alias = await seedVerifiedAlias(externalId, email);

        // Enforcement dropped, so the IdP is no longer authoritative for identity. The alias
        // stays verified, which isolates the enforcement gate from the stale-alias guard.
        await setAuthEnforced(false);
        await login({ externalId, email: renamedEmail, firstName: "Original", lastName: "Renamed" });

        const user = await getDb()(TableName.Users).where({ id: alias.userId }).first();
        expect(user?.username).toBe(email);
        expect(user?.email).toBe(email);
        expect(user?.lastName).toBe("Name");
      });
    });
  });
});
