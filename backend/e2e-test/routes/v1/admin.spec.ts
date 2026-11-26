import { randomUUID } from "node:crypto";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { LoginMethod, OVERRIDABLE_ENV_KEYS, type TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { SuperAdminErrorCode } from "@app/services/super-admin/super-admin-types";

// registerRoutes publishes its services for the e2e suite; writes through the service also refresh the shared cache.
const instanceConfig = () =>
  (globalThis as unknown as { testServices: { instanceConfigService: TInstanceConfigService } }).testServices
    .instanceConfigService;

// The service can neither mark the instance uninitialized nor set up one already set up, so these write the row and
// drop the shared copy.
const dropSharedCopy = () => testRedis.del("infisical-admin-cfg");

const markUninitialized = async () => {
  await testDb(TableName.SuperAdmin).update({ initialized: false });
  await dropSharedCopy();
};

const restoreSetUpWithOpenSignUp = async () => {
  await testDb(TableName.SuperAdmin).update({ initialized: true, allowSignUp: true });
  await dropSharedCopy();
};

const updateServerConfig = (body: Record<string, unknown>) =>
  testServer.inject({
    method: "PATCH",
    url: "/api/v1/admin/config",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body
  });

describe("Admin V1 Router", () => {
  describe("admin signup", () => {
    let signupEmail: string;
    let organizationName: string;
    let createdUserId: string | undefined;
    let createdOrganizationId: string | undefined;

    beforeEach(async () => {
      signupEmail = `admin-signup-${randomUUID()}@localhost.local`;
      organizationName = `Admin Org ${randomUUID()}`;
      createdUserId = undefined;
      createdOrganizationId = undefined;

      await markUninitialized();
    });

    afterEach(async () => {
      const organization =
        createdOrganizationId ??
        (await testDb(TableName.Organization).where({ name: organizationName }).first<{ id: string }>("id"))?.id;
      const user =
        createdUserId ?? (await testDb(TableName.Users).where({ email: signupEmail }).first<{ id: string }>("id"))?.id;

      if (organization) {
        await testDb(TableName.Organization).where({ id: organization }).delete();
      }
      if (user) {
        await testDb(TableName.Users).where({ id: user }).delete();
      }

      await restoreSetUpWithOpenSignUp();
    });

    test("creates the initial organization with the supplied name", async () => {
      const response = await testServer.inject({
        method: "POST",
        url: "/api/v1/admin/signup",
        body: {
          email: signupEmail,
          password: "TestInfisical@123",
          firstName: "Admin",
          lastName: "User",
          organizationName
        }
      });

      expect(response.statusCode).toBe(200);

      const payload = response.json();
      createdUserId = payload.user.id;
      createdOrganizationId = payload.organization.id;

      expect(payload.organization.name).toBe(organizationName);
    });

    test("uses the default organization name when the field is omitted", async () => {
      organizationName = "Admin Org";

      const response = await testServer.inject({
        method: "POST",
        url: "/api/v1/admin/signup",
        body: {
          email: signupEmail,
          password: "TestInfisical@123",
          firstName: "Admin",
          lastName: "User"
        }
      });

      expect(response.statusCode).toBe(200);

      const payload = response.json();
      createdUserId = payload.user.id;
      createdOrganizationId = payload.organization.id;

      expect(payload.organization.name).toBe(organizationName);
    });

    test("reports that no setup token is required when none is configured", async () => {
      const response = await testServer.inject({ method: "GET", url: "/api/v1/admin/config" });

      expect(response.statusCode).toBe(200);
      expect(response.json().config.isInstanceSetupTokenRequired).toBe(false);
    });
  });

  describe("instance bootstrap", () => {
    const email = `admin-bootstrap-${randomUUID()}@localhost.local`;
    const organizationName = `Bootstrap Org ${randomUUID()}`;
    let adminIdentityIdsBefore: string[] | null = null;

    beforeEach(async () => {
      adminIdentityIdsBefore =
        (await testDb(TableName.SuperAdmin).first<{ adminIdentityIds: string[] | null }>("adminIdentityIds"))
          ?.adminIdentityIds ?? null;
      await markUninitialized();
    });

    afterEach(async () => {
      await testDb(TableName.Organization).where({ name: organizationName }).delete();
      await testDb(TableName.Users).where({ email }).delete();
      await testDb(TableName.SuperAdmin).update({ adminIdentityIds: adminIdentityIdsBefore });
      await restoreSetUpWithOpenSignUp();
    });

    test("creates the admin, organization and admin identity, then refuses a second bootstrap", async () => {
      const response = await testServer.inject({
        method: "POST",
        url: "/api/v1/admin/bootstrap",
        body: { email, password: "TestInfisical@123", organization: organizationName }
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.organization.name).toBe(organizationName);
      expect(payload.identity.credentials.token).toEqual(expect.any(String));
      expect(await instanceConfig().isInstanceAdminIdentity(payload.identity.id)).toBe(true);
      expect((await instanceConfig().getSettings()).initialized).toBe(true);

      const second = await testServer.inject({
        method: "POST",
        url: "/api/v1/admin/bootstrap",
        body: { email: `second-${email}`, password: "TestInfisical@123", organization: `${organizationName} 2` }
      });

      expect(second.statusCode).toBe(400);
      expect(
        await testDb(TableName.Users)
          .where({ email: `second-${email}` })
          .first()
      ).toBeUndefined();
    });
  });

  describe("allowed signup domains", () => {
    afterEach(async () => {
      await instanceConfig().updateConfig({ allowedSignUpDomain: null });
    });

    test("normalizes valid domains before persisting them", async () => {
      const response = await updateServerConfig({
        allowedSignUpDomain: " @Example.com, example.com, Team.Example.com "
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().config.allowedSignUpDomain).toBe("example.com, team.example.com");
    });

    test.each(["example", "https://example.com", ","])("rejects an invalid domain list: %s", async (domains) => {
      const response = await updateServerConfig({
        allowedSignUpDomain: domains
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe("server config lockout protection", () => {
    test("returns a stable error code when login methods would lock out the super admin", async () => {
      const response = await updateServerConfig({ enabledLoginMethods: [LoginMethod.GOOGLE] });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: SuperAdminErrorCode.AuthMethodLockout
      });
    });
  });

  describe("server config unrecognized fields", () => {
    test("rejects a body that only contains removed fields", async () => {
      const response = await updateServerConfig({ trustSamlEmails: true });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("No recognized instance configuration fields were provided");
    });
  });

  describe("overridable env values", () => {
    const privateKeyCanary = `override-canary-${randomUUID()}`;
    let storedOverrides: Buffer | null | undefined;

    beforeAll(async () => {
      storedOverrides = (
        await testDb(TableName.SuperAdmin).first<{ encryptedEnvOverrides: Buffer | null }>("encryptedEnvOverrides")
      )?.encryptedEnvOverrides;
      const response = await updateServerConfig({
        envOverrides: { INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY: privateKeyCanary }
      });
      expect(response.statusCode).toBe(200);
    });

    afterAll(async () => {
      await testDb(TableName.SuperAdmin).update({ encryptedEnvOverrides: storedOverrides ?? null });
      await dropSharedCopy();
    });

    const expectNoOverridableValues = (body: string) => {
      expect(OVERRIDABLE_ENV_KEYS.filter((key) => body.includes(key))).toEqual([]);
      expect(body).not.toContain(privateKeyCanary);
    };

    test("the super admin's instance config does not expose them", async () => {
      const response = await testServer.inject({
        method: "GET",
        url: "/api/v1/admin/config",
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(response.statusCode).toBe(200);
      expectNoOverridableValues(response.body);
    });

    test("an anonymous caller's instance config does not expose them", async () => {
      const response = await testServer.inject({ method: "GET", url: "/api/v1/admin/config" });

      expect(response.statusCode).toBe(200);
      expectNoOverridableValues(response.body);
    });

    test("the status endpoint does not expose them", async () => {
      const response = await testServer.inject({ method: "GET", url: "/api/status" });

      expect(response.statusCode).toBe(200);
      expectNoOverridableValues(response.body);
    });
  });

  describe("env overrides take effect on the next request", () => {
    let storedOverrides: Buffer | null | undefined;
    let createdShareIds: string[] = [];

    beforeEach(async () => {
      createdShareIds = [];
      storedOverrides = (
        await testDb(TableName.SuperAdmin).first<{ encryptedEnvOverrides: Buffer | null }>("encryptedEnvOverrides")
      )?.encryptedEnvOverrides;
    });

    afterEach(async () => {
      // The public share id is the row's hex identifier, base64url encoded.
      const identifiers = createdShareIds.map((id) => Buffer.from(id, "base64url").toString("hex"));
      if (identifiers.length) await testDb(TableName.SecretSharing).whereIn("identifier", identifiers).delete();
      await testDb(TableName.SuperAdmin).update({ encryptedEnvOverrides: storedOverrides ?? null });
      await dropSharedCopy();
    });

    const createPublicShare = () =>
      testServer.inject({
        method: "POST",
        url: "/api/v1/shared-secrets/public",
        body: { secretValue: "e2e-public-share", expiresIn: "1h" }
      });

    test("disabling public secret sharing refuses the next public share and re-enabling allows it", async () => {
      const disable = await updateServerConfig({ envOverrides: { DISABLE_PUBLIC_SECRET_SHARING: "true" } });
      expect(disable.statusCode).toBe(200);

      const refused = await createPublicShare();
      expect(refused.statusCode).toBe(400);
      expect(refused.json().message).toContain("Public secret sharing is disabled");

      const enable = await updateServerConfig({ envOverrides: { DISABLE_PUBLIC_SECRET_SHARING: "" } });
      expect(enable.statusCode).toBe(200);

      const allowed = await createPublicShare();
      expect(allowed.statusCode).toBe(200);
      createdShareIds.push(allowed.json().id);
      expect(allowed.json().id).toEqual(expect.any(String));
    });

    test("an env override key an admin cannot override is rejected by the request schema", async () => {
      const response = await updateServerConfig({ envOverrides: { SALT_ROUNDS: "4" } });

      expect(response.statusCode).toBe(422);
      expect(response.body).toContain("envOverrides");
    });
  });

  describe("slack credentials cannot be cleared", () => {
    let storedSlack: { encryptedSlackClientId: Buffer | null; encryptedSlackClientSecret: Buffer | null } | undefined;

    beforeEach(async () => {
      storedSlack = await testDb(TableName.SuperAdmin).first<{
        encryptedSlackClientId: Buffer | null;
        encryptedSlackClientSecret: Buffer | null;
      }>("encryptedSlackClientId", "encryptedSlackClientSecret");
    });

    afterEach(async () => {
      await testDb(TableName.SuperAdmin).update({
        encryptedSlackClientId: storedSlack?.encryptedSlackClientId ?? null,
        encryptedSlackClientSecret: storedSlack?.encryptedSlackClientSecret ?? null
      });
      await dropSharedCopy();
    });

    test("an empty slack client id is refused by name and the stored value is kept", async () => {
      const set = await updateServerConfig({ slackClientId: "e2e-slack-id" });
      expect(set.statusCode).toBe(200);

      const cleared = await updateServerConfig({ slackClientId: "" });
      expect(cleared.statusCode).toBe(400);
      expect(cleared.json().message).toContain("Slack client ID cannot be empty");

      const integrations = await testServer.inject({
        method: "GET",
        url: "/api/v1/admin/integrations",
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
      expect(integrations.statusCode).toBe(200);
      expect(integrations.json().slack.clientId).toBe("e2e-slack-id");
    });
  });

  describe("identity super admin access", () => {
    test("revoking an identity that is not a super admin is refused", async () => {
      expect(await instanceConfig().isInstanceAdminIdentity(seedData1.machineIdentity.id)).toBe(false);

      const response = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/admin/identity-management/identities/${seedData1.machineIdentity.id}/super-admin-access`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe("Identity does not have super admin access");
    });
  });
});
