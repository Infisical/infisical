import jsrp from "jsrp";
import knex, { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AuthMethod } from "@app/services/auth/auth-type";
import { UserAuthenticationType } from "@app/services/user-authentication/user-authentication-types";
import { DomainVerificationStatus } from "@app/ee/services/domain-sso-connector/domain-sso-connector-types";

/**
 * E2E tests for the domain-based auth login flow.
 *
 * Key concepts:
 * - Users have a UserAuthentication record (1:1) with `type`, `externalId`, and `domain`.
 * - The UserAuthentication.type is the enforcement mechanism — if type is oidc, email/password login is blocked.
 * - selectOrganization no longer checks org-level authEnforced; enforcement is at login time.
 * - DomainSsoConnector governs a domain — when verified and taken over, all users on that domain
 *   get their auth records swapped (type changes, externalId set to null).
 */

// -- Helper: perform the SRP login1/login2 handshake and return the access token --
const performSrpLogin = async () => {
  // eslint-disable-next-line
  const client = new jsrp.client();
  await new Promise((resolve) => {
    client.init({ username: seedData1.email, password: seedData1.password }, () => resolve(null));
  });

  const login1Res = await testServer.inject({
    method: "POST",
    url: "/api/v3/auth/login1",
    body: {
      email: seedData1.email,
      clientPublicKey: client.getPublicKey()
    }
  });

  expect(login1Res.statusCode).toBe(200);
  const login1Payload = JSON.parse(login1Res.payload);
  client.setSalt(login1Payload.salt);
  client.setServerPublicKey(login1Payload.serverPublicKey);

  const clientProof = client.getProof();

  const login2Res = await testServer.inject({
    method: "POST",
    url: "/api/v3/auth/login2",
    body: {
      email: seedData1.email,
      clientProof
    }
  });

  expect(login2Res.statusCode).toBe(200);
  const login2Payload = JSON.parse(login2Res.payload);
  return login2Payload.token as string;
};

// -- Helper: create a standalone Knex client for direct DB manipulation --
// The test environment creates the DB internally but doesn't expose it on a global.
// We create our own connection using the same env vars.
let db: Knex;

beforeAll(() => {
  db = knex({
    client: "pg",
    connection: {
      connectionString: process.env.DB_CONNECTION_URI,
      ssl: process.env.DB_ROOT_CERT
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(process.env.DB_ROOT_CERT, "base64").toString("ascii")
          }
        : false
    }
  });
});

afterAll(async () => {
  await db.destroy();
});

describe("Login V3 Router — Domain-Based Auth", () => {
  // ------------------------------------------------------------------
  // Test 1: Email/password login succeeds for a user with type = 'email'
  // ------------------------------------------------------------------
  describe("Email/password login (SRP)", () => {
    test("succeeds when UserAuthentication.type is email", async () => {
      // Ensure the seed user has a UserAuthentication record with type=email
      await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
      await db(TableName.UserAuthentication).insert({
        userId: seedData1.id,
        type: UserAuthenticationType.EMAIL,
        externalId: null,
        domain: seedData1.email.split("@")[1]
      });

      try {
        const token = await performSrpLogin();
        expect(token).toBeTruthy();
        expect(typeof token).toBe("string");
      } finally {
        // Clean up the auth record
        await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
      }
    });
  });

  // ------------------------------------------------------------------
  // Test 2: Email/password login is blocked when type = 'oidc'
  // ------------------------------------------------------------------
  describe("Email/password login blocked for SSO users", () => {
    test("returns error when UserAuthentication.type is oidc", async () => {
      // Set the user's auth type to OIDC
      await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
      await db(TableName.UserAuthentication).insert({
        userId: seedData1.id,
        type: UserAuthenticationType.OIDC,
        externalId: null,
        domain: seedData1.email.split("@")[1]
      });

      try {
        // eslint-disable-next-line
        const client = new jsrp.client();
        await new Promise((resolve) => {
          client.init({ username: seedData1.email, password: seedData1.password }, () => resolve(null));
        });

        // login1 should be blocked because UserAuthentication.type is oidc
        const login1Res = await testServer.inject({
          method: "POST",
          url: "/api/v3/auth/login1",
          body: {
            email: seedData1.email,
            clientPublicKey: client.getPublicKey()
          }
        });

        // The service throws BadRequestError when type !== email and no providerAuthToken
        expect(login1Res.statusCode).toBe(400);
        const payload = JSON.parse(login1Res.payload);
        expect(payload.message).toBe("Invalid login credentials");
      } finally {
        // Clean up: remove the OIDC auth record so other tests are not affected
        await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
      }
    });
  });

  // ------------------------------------------------------------------
  // Test 3: selectOrganization works regardless of org's authEnforced flag
  // ------------------------------------------------------------------
  describe("selectOrganization", () => {
    test("succeeds regardless of org authEnforced flag", async () => {
      // Ensure the user has an email auth record so SRP login works
      await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
      await db(TableName.UserAuthentication).insert({
        userId: seedData1.id,
        type: UserAuthenticationType.EMAIL,
        externalId: null,
        domain: seedData1.email.split("@")[1]
      });

      try {
        // Set authEnforced to true on the org — this should NOT block selectOrganization
        await db(TableName.Organization)
          .where({ id: seedData1.organization.id })
          .update({ authEnforced: true });

        // First, get a valid access token via SRP login
        const token = await performSrpLogin();
        expect(token).toBeTruthy();

        // Now call selectOrganization — should succeed even with authEnforced=true
        const selectOrgRes = await testServer.inject({
          method: "POST",
          url: "/api/v3/auth/select-organization",
          headers: {
            authorization: `Bearer ${token}`,
            "user-agent": "test-e2e-agent"
          },
          body: {
            organizationId: seedData1.organization.id
          }
        });

        expect(selectOrgRes.statusCode).toBe(200);
        const selectOrgPayload = JSON.parse(selectOrgRes.payload);
        expect(selectOrgPayload).toHaveProperty("token");
        expect(selectOrgPayload.isMfaEnabled).toBe(false);
      } finally {
        // Reset authEnforced back to false
        await db(TableName.Organization)
          .where({ id: seedData1.organization.id })
          .update({ authEnforced: false });
        await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
      }
    });
  });

  // ------------------------------------------------------------------
  // Test 4: selectOrganization still enforces MFA when user has MFA enabled
  // ------------------------------------------------------------------
  describe("selectOrganization with MFA", () => {
    test("returns MFA token when user has MFA enabled", async () => {
      // Ensure the user has an email auth record so SRP login works
      await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
      await db(TableName.UserAuthentication).insert({
        userId: seedData1.id,
        type: UserAuthenticationType.EMAIL,
        externalId: null,
        domain: seedData1.email.split("@")[1]
      });

      try {
        // Enable MFA on the user
        await db(TableName.Users)
          .where({ id: seedData1.id })
          .update({ isMfaEnabled: true, selectedMfaMethod: "email" });

        // Get a valid access token via SRP login
        const token = await performSrpLogin();
        expect(token).toBeTruthy();

        // Call selectOrganization — should return MFA challenge
        const selectOrgRes = await testServer.inject({
          method: "POST",
          url: "/api/v3/auth/select-organization",
          headers: {
            authorization: `Bearer ${token}`,
            "user-agent": "test-e2e-agent"
          },
          body: {
            organizationId: seedData1.organization.id
          }
        });

        expect(selectOrgRes.statusCode).toBe(200);
        const selectOrgPayload = JSON.parse(selectOrgRes.payload);
        expect(selectOrgPayload.isMfaEnabled).toBe(true);
        expect(selectOrgPayload).toHaveProperty("token");
        expect(selectOrgPayload.mfaMethod).toBe("email");
      } finally {
        // Disable MFA on the user
        await db(TableName.Users)
          .where({ id: seedData1.id })
          .update({ isMfaEnabled: false, selectedMfaMethod: null });
        await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
      }
    });
  });

  // ------------------------------------------------------------------
  // Test 5: Domain takeover flow
  // ------------------------------------------------------------------
  describe("Domain takeover flow", () => {
    const testDomain = "localhost.local";

    test("create connector, verify it, trigger takeover — users get auth records swapped", async () => {
      // Ensure the seed user has an email-type auth record on the test domain
      await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
      await db(TableName.UserAuthentication).insert({
        userId: seedData1.id,
        type: UserAuthenticationType.EMAIL,
        externalId: "original-external-id",
        domain: testDomain
      });

      try {
        // Step 1: Create a domain SSO connector via the API
        const createRes = await testServer.inject({
          method: "POST",
          url: "/api/v1/domain-sso-connectors",
          headers: {
            authorization: `Bearer ${jwtAuthToken}`
          },
          body: {
            domain: testDomain,
            type: AuthMethod.OIDC
          }
        });

        expect(createRes.statusCode).toBe(200);
        const { connector } = JSON.parse(createRes.payload);
        expect(connector).toHaveProperty("id");
        expect(connector.domain).toBe(testDomain);
        expect(connector.verificationStatus).toBe(DomainVerificationStatus.PENDING);
        expect(connector.verificationToken).toBeTruthy();

        const connectorId = connector.id;

        // Step 2: Verify the domain.
        // In a real scenario, we'd set up a DNS TXT record. In E2E, we simulate this
        // by directly updating the connector's verification status in the DB,
        // since we cannot control DNS resolution in the test environment.
        await db(TableName.DomainSsoConnector).where({ id: connectorId }).update({
          verificationStatus: DomainVerificationStatus.VERIFIED,
          verifiedAt: new Date()
        });

        // Confirm the DB was updated
        const verifiedConnector = await db(TableName.DomainSsoConnector).where({ id: connectorId }).first();
        expect(verifiedConnector?.verificationStatus).toBe(DomainVerificationStatus.VERIFIED);

        // Step 3: Trigger domain takeover via the API
        const takeoverRes = await testServer.inject({
          method: "POST",
          url: `/api/v1/domain-sso-connectors/${connectorId}/takeover`,
          headers: {
            authorization: `Bearer ${jwtAuthToken}`
          }
        });

        expect(takeoverRes.statusCode).toBe(200);
        const takeoverPayload = JSON.parse(takeoverRes.payload);
        expect(takeoverPayload.message).toContain("takeover");

        // Step 4: Verify that the user's auth record was swapped
        const updatedAuth = await db(TableName.UserAuthentication)
          .where({ userId: seedData1.id })
          .first();

        expect(updatedAuth).toBeTruthy();
        // The type should now match the connector's type (OIDC)
        expect(updatedAuth!.type).toBe(AuthMethod.OIDC);
        // externalId should be null — user needs to complete their first SSO login
        expect(updatedAuth!.externalId).toBeNull();
        // Domain should still be the same
        expect(updatedAuth!.domain).toBe(testDomain);

        // Step 5: Verify that email/password login is now blocked for this user
        // eslint-disable-next-line
        const client = new jsrp.client();
        await new Promise((resolve) => {
          client.init({ username: seedData1.email, password: seedData1.password }, () => resolve(null));
        });

        const loginAfterTakeoverRes = await testServer.inject({
          method: "POST",
          url: "/api/v3/auth/login1",
          body: {
            email: seedData1.email,
            clientPublicKey: client.getPublicKey()
          }
        });

        expect(loginAfterTakeoverRes.statusCode).toBe(400);
        const blockedPayload = JSON.parse(loginAfterTakeoverRes.payload);
        expect(blockedPayload.message).toContain("oidc");

        // Clean up: delete the connector
        const deleteRes = await testServer.inject({
          method: "DELETE",
          url: `/api/v1/domain-sso-connectors/${connectorId}`,
          headers: {
            authorization: `Bearer ${jwtAuthToken}`
          }
        });
        expect(deleteRes.statusCode).toBe(200);
      } finally {
        // Clean up: restore the user's auth record to email
        await db(TableName.UserAuthentication).where({ userId: seedData1.id }).del();
        // Also clean up any stray domain connectors
        await db(TableName.DomainSsoConnector).where({ domain: testDomain }).del();
      }
    });
  });
});
