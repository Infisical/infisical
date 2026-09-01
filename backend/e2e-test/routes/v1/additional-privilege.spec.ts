import { OrgMembershipRole, TableName, TemporaryPermissionMode } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const v2Permissions = [{ subject: "secrets", action: "read" }];
const v1Permissions = [{ action: "read", subject: "secrets" }];

const expectCreateRejected = (res: { statusCode: number; json: () => { message?: string } }) => {
  expect(res.statusCode).toBe(400);
  expect(res.json().message).toContain("Additional privileges are not available");
};

describe("Additional privileges disabled on new projects", () => {
  let project: { id: string; name: string; slug: string };
  let identityId: string;
  let projectMembershipId: string;

  beforeAll(async () => {
    const createProjectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(),
      body: { projectName: "e2e-legacy-ap-disabled" }
    });
    expect(createProjectRes.statusCode).toBe(200);
    project = createProjectRes.json().project;

    const getProjectRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders()
    });
    expect(getProjectRes.statusCode).toBe(200);
    expect(getProjectRes.json().project.isLegacyAdditionalPrivilegesEnabled).toBe(false);

    const createIdentityRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/identities",
      headers: authHeaders(),
      body: {
        name: "e2e-legacy-ap-disabled-identity",
        role: OrgMembershipRole.Admin,
        organizationId: seedData1.organization.id
      }
    });
    expect(createIdentityRes.statusCode).toBe(200);
    identityId = createIdentityRes.json().identity.id;

    const addIdentityRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/memberships/identities/${identityId}`,
      headers: authHeaders(),
      body: { roles: [{ role: "admin" }] }
    });
    expect(addIdentityRes.statusCode).toBe(200);

    const membershipRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/memberships/details`,
      headers: authHeaders(),
      body: { username: seedData1.username }
    });
    expect(membershipRes.statusCode).toBe(200);
    projectMembershipId = membershipRes.json().membership.id;
  });

  afterAll(async () => {
    if (identityId) {
      await testServer.inject({
        method: "DELETE",
        url: `/api/v1/identities/${identityId}`,
        headers: authHeaders()
      });
    }
    if (project) {
      await testServer.inject({
        method: "DELETE",
        url: `/api/v1/projects/${project.id}`,
        headers: authHeaders()
      });
    }
  });

  test("POST /api/v1/user-project-additional-privilege", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/user-project-additional-privilege",
      headers: authHeaders(),
      body: {
        projectMembershipId,
        permissions: v2Permissions,
        type: { isTemporary: false }
      }
    });
    expectCreateRejected(res);
  });

  test("POST /api/v1/additional-privilege/identity/permanent", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/additional-privilege/identity/permanent",
      headers: authHeaders(),
      body: {
        identityId,
        projectSlug: project.slug,
        permissions: v1Permissions
      }
    });
    expectCreateRejected(res);
  });

  test("POST /api/v1/additional-privilege/identity/temporary", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/additional-privilege/identity/temporary",
      headers: authHeaders(),
      body: {
        identityId,
        projectSlug: project.slug,
        permissions: v1Permissions,
        temporaryMode: TemporaryPermissionMode.Relative,
        temporaryRange: "1h",
        temporaryAccessStartTime: new Date().toISOString()
      }
    });
    expectCreateRejected(res);
  });

  test("POST /api/v2/identity-project-additional-privilege", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v2/identity-project-additional-privilege",
      headers: authHeaders(),
      body: {
        identityId,
        projectId: project.id,
        permissions: v2Permissions,
        type: { isTemporary: false }
      }
    });
    expectCreateRejected(res);
  });

  test("does not persist any additional privilege rows", async () => {
    expect(await testDb(TableName.AdditionalPrivilege).where({ projectId: project.id })).toEqual([]);
  });
});
