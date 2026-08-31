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

import crypto from "node:crypto";

import { packRules } from "@casl/ability/extra";

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

/**
 * A custom role holding only the removal action. This is the actor shape the boundary is about: a
 * principal that legitimately holds `member:delete` yet is weaker than the member it is removing.
 * The built-in org and project Member roles do not hold `member:delete` at all, so they would be
 * rejected by the plain permission check and never reach the boundary.
 *
 * The role is written straight to the table because the e2e license mock reports `rbac: false`, so
 * the custom-role routes refuse to create one. That gate is not what these tests are about, and the
 * boundary resolves roles out of these same columns however they were written.
 */
const insertMemberRemoverRole = async (slug: string, scope: { orgId: string } | { projectId: string }) => {
  const [role] = await testDb(TableName.Role)
    .insert({
      name: slug,
      slug,
      permissions: JSON.stringify(packRules([{ subject: "member", action: ["read", "delete"] }])),
      ...scope
    })
    .returning("id");

  return (role as { id: string }).id;
};

/** Repoint an existing membership at a custom role, replacing the built-in role it was created with. */
const useCustomRole = async (membershipId: string, customRoleId: string) => {
  await testDb(TableName.MembershipRole).where({ membershipId }).delete();
  await testDb(TableName.MembershipRole).insert({ membershipId, role: "custom", customRoleId });
};

const findIdentityMembershipId = async (identityId: string, projectId?: string) => {
  const row = await testDb(TableName.Membership)
    .where({
      actorIdentityId: identityId,
      scopeOrgId: seedData1.organization.id,
      scope: projectId ? AccessScope.Project : AccessScope.Organization,
      ...(projectId ? { scopeProjectId: projectId } : {})
    })
    .first();
  expect(row).toBeDefined();

  return (row as { id: string }).id;
};

/**
 * The seed carries exactly one user, and every removal path here targets a *user* membership. The
 * routes only need a non-ghost Users row joined to a Membership, never a login, so the target is
 * inserted directly rather than driven through the signup and SRP flow.
 */
const createTargetUser = async (label: string) => {
  const username = `${label}-${crypto.randomUUID()}@localhost.local`;
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, firstName: label, isAccepted: true, isGhost: false })
    .returning("id");

  return { userId: (user as { id: string }).id, username };
};

const giveUserMembership = async ({
  userId,
  role,
  projectId
}: {
  userId: string;
  role: OrgMembershipRole | ProjectMembershipRole;
  projectId?: string;
}) => {
  const [membership] = await testDb(TableName.Membership)
    .insert({
      scope: projectId ? AccessScope.Project : AccessScope.Organization,
      scopeOrgId: seedData1.organization.id,
      scopeProjectId: projectId ?? null,
      actorUserId: userId
    })
    .returning("id");

  const membershipId = (membership as { id: string }).id;
  await testDb(TableName.MembershipRole).insert({ membershipId, role });
  return membershipId;
};

const dropUser = async (userId: string) => {
  await testDb(TableName.Membership).where({ actorUserId: userId }).delete();
  await testDb(TableName.Users).where({ id: userId }).delete();
};

describe("Privilege boundary on org membership removal", () => {
  // These are the v2 organization routes, which remove a member through org-service rather than
  // through the scoped membership factory. They carry the same reach as the scoped delete and so
  // need the same boundary; without it they are a way around it.
  let actor: { identityId: string; token: string };
  let adminTarget: { userId: string; membershipId: string };

  const deleteOrgMembership = (membershipId: string, headers: Record<string, string>) =>
    testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships/${membershipId}`,
      headers
    });

  const bulkDeleteOrgMemberships = (membershipIds: string[], headers: Record<string, string>) =>
    testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships`,
      headers,
      body: { membershipIds }
    });

  beforeAll(async () => {
    const roleId = await insertMemberRemoverRole("e2e-pb-org-member-remover", {
      orgId: seedData1.organization.id
    });
    actor = await createActorIdentity("e2e-pb-org-actor");
    await useCustomRole(await findIdentityMembershipId(actor.identityId), roleId);

    const target = await createTargetUser("e2e-pb-org-target");
    adminTarget = {
      userId: target.userId,
      membershipId: await giveUserMembership({ userId: target.userId, role: OrgMembershipRole.Admin })
    };
  });

  afterAll(async () => {
    await deleteIdentity(actor.identityId);
    await dropUser(adminTarget.userId);
    await testDb(TableName.Role).where({ slug: "e2e-pb-org-member-remover" }).delete();
  });

  describe("on the legacy privilege system", () => {
    beforeAll(() => setNewPrivilegeSystem(false));
    afterAll(() => setNewPrivilegeSystem(true));

    test("a member:delete-only role cannot remove an org Admin", async () => {
      const res = await deleteOrgMembership(adminTarget.membershipId, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged member");
    });

    test("the bulk route is bounded too, so it is not a way around the single-member route", async () => {
      const res = await bulkDeleteOrgMemberships([adminTarget.membershipId], asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged member");
    });

    test("an admin can still remove an org Admin", async () => {
      const res = await deleteOrgMembership(adminTarget.membershipId, adminHeaders());
      expect(res.statusCode).toBe(200);

      adminTarget.membershipId = await giveUserMembership({
        userId: adminTarget.userId,
        role: OrgMembershipRole.Admin
      });
    });
  });
});

describe("Privilege boundary on the bulk project member removal route", () => {
  // DELETE /api/v1/projects/:projectId/memberships removes members by username through
  // project-membership-service, bypassing the scoped membership factory's delete guard.
  let project: { id: string };
  let actor: { identityId: string; token: string };
  let adminTarget: { userId: string; username: string };

  const removeMembers = (usernames: string[], headers: Record<string, string>) =>
    testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/memberships`,
      headers,
      body: { usernames }
    });

  beforeAll(async () => {
    const createProjectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders(),
      body: { projectName: "e2e-privilege-boundary-bulk-remove" }
    });
    expect(createProjectRes.statusCode).toBe(200);
    project = createProjectRes.json().project;

    const roleId = await insertMemberRemoverRole("e2e-pb-project-member-remover", { projectId: project.id });
    actor = await createActorIdentity("e2e-pb-bulk-actor");
    await addIdentityToProject(project.id, actor.identityId, ProjectMembershipRole.Member);
    await useCustomRole(await findIdentityMembershipId(actor.identityId, project.id), roleId);

    const target = await createTargetUser("e2e-pb-bulk-target");
    adminTarget = target;
    await giveUserMembership({ userId: target.userId, role: OrgMembershipRole.Member });
    await giveUserMembership({
      userId: target.userId,
      role: ProjectMembershipRole.Admin,
      projectId: project.id
    });
  });

  afterAll(async () => {
    await deleteIdentity(actor.identityId);
    await dropUser(adminTarget.userId);
    await testDb(TableName.Role).where({ slug: "e2e-pb-project-member-remover" }).delete();
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}`,
      headers: adminHeaders()
    });
  });

  describe("on the legacy privilege system", () => {
    beforeAll(() => setNewPrivilegeSystem(false));
    afterAll(() => setNewPrivilegeSystem(true));

    test("a member:delete-only role cannot remove a project Admin", async () => {
      const res = await removeMembers([adminTarget.username], asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged member");
    });

    test("an admin can still remove a project Admin", async () => {
      const res = await removeMembers([adminTarget.username], adminHeaders());
      expect(res.statusCode).toBe(200);
    });
  });
});
