import { randomUUID } from "node:crypto";

import { TableName } from "@app/db/schemas";
import { LoginMethod, SuperAdminErrorCode } from "@app/services/super-admin/super-admin-types";

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

      await testInstanceConfigCoreDomain.updateConfig({ initialized: false });
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

      await testInstanceConfigCoreDomain.updateConfig({ initialized: true, allowSignUp: true });
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
  });

  describe("allowed signup domains", () => {
    afterEach(async () => {
      await testInstanceConfigCoreDomain.updateConfig({ allowedSignUpDomain: null });
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
});
