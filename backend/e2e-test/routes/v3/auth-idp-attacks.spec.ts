import crypto from "node:crypto";

import { Knex } from "knex";

import { AccessScope, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

import { cleanupEmailDomains, seedVerifiedEmailDomain } from "../../testUtils/email-domains";

const ORG_A_ID = seedData1.organization.id;
const ORG_A_DOMAIN = "org-a-domain.local";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getServices = () => (globalThis as any).testServices;

describe("Auth IdP Attack Vector Tests", () => {
  let orgBId: string;
  const ORG_B_DOMAIN = "org-b-domain.local";
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const db = getDb();

    await seedVerifiedEmailDomain(ORG_A_ID, ORG_A_DOMAIN, db);

    // Create Org B
    const [orgB] = await db(TableName.Organization)
      .insert({
        name: "Attack Test Org B",
        slug: `attack-test-org-b-${crypto.randomUUID().slice(0, 8)}`
      })
      .returning("*");
    orgBId = orgB.id;

    await seedVerifiedEmailDomain(orgBId, ORG_B_DOMAIN, db);
  });

  afterAll(async () => {
    const db = getDb();

    if (createdUserIds.length > 0) {
      await db(TableName.UserAliases).whereIn("userId", createdUserIds).del();
      await db(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
      await db(TableName.Users).whereIn("id", createdUserIds).where("id", "!=", seedData1.id).del();
    }

    await cleanupEmailDomains(ORG_A_ID, db);
    await cleanupEmailDomains(orgBId, db);
    await db(TableName.Organization).where({ id: orgBId }).del();
  });

  describe("Cross-Org Domain Attacks", () => {
    test("SAML login to Org-A with Org-B's verified domain email throws", async () => {
      await expect(
        getServices().saml.samlLogin({
          externalId: `cross-org-${crypto.randomUUID()}`,
          email: `attacker@${ORG_B_DOMAIN}`,
          firstName: "Attacker",
          lastName: "User",
          authProvider: "okta-saml",
          orgId: ORG_A_ID,
          ip: "127.0.0.1",
          userAgent: "test-agent"
        })
      ).rejects.toThrow(/domain/i);
    });

    test("SAML login with completely unverified domain email throws", async () => {
      await expect(
        getServices().saml.samlLogin({
          externalId: `unverified-${crypto.randomUUID()}`,
          email: "user@no-such-domain.example",
          firstName: "Unverified",
          lastName: "User",
          authProvider: "okta-saml",
          orgId: ORG_A_ID,
          ip: "127.0.0.1",
          userAgent: "test-agent"
        })
      ).rejects.toThrow(/domain/i);
    });

    test("OIDC login to Org-A with Org-B's verified domain email throws", async () => {
      await expect(
        getServices().oidc.oidcLogin({
          externalId: `oidc-cross-org-${crypto.randomUUID()}`,
          email: `oidcattacker@${ORG_B_DOMAIN}`,
          firstName: "OIDC",
          lastName: "Attacker",
          orgId: ORG_A_ID,
          ip: "127.0.0.1",
          userAgent: "test-agent"
        })
      ).rejects.toThrow(/domain/i);
    });

    test("LDAP login to Org-A with Org-B's verified domain email throws", async () => {
      await expect(
        getServices().ldap.ldapLogin({
          ldapConfigId: "00000000-0000-0000-0000-000000000000",
          externalId: `ldap-cross-org-${crypto.randomUUID()}`,
          username: `ldapattacker@${ORG_B_DOMAIN}`,
          email: `ldapattacker@${ORG_B_DOMAIN}`,
          firstName: "LDAP",
          lastName: "Attacker",
          orgId: ORG_A_ID,
          ip: "127.0.0.1",
          userAgent: "test-agent"
        })
      ).rejects.toThrow(/domain/i);
    });
  });

  describe("Membership Promotion Security", () => {
    test("New SAML login creates membership as Invited, not Accepted", async () => {
      const externalId = `invite-check-${crypto.randomUUID()}`;
      const email = `invitecheck-${crypto.randomUUID()}@${ORG_A_DOMAIN}`;

      const result = await getServices().saml.samlLogin({
        externalId,
        email,
        firstName: "Invite",
        lastName: "Check",
        authProvider: "okta-saml",
        orgId: ORG_A_ID,
        ip: "127.0.0.1",
        userAgent: "test-agent"
      });

      createdUserIds.push(result.user.id);

      const db = getDb();
      const [membership] = await db(TableName.Membership).where({
        actorUserId: result.user.id,
        scopeOrgId: ORG_A_ID,
        scope: AccessScope.Organization
      });

      expect(membership).toBeDefined();
      expect(membership.status).toBe("invited");
    });

    test("SCIM createScimUser with cross-org domain email throws", async () => {
      const db = getDb();
      // SCIM requires an SSO config to exist (orgAuthMethod is derived from saml_configs/oidc_configs join)
      await db(TableName.SamlConfig)
        .insert({
          orgId: ORG_A_ID,
          authProvider: "okta-saml",
          isActive: true,
          encryptedSamlEntryPoint: Buffer.from("test"),
          encryptedSamlIssuer: Buffer.from("test"),
          encryptedSamlCertificate: Buffer.from("test")
        })
        .onConflict()
        .ignore();
      await db(TableName.Organization).where({ id: ORG_A_ID }).update({ scimEnabled: true });

      try {
        await expect(
          getServices().scim.createScimUser({
            externalId: `scim-cross-${crypto.randomUUID()}`,
            email: `scimattacker@${ORG_B_DOMAIN}`,
            firstName: "SCIM",
            lastName: "Attacker",
            orgId: ORG_A_ID
          })
        ).rejects.toThrow(/domain/i);
      } finally {
        await db(TableName.Organization).where({ id: ORG_A_ID }).update({ scimEnabled: false });
        await db(TableName.SamlConfig).where({ orgId: ORG_A_ID }).del();
      }
    });

    test("SCIM createScimUser with unverified domain email throws", async () => {
      const db = getDb();
      await db(TableName.SamlConfig)
        .insert({
          orgId: ORG_A_ID,
          authProvider: "okta-saml",
          isActive: true,
          encryptedSamlEntryPoint: Buffer.from("test"),
          encryptedSamlIssuer: Buffer.from("test"),
          encryptedSamlCertificate: Buffer.from("test")
        })
        .onConflict()
        .ignore();
      await db(TableName.Organization).where({ id: ORG_A_ID }).update({ scimEnabled: true });

      try {
        await expect(
          getServices().scim.createScimUser({
            externalId: `scim-unverified-${crypto.randomUUID()}`,
            email: "scimuser@totally-unverified.example",
            firstName: "SCIM",
            lastName: "Unverified",
            orgId: ORG_A_ID
          })
        ).rejects.toThrow(/domain/i);
      } finally {
        await db(TableName.Organization).where({ id: ORG_A_ID }).update({ scimEnabled: false });
        await db(TableName.SamlConfig).where({ orgId: ORG_A_ID }).del();
      }
    });
  });
});
