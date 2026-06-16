/* eslint-disable no-await-in-loop */
import crypto from "node:crypto";

import jwt from "jsonwebtoken";
import { Knex } from "knex";

import { AccessScope, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AuthTokenType } from "@app/services/auth/auth-type";

import { cleanupEmailDomains, seedVerifiedEmailDomain } from "../../testUtils/email-domains";

const ORG_ID = seedData1.organization.id;
const TEST_DOMAIN = "scim-test.local";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const createScimToken = async (db: Knex, orgId: string): Promise<string> => {
  const [scimTokenData] = await db(TableName.ScimToken)
    .insert({
      orgId,
      description: "test-scim-token",
      ttlDays: 365
    })
    .returning("*");

  const scimToken = jwt.sign(
    {
      scimTokenId: scimTokenData.id,
      authTokenType: AuthTokenType.SCIM_TOKEN
    },
    process.env.AUTH_SECRET ?? "something-random"
  );

  return scimToken;
};

describe("SCIM v1 Router", () => {
  let scimToken: string;
  const createdUserIds: string[] = [];
  const createdMembershipIds: string[] = [];

  beforeAll(async () => {
    const db = getDb();

    // Setup verified email domain
    await seedVerifiedEmailDomain(ORG_ID, TEST_DOMAIN, db);

    // Setup SAML config to enable orgAuthMethod
    await db(TableName.SamlConfig)
      .insert({
        orgId: ORG_ID,
        authProvider: "okta-saml",
        isActive: true,
        encryptedSamlEntryPoint: Buffer.from("test"),
        encryptedSamlIssuer: Buffer.from("test"),
        encryptedSamlCertificate: Buffer.from("test")
      })
      .onConflict()
      .ignore();

    // Enable SCIM on the org
    await db(TableName.Organization).where({ id: ORG_ID }).update({ scimEnabled: true });

    // Create SCIM token
    scimToken = await createScimToken(db, ORG_ID);
  });

  afterAll(async () => {
    const db = getDb();

    // Cleanup in reverse order of dependencies
    if (createdUserIds.length > 0) {
      await db(TableName.UserAliases).whereIn("userId", createdUserIds).del();
    }
    if (createdMembershipIds.length > 0) {
      await db(TableName.MembershipRole).whereIn("membershipId", createdMembershipIds).del();
      await db(TableName.Membership).whereIn("id", createdMembershipIds).del();
    }
    if (createdUserIds.length > 0) {
      await db(TableName.UserEncryptionKey).whereIn("userId", createdUserIds).del();
      await db(TableName.Users).whereIn("id", createdUserIds).del();
    }

    // Cleanup SCIM tokens
    await db(TableName.ScimToken).where({ orgId: ORG_ID }).del();

    // Disable SCIM and remove SAML config
    await db(TableName.Organization).where({ id: ORG_ID }).update({ scimEnabled: false });
    await db(TableName.SamlConfig).where({ orgId: ORG_ID }).del();
    await cleanupEmailDomains(ORG_ID, db);
  });

  describe("GET /Users - Duplicate alias handling", () => {
    test("should return unique users even when multiple aliases exist for the same user", async () => {
      const db = getDb();

      // Create test users with multiple duplicate aliases
      const testUsers = [];
      for (let i = 0; i < 3; i += 1) {
        const [user] = await db(TableName.Users)
          .insert({
            email: `scim-test-${i}@${TEST_DOMAIN}`,
            username: `scim-test-${i}@${TEST_DOMAIN}`,
            isGhost: false,
            isEmailVerified: true,
            authMethods: ["email"]
          })
          .returning("*");
        createdUserIds.push(user.id);

        // Create org membership
        const [membership] = await db(TableName.Membership)
          .insert({
            actorUserId: user.id,
            scopeOrgId: ORG_ID,
            scope: AccessScope.Organization,
            isActive: true
          })
          .returning("*");
        createdMembershipIds.push(membership.id);

        // Create membership role
        await db(TableName.MembershipRole).insert({
          membershipId: membership.id,
          role: "member"
        });

        // Create MULTIPLE duplicate SAML aliases for this user (simulating the bug scenario)
        for (let j = 0; j < 3; j += 1) {
          await db(TableName.UserAliases).insert({
            userId: user.id,
            orgId: ORG_ID,
            aliasType: "saml",
            externalId: `saml-ext-${i}-${j}-${crypto.randomUUID().slice(0, 8)}`
          });
        }

        testUsers.push({ user, membership });
      }

      // Call GET /Users
      const res = await testServer.inject({
        method: "GET",
        url: "/api/v1/scim/Users",
        headers: {
          authorization: `Bearer ${scimToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);

      // Extract the IDs of our test users from the response
      const returnedIds = payload.Resources.map((r: { id: string }) => r.id);
      const testMembershipIds = testUsers.map((t) => t.membership.id);

      // Count how many times each test user appears
      const testUserOccurrences = testMembershipIds.map(
        (id) => returnedIds.filter((returnedId: string) => returnedId === id).length
      );

      // Each user should appear exactly once (not duplicated due to multiple aliases)
      testUserOccurrences.forEach((count) => {
        expect(count).toBe(1);
      });

      // totalResults should match Resources length (no inflation)
      expect(payload.totalResults).toBe(payload.Resources.length);
    });

    test("should use the latest alias externalId for each user", async () => {
      const db = getDb();

      const [user] = await db(TableName.Users)
        .insert({
          email: `scim-latest-alias@${TEST_DOMAIN}`,
          username: `scim-latest-alias@${TEST_DOMAIN}`,
          isGhost: false,
          isEmailVerified: true,
          authMethods: ["email"]
        })
        .returning("*");
      createdUserIds.push(user.id);

      const [membership] = await db(TableName.Membership)
        .insert({
          actorUserId: user.id,
          scopeOrgId: ORG_ID,
          scope: AccessScope.Organization,
          isActive: true
        })
        .returning("*");
      createdMembershipIds.push(membership.id);

      await db(TableName.MembershipRole).insert({
        membershipId: membership.id,
        role: "member"
      });

      // Create aliases with different timestamps - the LATEST one should be used
      // Insert old one first, then wait a bit and insert new one
      const oldExternalId = "old-external-id";
      const latestExternalId = "latest-external-id";

      await db(TableName.UserAliases).insert({
        userId: user.id,
        orgId: ORG_ID,
        aliasType: "saml",
        externalId: oldExternalId
      });

      // Small delay to ensure different createdAt timestamps
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 50));

      await db(TableName.UserAliases).insert({
        userId: user.id,
        orgId: ORG_ID,
        aliasType: "saml",
        externalId: latestExternalId
      });

      const res = await testServer.inject({
        method: "GET",
        url: "/api/v1/scim/Users",
        headers: {
          authorization: `Bearer ${scimToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);

      const testUser = payload.Resources.find((r: { id: string }) => r.id === membership.id);
      expect(testUser).toBeDefined();
      expect(testUser.userName).toBe(latestExternalId);
    });
  });

  describe("GET /Users - Auth method alias type selection", () => {
    test("should use SAML aliases when org has SAML configured", async () => {
      const db = getDb();

      const [user] = await db(TableName.Users)
        .insert({
          email: `scim-saml-type@${TEST_DOMAIN}`,
          username: `scim-saml-type@${TEST_DOMAIN}`,
          isGhost: false,
          isEmailVerified: true,
          authMethods: ["email"]
        })
        .returning("*");
      createdUserIds.push(user.id);

      const [membership] = await db(TableName.Membership)
        .insert({
          actorUserId: user.id,
          scopeOrgId: ORG_ID,
          scope: AccessScope.Organization,
          isActive: true
        })
        .returning("*");
      createdMembershipIds.push(membership.id);

      await db(TableName.MembershipRole).insert({
        membershipId: membership.id,
        role: "member"
      });

      // Create both SAML and OIDC aliases
      const samlExternalId = "saml-external-id";
      const oidcExternalId = "oidc-external-id";

      await db(TableName.UserAliases).insert({
        userId: user.id,
        orgId: ORG_ID,
        aliasType: "saml",
        externalId: samlExternalId
      });

      await db(TableName.UserAliases).insert({
        userId: user.id,
        orgId: ORG_ID,
        aliasType: "oidc",
        externalId: oidcExternalId
      });

      // With SAML configured (from beforeAll), should use SAML alias
      const res = await testServer.inject({
        method: "GET",
        url: "/api/v1/scim/Users",
        headers: {
          authorization: `Bearer ${scimToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);

      const testUser = payload.Resources.find((r: { id: string }) => r.id === membership.id);
      expect(testUser).toBeDefined();
      expect(testUser.userName).toBe(samlExternalId);
    });

    test("should use OIDC aliases when org has OIDC configured", async () => {
      const db = getDb();

      // Switch from SAML to OIDC config
      await db(TableName.SamlConfig).where({ orgId: ORG_ID }).del();
      await db(TableName.OidcConfig)
        .insert({
          orgId: ORG_ID,
          isActive: true,
          configurationType: "discovery_url",
          encryptedOidcClientId: Buffer.from("test"),
          encryptedOidcClientSecret: Buffer.from("test"),
          discoveryURL: "https://example.com/.well-known/openid-configuration"
        })
        .onConflict()
        .ignore();

      try {
        const [user] = await db(TableName.Users)
          .insert({
            email: `scim-oidc-type@${TEST_DOMAIN}`,
            username: `scim-oidc-type@${TEST_DOMAIN}`,
            isGhost: false,
            isEmailVerified: true,
            authMethods: ["email"]
          })
          .returning("*");
        createdUserIds.push(user.id);

        const [membership] = await db(TableName.Membership)
          .insert({
            actorUserId: user.id,
            scopeOrgId: ORG_ID,
            scope: AccessScope.Organization,
            isActive: true
          })
          .returning("*");
        createdMembershipIds.push(membership.id);

        await db(TableName.MembershipRole).insert({
          membershipId: membership.id,
          role: "member"
        });

        // Create both SAML and OIDC aliases
        const samlExternalId = "saml-external-id-oidc-test";
        const oidcExternalId = "oidc-external-id-oidc-test";

        await db(TableName.UserAliases).insert({
          userId: user.id,
          orgId: ORG_ID,
          aliasType: "saml",
          externalId: samlExternalId
        });

        await db(TableName.UserAliases).insert({
          userId: user.id,
          orgId: ORG_ID,
          aliasType: "oidc",
          externalId: oidcExternalId
        });

        // With OIDC configured, should use OIDC alias
        const res = await testServer.inject({
          method: "GET",
          url: "/api/v1/scim/Users",
          headers: {
            authorization: `Bearer ${scimToken}`
          }
        });

        expect(res.statusCode).toBe(200);
        const payload = JSON.parse(res.payload);

        const testUser = payload.Resources.find((r: { id: string }) => r.id === membership.id);
        expect(testUser).toBeDefined();
        expect(testUser.userName).toBe(oidcExternalId);
      } finally {
        // Restore SAML config for other tests
        await db(TableName.OidcConfig).where({ orgId: ORG_ID }).del();
        await db(TableName.SamlConfig)
          .insert({
            orgId: ORG_ID,
            authProvider: "okta-saml",
            isActive: true,
            encryptedSamlEntryPoint: Buffer.from("test"),
            encryptedSamlIssuer: Buffer.from("test"),
            encryptedSamlCertificate: Buffer.from("test")
          })
          .onConflict()
          .ignore();
      }
    });
  });

  describe("GET /ServiceProviderConfig", () => {
    test("should return valid ServiceProviderConfig per RFC 7643", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: "/api/v1/scim/ServiceProviderConfig",
        headers: {
          authorization: `Bearer ${scimToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);

      expect(payload.schemas).toContain("urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig");
      expect(payload.patch.supported).toBe(true);
      expect(payload.filter.supported).toBe(true);
      expect(payload.authenticationSchemes).toBeInstanceOf(Array);
      expect(payload.authenticationSchemes.length).toBeGreaterThan(0);

      // RFC 7643 §5: type should be one of oauth, oauth2, oauthbearertoken, httpbasic, httpdigest
      const authScheme = payload.authenticationSchemes[0];
      expect(["oauth", "oauth2", "oauthbearertoken", "httpbasic", "httpdigest"]).toContain(authScheme.type);
      expect(authScheme.primary).toBe(true);
    });
  });
});
