import { OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";

// Additional privileges are refused on every project created today: only projects that existed before
// the legacy-privileges migration carry isLegacyAdditionalPrivilegesEnabled, and no route sets it. The
// flag is written straight to the table so the behaviour those projects still rely on stays covered.
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { addIdentityToProject, createIdentityActor } from "e2e-test/testUtils/identities";
import { pollUntil } from "e2e-test/testUtils/poll";
import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "e2e-test/testUtils/users";

const READ_SECRETS = [{ subject: "secrets", action: ["describeSecret", "readValue"] }];

describe("Additional privileges on a legacy project", () => {
  let orgId: string;
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;
  const users: string[] = [];

  beforeAll(async () => {
    ({ orgId, projectId, authToken, cleanup } = await createIsolatedOrgAndProject("legacy-privileges"));
    await testDb(TableName.Project).where({ id: projectId }).update({ isLegacyAdditionalPrivilegesEnabled: true });
  });

  afterAll(async () => {
    await cleanup();
    await deleteUsers(users);
  });

  const listSecrets = (token: string) =>
    testServer.inject({
      method: "GET",
      url: "/api/v3/secrets/raw",
      headers: { authorization: `Bearer ${token}` },
      query: { workspaceId: projectId, environment: "dev", secretPath: "/" }
    });

  const noAccessIdentity = async () => {
    const identity = await createIdentityActor({ orgId, authToken, role: OrgMembershipRole.Member });
    await addIdentityToProject({
      projectId,
      identityId: identity.identityId,
      role: ProjectMembershipRole.NoAccess,
      authToken
    });
    return identity;
  };

  const waitForStatus = (token: string, status: number) =>
    pollUntil({
      describe: `secret listing to answer ${status}`,
      read: async () => (await listSecrets(token)).statusCode,
      done: (code) => code === status,
      timeoutMs: 20_000
    });

  test("an identity privilege grants access, and deleting it takes the access away", async () => {
    const identity = await noAccessIdentity();
    expect((await listSecrets(identity.authToken)).statusCode).toBe(403);

    const created = await testServer.inject({
      method: "POST",
      url: "/api/v2/identity-project-additional-privilege",
      headers: { authorization: `Bearer ${authToken}` },
      body: {
        identityId: identity.identityId,
        projectId,
        slug: "read-dev",
        permissions: READ_SECRETS,
        type: { isTemporary: false }
      }
    });
    expect(created.statusCode, created.payload).toBe(200);
    await waitForStatus(identity.authToken, 200);

    const deleted = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/identity-project-additional-privilege/${created.json().privilege.id as string}`,
      headers: { authorization: `Bearer ${authToken}` }
    });
    expect(deleted.statusCode, deleted.payload).toBe(200);
    await waitForStatus(identity.authToken, 403);
  }, 60_000);

  test("a user privilege grants access, and deleting it takes the access away", async () => {
    const user = await createUser("legacy-privilege-user");
    users.push(user.userId);
    await addUserMembership({ userId: user.userId, orgId, role: OrgMembershipRole.Member });
    const projectMembershipId = await addUserMembership({
      userId: user.userId,
      orgId,
      projectId,
      role: ProjectMembershipRole.NoAccess
    });
    const userToken = await createUserAccessToken({ userId: user.userId, orgId });
    expect((await listSecrets(userToken)).statusCode).toBe(403);

    const created = await testServer.inject({
      method: "POST",
      url: "/api/v1/user-project-additional-privilege",
      headers: { authorization: `Bearer ${authToken}` },
      body: { projectMembershipId, slug: "read-dev", permissions: READ_SECRETS, type: { isTemporary: false } }
    });
    expect(created.statusCode, created.payload).toBe(200);
    await waitForStatus(userToken, 200);

    const deleted = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/user-project-additional-privilege/${created.json().privilege.id as string}`,
      headers: { authorization: `Bearer ${authToken}` }
    });
    expect(deleted.statusCode, deleted.payload).toBe(200);
    await waitForStatus(userToken, 403);
  }, 60_000);

  test("a temporary privilege whose window has ended grants nothing", async () => {
    const identity = await noAccessIdentity();

    const created = await testServer.inject({
      method: "POST",
      url: "/api/v2/identity-project-additional-privilege",
      headers: { authorization: `Bearer ${authToken}` },
      body: {
        identityId: identity.identityId,
        projectId,
        slug: "expired-read",
        permissions: READ_SECRETS,
        type: {
          isTemporary: true,
          temporaryMode: "relative",
          temporaryRange: "1h",
          temporaryAccessStartTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        }
      }
    });
    expect(created.statusCode, created.payload).toBe(200);

    expect((await listSecrets(identity.authToken)).statusCode).toBe(403);
  });

  test("an actor cannot grant a privilege broader than its own", async () => {
    const actor = await createIdentityActor({ orgId, authToken, role: OrgMembershipRole.Member });
    await addIdentityToProject({
      projectId,
      identityId: actor.identityId,
      role: ProjectMembershipRole.Member,
      authToken
    });
    const target = await noAccessIdentity();

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v2/identity-project-additional-privilege",
      headers: { authorization: `Bearer ${actor.authToken}` },
      body: {
        identityId: target.identityId,
        projectId,
        slug: "too-broad",
        permissions: [{ subject: "role", action: ["create", "edit", "delete"] }],
        type: { isTemporary: false }
      }
    });

    expect(res.statusCode).toBe(403);
    const privileges = await testDb(TableName.AdditionalPrivilege).where({ actorIdentityId: target.identityId });
    expect(privileges).toHaveLength(0);
  });
});
