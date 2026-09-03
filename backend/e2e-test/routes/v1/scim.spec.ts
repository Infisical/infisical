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
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

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

  describe("GET /Users/:id - Single user lookup consistency", () => {
    test("should return the same userName as GET /Users list endpoint", async () => {
      const db = getDb();
      const uniqueId = crypto.randomUUID().slice(0, 8);
      const email = `scim-single-${uniqueId}@${TEST_DOMAIN}`;
      const externalId = `ext-single-${uniqueId}`;

      // Create user via SCIM API
      const createRes = await testServer.inject({
        method: "POST",
        url: "/api/v1/scim/Users",
        headers: {
          authorization: `Bearer ${scimToken}`
        },
        body: {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: externalId,
          name: {
            givenName: "Test",
            familyName: "User"
          },
          emails: [{ primary: true, value: email }],
          active: true
        }
      });

      expect(createRes.statusCode).toBe(200);
      const createdUser = JSON.parse(createRes.payload);
      const membershipId = createdUser.id;

      // Track for cleanup
      const [membership] = await db(TableName.Membership).where({ id: membershipId }).select("actorUserId");
      if (membership?.actorUserId) {
        createdUserIds.push(membership.actorUserId);
      }
      createdMembershipIds.push(membershipId);

      // Get user from list endpoint
      const listRes = await testServer.inject({
        method: "GET",
        url: "/api/v1/scim/Users",
        headers: {
          authorization: `Bearer ${scimToken}`
        }
      });

      expect(listRes.statusCode).toBe(200);
      const listPayload = JSON.parse(listRes.payload);
      const userFromList = listPayload.Resources.find((r: { id: string }) => r.id === membershipId);
      expect(userFromList).toBeDefined();

      // Get same user from single-user endpoint
      const singleRes = await testServer.inject({
        method: "GET",
        url: `/api/v1/scim/Users/${membershipId}`,
        headers: {
          authorization: `Bearer ${scimToken}`
        }
      });

      expect(singleRes.statusCode).toBe(200);
      const userFromSingle = JSON.parse(singleRes.payload);

      // Both endpoints should return the same userName
      expect(userFromSingle.userName).toBe(userFromList.userName);
      expect(userFromSingle.userName).toBe(externalId);
    });

    test("should return consistent userName even with multiple aliases", async () => {
      const db = getDb();
      const uniqueId = crypto.randomUUID().slice(0, 8);
      const email = `scim-multi-alias-${uniqueId}@${TEST_DOMAIN}`;
      const externalId = `ext-multi-${uniqueId}`;

      // Create user via SCIM API
      const createRes = await testServer.inject({
        method: "POST",
        url: "/api/v1/scim/Users",
        headers: {
          authorization: `Bearer ${scimToken}`
        },
        body: {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: externalId,
          name: {
            givenName: "Multi",
            familyName: "Alias"
          },
          emails: [{ primary: true, value: email }],
          active: true
        }
      });

      expect(createRes.statusCode).toBe(200);
      const createdUser = JSON.parse(createRes.payload);
      const membershipId = createdUser.id;

      // Track for cleanup
      const [membership] = await db(TableName.Membership).where({ id: membershipId }).select("actorUserId");
      if (membership?.actorUserId) {
        createdUserIds.push(membership.actorUserId);

        // Add duplicate aliases directly to DB to simulate the bug scenario
        const latestExternalId = `latest-${uniqueId}`;
        await db(TableName.UserAliases).insert({
          userId: membership.actorUserId,
          orgId: ORG_ID,
          aliasType: "saml",
          externalId: latestExternalId
        });
      }
      createdMembershipIds.push(membershipId);

      // Get user from list endpoint
      const listRes = await testServer.inject({
        method: "GET",
        url: "/api/v1/scim/Users",
        headers: {
          authorization: `Bearer ${scimToken}`
        }
      });

      expect(listRes.statusCode).toBe(200);
      const listPayload = JSON.parse(listRes.payload);
      const userFromList = listPayload.Resources.find((r: { id: string }) => r.id === membershipId);

      // Get same user from single-user endpoint
      const singleRes = await testServer.inject({
        method: "GET",
        url: `/api/v1/scim/Users/${membershipId}`,
        headers: {
          authorization: `Bearer ${scimToken}`
        }
      });

      expect(singleRes.statusCode).toBe(200);
      const userFromSingle = JSON.parse(singleRes.payload);

      // Both endpoints MUST return the same userName - this was the bug
      expect(userFromSingle.userName).toBe(userFromList.userName);
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

  describe("PATCH /Users/:orgMembershipId", () => {
    const seedScimUser = async (db: Knex, label: string) => {
      const [user] = await db(TableName.Users)
        .insert({
          email: `scim-patch-${label}@${TEST_DOMAIN}`,
          username: `scim-patch-${label}@${TEST_DOMAIN}`,
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

      await db(TableName.MembershipRole).insert({ membershipId: membership.id, role: "member" });

      // updateScimUser resolves the user through its SSO alias and 404s without one.
      await db(TableName.UserAliases).insert({
        userId: user.id,
        orgId: ORG_ID,
        aliasType: "saml",
        externalId: `scim-patch-ext-${label}`
      });

      return { user, membership };
    };

    // Body is sent as a raw string so the exact wire bytes reach the parser. Building
    // __proto__ from an object literal would set the prototype instead of emitting the key.
    const patch = (membershipId: string, body: string, contentType: string) =>
      testServer.inject({
        method: "PATCH",
        url: `/api/v1/scim/Users/${membershipId}`,
        headers: {
          authorization: `Bearer ${scimToken}`,
          "content-type": contentType
        },
        payload: body
      });

    test("should apply a replace operation and deactivate the membership", async () => {
      const db = getDb();
      const { membership } = await seedScimUser(db, `active-${crypto.randomUUID().slice(0, 8)}`);

      const res = await patch(
        membership.id,
        JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "active", value: false }]
        }),
        "application/scim+json"
      );

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).active).toBe(false);

      const [row] = await db(TableName.Membership).where({ id: membership.id }).select("isActive");
      expect(row.isActive).toBe(false);
    });

    // CVE-2026-48170: scim-patch below 0.9.1 walks into Object.prototype when a patch
    // path or value carries __proto__, constructor or prototype. Both content types are
    // covered because only application/json goes through the proto-rejecting parser;
    // application/scim+json is parsed with JSON.parse, so scim-patch is the sole guard.
    test.each(["application/scim+json", "application/json"])(
      "should not pollute Object.prototype via %s",
      async (contentType) => {
        const db = getDb();
        const { membership } = await seedScimUser(db, `proto-${crypto.randomUUID().slice(0, 8)}`);
        const canary = `scimCanary${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

        const vectors = [
          `{"Operations":[{"op":"add","path":"__proto__.${canary}","value":"polluted"}]}`,
          `{"Operations":[{"op":"add","value":{"__proto__":{"${canary}":"polluted"}}}]}`,
          `{"Operations":[{"op":"add","path":"constructor.prototype.${canary}","value":"polluted"}]}`,
          `{"Operations":[{"op":"replace","path":"__proto__.${canary}","value":"polluted"}]}`
        ];

        try {
          for (const body of vectors) {
            await patch(membership.id, body, contentType);
            expect(Object.prototype).not.toHaveProperty(canary);
          }

          expect(({} as Record<string, unknown>)[canary]).toBeUndefined();
        } finally {
          delete (Object.prototype as unknown as Record<string, unknown>)[canary];
        }
      }
    );
  });

  describe("Provisioned email changes", () => {
    const seedUser = async (db: Knex, label: string, email?: string) => {
      const [user] = await db(TableName.Users)
        .insert({
          email: email ?? `scim-email-${label}@${TEST_DOMAIN}`,
          username: `scim-email-${label}@${TEST_DOMAIN}`,
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

      await db(TableName.MembershipRole).insert({ membershipId: membership.id, role: "member" });

      const [alias] = await db(TableName.UserAliases)
        .insert({
          userId: user.id,
          orgId: ORG_ID,
          aliasType: "saml",
          externalId: `scim-email-ext-${label}`,
          emails: [user.username]
        })
        .returning("*");

      return { user, membership, alias };
    };

    // Entra addresses the mailbox through a filter path rather than an index.
    const patchEmail = (membershipId: string, newEmail: string) =>
      testServer.inject({
        method: "PATCH",
        url: `/api/v1/scim/Users/${membershipId}`,
        headers: { authorization: `Bearer ${scimToken}`, "content-type": "application/scim+json" },
        payload: JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: 'emails[type eq "work"].value', value: newEmail }]
        })
      });

    const putUser = (membershipId: string, externalId: string, newEmail: string) =>
      testServer.inject({
        method: "PUT",
        url: `/api/v1/scim/Users/${membershipId}`,
        headers: { authorization: `Bearer ${scimToken}`, "content-type": "application/scim+json" },
        payload: JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: externalId,
          name: { givenName: "Robert", familyName: "Smith" },
          emails: [{ primary: true, value: newEmail }],
          active: true
        })
      });

    afterEach(async () => {
      await getDb()(TableName.Organization).where({ id: ORG_ID }).update({ authEnforced: false });
    });

    test("should reject an email change when the org does not enforce SSO", async () => {
      const db = getDb();
      const label = `norename-${crypto.randomUUID().slice(0, 8)}`;
      const { user, membership } = await seedUser(db, label);

      const res = await patchEmail(membership.id, `renamed-${label}@${TEST_DOMAIN}`);

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).mutability).toBe("immutable");

      const [row] = await db(TableName.Users).where({ id: user.id }).select("username");
      expect(row.username).toBe(user.username);
    });

    test("should apply a PATCH email change when the org enforces SSO", async () => {
      const db = getDb();
      const label = `patch-${crypto.randomUUID().slice(0, 8)}`;
      const { user, membership, alias } = await seedUser(db, label);
      const newEmail = `renamed-${label}@${TEST_DOMAIN}`;

      await db(TableName.Organization).where({ id: ORG_ID }).update({ authEnforced: true });

      const res = await patchEmail(membership.id, newEmail);

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).emails[0].value).toBe(newEmail);

      const [row] = await db(TableName.Users).where({ id: user.id }).select("username", "email", "isEmailVerified");
      expect(row.username).toBe(newEmail);
      expect(row.email).toBe(newEmail);
      // Account recovery gates on this flag, so a directory write must not leave the new mailbox
      // able to claim a password reset. The next SSO login re-verifies it.
      expect(row.isEmailVerified).toBe(false);

      // The old address stays on the alias so a login in flight from before the rename still resolves.
      const [aliasRow] = await db(TableName.UserAliases).where({ id: alias.id }).select("emails");
      expect(aliasRow.emails).toEqual([user.username, newEmail]);
    });

    test("should apply a PUT email change when the org enforces SSO", async () => {
      const db = getDb();
      const label = `put-${crypto.randomUUID().slice(0, 8)}`;
      const { user, membership } = await seedUser(db, label);
      const newEmail = `renamed-${label}@${TEST_DOMAIN}`;

      await db(TableName.Organization).where({ id: ORG_ID }).update({ authEnforced: true });

      const res = await putUser(membership.id, `scim-email-ext-${label}`, newEmail);

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).emails[0].value).toBe(newEmail);

      const [row] = await db(TableName.Users).where({ id: user.id }).select("username", "email", "isEmailVerified");
      expect(row.username).toBe(newEmail);
      expect(row.email).toBe(newEmail);
      expect(row.isEmailVerified).toBe(false);
    });

    test("should apply an unrelated PATCH when the stored email and username have drifted", async () => {
      const db = getDb();
      const label = `drift-${crypto.randomUUID().slice(0, 8)}`;
      const { user, membership } = await seedUser(db, label, `drifted-${label}@${TEST_DOMAIN}`);

      const res = await testServer.inject({
        method: "PATCH",
        url: `/api/v1/scim/Users/${membership.id}`,
        headers: { authorization: `Bearer ${scimToken}`, "content-type": "application/scim+json" },
        payload: JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "active", value: false }]
        })
      });

      // Deprovisioning names no mailbox, so it must not trip the immutable-email refusal.
      expect(res.statusCode).toBe(200);

      const [row] = await db(TableName.Membership).where({ id: membership.id }).select("isActive");
      expect(row.isActive).toBe(false);

      const [userRow] = await db(TableName.Users).where({ id: user.id }).select("username");
      expect(userRow.username).toBe(user.username);
    });

    test("should reject an address outside the organization's verified domains", async () => {
      const db = getDb();
      const label = `unverified-${crypto.randomUUID().slice(0, 8)}`;
      const { user, membership } = await seedUser(db, label);

      await db(TableName.Organization).where({ id: ORG_ID }).update({ authEnforced: true });

      const res = await patchEmail(membership.id, `renamed-${label}@not-verified.local`);

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.scimType).toBe("invalidValue");
      expect(body.schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");

      const [row] = await db(TableName.Users).where({ id: user.id }).select("username");
      expect(row.username).toBe(user.username);
    });

    test("should report a conflict when the new address is already another account", async () => {
      const db = getDb();
      const label = `conflict-${crypto.randomUUID().slice(0, 8)}`;
      const { user, membership } = await seedUser(db, label);
      const { user: occupant } = await seedUser(db, `occupant-${label}`);

      await db(TableName.Organization).where({ id: ORG_ID }).update({ authEnforced: true });

      const res = await patchEmail(membership.id, occupant.username);

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.payload).scimType).toBe("uniqueness");

      const [row] = await db(TableName.Users).where({ id: user.id }).select("username");
      expect(row.username).toBe(user.username);
    });

    test("should take the primary address when the assertion carries several", async () => {
      const db = getDb();
      const label = `multi-${crypto.randomUUID().slice(0, 8)}`;
      const { user, membership } = await seedUser(db, label);
      const primaryEmail = `renamed-${label}@${TEST_DOMAIN}`;
      const secondaryEmail = `alias-${label}@${TEST_DOMAIN}`;

      await db(TableName.Organization).where({ id: ORG_ID }).update({ authEnforced: true });

      const res = await testServer.inject({
        method: "PATCH",
        url: `/api/v1/scim/Users/${membership.id}`,
        headers: { authorization: `Bearer ${scimToken}`, "content-type": "application/scim+json" },
        payload: JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [
            {
              op: "replace",
              path: "emails",
              // The mailbox we key on is not first, which is what the PUT handler already accounts for.
              value: [
                { primary: false, value: secondaryEmail, type: "home" },
                { primary: true, value: primaryEmail, type: "work" }
              ]
            }
          ]
        })
      });

      expect(res.statusCode).toBe(200);

      const [row] = await db(TableName.Users).where({ id: user.id }).select("username", "email");
      expect(row.username).toBe(primaryEmail);
      expect(row.email).toBe(primaryEmail);
    });
  });
});
