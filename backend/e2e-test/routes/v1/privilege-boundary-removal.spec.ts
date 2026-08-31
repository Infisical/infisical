/**
 * E2E tests for the privilege boundary on membership removal and role assignment.
 *
 * The gap these cover: the create and update guards in every membership scope factory ran a
 * privilege-boundary check, and the delete guards did not. A default project Member holds
 * `identity:delete`, so it could remove an Admin-role identity's membership -- a privilege change
 * on a principal it does not dominate.
 *
 * Each test drives the reach as a *machine identity* actor rather than the seeded admin user, so
 * the actor's role is exactly what the assertion is about.
 *
 * Prerequisites (handled by vitest-environment-knex.ts): testServer, jwtAuthToken, testDb.
 */

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const adminHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });
const asIdentity = (token: string) => ({ authorization: `Bearer ${token}` });

/** Create an org-Member identity with Universal Auth attached, and log it in. */
const createActorIdentity = async (name: string) => {
  const createRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    headers: adminHeaders(),
    body: { name, role: OrgMembershipRole.Member, organizationId: seedData1.organization.id }
  });
  expect(createRes.statusCode).toBe(200);
  const identityId = createRes.json().identity.id as string;

  const attachRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/auth/universal-auth/identities/${identityId}`,
    headers: adminHeaders(),
    body: { accessTokenTTL: 2592000, accessTokenMaxTTL: 2592000, accessTokenNumUsesLimit: 0 }
  });
  expect(attachRes.statusCode).toBe(200);
  const clientId = attachRes.json().identityUniversalAuth.clientId as string;

  const csRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`,
    headers: adminHeaders(),
    body: {}
  });
  expect(csRes.statusCode).toBe(200);
  const { clientSecret } = csRes.json();

  const loginRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: { clientId, clientSecret }
  });
  expect(loginRes.statusCode).toBe(200);

  return { identityId, token: loginRes.json().accessToken as string };
};

/** Create a bare org-level identity, with no auth method. Used as a removal target. */
const createTargetIdentity = async (name: string, role: OrgMembershipRole) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    headers: adminHeaders(),
    body: { name, role, organizationId: seedData1.organization.id }
  });
  expect(res.statusCode).toBe(200);
  return res.json().identity.id as string;
};

const deleteIdentity = async (identityId: string) => {
  await testServer.inject({
    method: "DELETE",
    url: `/api/v1/identities/${identityId}`,
    headers: adminHeaders()
  });
};

const addIdentityToProject = async (projectId: string, identityId: string, role: ProjectMembershipRole) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/memberships/identities/${identityId}`,
    headers: adminHeaders(),
    body: { roles: [{ role }] }
  });
  expect(res.statusCode).toBe(200);
};

const removeIdentityFromProject = (projectId: string, identityId: string, headers: Record<string, string>) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/${projectId}/memberships/identities/${identityId}`,
    headers
  });

/**
 * organizations.shouldUseNewPrivilegeSystem decides which of the two boundary semantics applies:
 * false => the actor must dominate the target's privileges; true => holding the action suffices.
 * It defaults to true, so both branches have to be exercised explicitly.
 */
const setNewPrivilegeSystem = async (enabled: boolean) => {
  await testDb(TableName.Organization)
    .where({ id: seedData1.organization.id })
    .update({ shouldUseNewPrivilegeSystem: enabled });
};

describe("Privilege boundary on project identity membership removal", () => {
  let project: { id: string };
  let actor: { identityId: string; token: string };
  let adminTarget: string;
  let memberTarget: string;

  beforeAll(async () => {
    const createProjectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders(),
      body: { projectName: "e2e-privilege-boundary-removal" }
    });
    expect(createProjectRes.statusCode).toBe(200);
    project = createProjectRes.json().project;

    actor = await createActorIdentity("e2e-pb-actor");
    adminTarget = await createTargetIdentity("e2e-pb-admin-target", OrgMembershipRole.Member);
    memberTarget = await createTargetIdentity("e2e-pb-member-target", OrgMembershipRole.Member);

    // The actor is a plain project Member, which holds identity:delete.
    await addIdentityToProject(project.id, actor.identityId, ProjectMembershipRole.Member);
    await addIdentityToProject(project.id, adminTarget, ProjectMembershipRole.Admin);
    await addIdentityToProject(project.id, memberTarget, ProjectMembershipRole.Member);
  });

  afterAll(async () => {
    await Promise.all([deleteIdentity(actor.identityId), deleteIdentity(adminTarget), deleteIdentity(memberTarget)]);
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}`,
      headers: adminHeaders()
    });
  });

  test("the actor does hold identity:delete, so the reach is real", async () => {
    // Removing an equal-privilege target succeeds. This is what makes the assertions below
    // boundary checks rather than plain missing-permission rejections.
    const res = await removeIdentityFromProject(project.id, memberTarget, asIdentity(actor.token));
    expect(res.statusCode).toBe(200);

    await addIdentityToProject(project.id, memberTarget, ProjectMembershipRole.Member);
  });

  describe("on the legacy privilege system", () => {
    beforeAll(() => setNewPrivilegeSystem(false));
    afterAll(() => setNewPrivilegeSystem(true));

    test("a project Member cannot remove an Admin-role identity", async () => {
      const res = await removeIdentityFromProject(project.id, adminTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged identity");
    });

    test("an admin can still remove an Admin-role identity", async () => {
      const res = await removeIdentityFromProject(project.id, adminTarget, adminHeaders());
      expect(res.statusCode).toBe(200);

      await addIdentityToProject(project.id, adminTarget, ProjectMembershipRole.Admin);
    });
  });

  describe("on the new privilege system", () => {
    // Documents the deliberate scope of the fix rather than an oversight. Under the new privilege
    // system, holding the action IS the authorization -- validatePrivilegeChangeOperation returns
    // valid as soon as the actor can perform Delete on the subject, ignoring the target's roles.
    // Narrowing this is done with conditions on the Delete action, not with a privilege comparison.
    // NOTE: organizations.shouldUseNewPrivilegeSystem defaults to true, so this is the path most
    // orgs are on, and the removal boundary is inert for them.
    test("a project Member can remove an Admin-role identity", async () => {
      const res = await removeIdentityFromProject(project.id, adminTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(200);

      await addIdentityToProject(project.id, adminTarget, ProjectMembershipRole.Admin);
    });
  });
});

describe("Privilege boundary on the deprecated v1 add-user-to-project route", () => {
  // POST /api/v1/workspace/:projectId/memberships hardcodes the built-in Member role, so the
  // boundary only bites for an actor holding member:create with LESS than Member's privileges --
  // i.e. a custom role. What is asserted here is the regression guard: the added boundary must not
  // break an admin using the route.
  let project: { id: string };

  beforeAll(async () => {
    const createProjectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders(),
      body: { projectName: "e2e-privilege-boundary-v1-add" }
    });
    expect(createProjectRes.statusCode).toBe(200);
    project = createProjectRes.json().project;
  });

  afterAll(async () => {
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}`,
      headers: adminHeaders()
    });
  });

  test("an admin passes the boundary and is rejected only as a duplicate member", async () => {
    const orgMembership = await testDb(TableName.Membership)
      .where({ scope: AccessScope.Organization, scopeOrgId: seedData1.organization.id, actorUserId: seedData1.id })
      .first();
    expect(orgMembership).toBeDefined();

    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/workspace/${project.id}/memberships`,
      headers: adminHeaders(),
      body: {
        members: [
          {
            orgMembershipId: (orgMembership as { id: string }).id,
            workspaceEncryptedKey: "encrypted-key",
            workspaceEncryptedNonce: "nonce"
          }
        ]
      }
    });

    // The project creator is already a member, so the duplicate check is what rejects this -- which
    // is downstream of the boundary, so reaching it proves the boundary let an admin through.
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("already part of project");
  });
});
