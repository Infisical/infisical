/**
 * The membership *update* guard has to bound the target's current roles, not just the roles being
 * assigned.
 *
 * The update guards resolve the roles being ASSIGNED and filter NoAccess out first, so a request of
 * exactly [no-access] resolved to an empty list and nothing got checked on either privilege system.
 * Setting a member to no-access revokes their access just like a delete does, so that was a way
 * around the removal boundary:
 *
 *   DELETE an Admin target         -> 403 (bounded)
 *   PATCH  that Admin -> viewer    -> 403 (bounded, actor cannot assign viewer)
 *   PATCH  that Admin -> no-access -> 200 (unbounded)  <-- the gap
 *
 * Dropping the filter alone does not fix the legacy system: no-access grants nothing, so dominating
 * it passes trivially. The boundary has to run against the target's CURRENT roles, like the delete
 * guard already does.
 */

import crypto from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const adminHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });
const asIdentity = (token: string) => ({ authorization: `Bearer ${token}` });

const setNewPrivilegeSystem = async (enabled: boolean) => {
  await testDb(TableName.Organization)
    .where({ id: seedData1.organization.id })
    .update({ shouldUseNewPrivilegeSystem: enabled });
};

const createActorIdentity = async (name: string) => {
  const createRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    headers: adminHeaders(),
    body: { name, role: "member", organizationId: seedData1.organization.id }
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

  const csRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`,
    headers: adminHeaders(),
    body: {}
  });
  expect(csRes.statusCode).toBe(200);

  const loginRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: { clientId: attachRes.json().identityUniversalAuth.clientId, clientSecret: csRes.json().clientSecret }
  });
  expect(loginRes.statusCode).toBe(200);
  return { identityId, token: loginRes.json().accessToken as string };
};

const createTargetUser = async (label: string) => {
  const username = `${label}-${crypto.randomUUID()}@localhost.local`;
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, firstName: label, isAccepted: true, isGhost: false })
    .returning("id");
  return { userId: (user as { id: string }).id, username };
};

const giveProjectMembership = async (userId: string, projectId: string, role: ProjectMembershipRole) => {
  const [membership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Project,
      scopeOrgId: seedData1.organization.id,
      scopeProjectId: projectId,
      actorUserId: userId
    })
    .returning("id");
  const membershipId = (membership as { id: string }).id;
  await testDb(TableName.MembershipRole).insert({ membershipId, role });
  return membershipId;
};

describe("Privilege boundary on project membership downgrade", () => {
  let project: { id: string };
  let actor: { identityId: string; token: string };

  beforeAll(async () => {
    const projRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders(),
      body: { projectName: `e2e-downgrade-probe-${crypto.randomUUID()}` }
    });
    expect(projRes.statusCode).toBe(200);
    project = projRes.json().project;

    actor = await createActorIdentity(`e2e-downgrade-actor-${crypto.randomUUID()}`);

    const addRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/memberships/identities/${actor.identityId}`,
      headers: adminHeaders(),
      body: { roles: [{ role: ProjectMembershipRole.Member }] }
    });
    expect(addRes.statusCode).toBe(200);

    // A custom role holding member edit+delete and nothing else: strictly weaker than a project Admin.
    const [role] = await testDb(TableName.Role)
      .insert({
        name: "e2e-member-manager",
        slug: `e2e-member-manager-${crypto.randomUUID()}`,
        projectId: project.id,
        permissions: JSON.stringify(packRules([{ subject: "member", action: ["read", "edit", "delete"] }] as never))
      })
      .returning("id");

    const membership = await testDb(TableName.Membership)
      .where({ actorIdentityId: actor.identityId, scopeProjectId: project.id, scope: AccessScope.Project })
      .first();
    await testDb(TableName.MembershipRole)
      .where({ membershipId: (membership as { id: string }).id })
      .delete();
    await testDb(TableName.MembershipRole).insert({
      membershipId: (membership as { id: string }).id,
      role: "custom",
      customRoleId: (role as { id: string }).id
    });
  });

  afterAll(async () => {
    await setNewPrivilegeSystem(true);
    await testServer.inject({ method: "DELETE", url: `/api/v1/projects/${project.id}`, headers: adminHeaders() });
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/identities/${actor.identityId}`,
      headers: adminHeaders()
    });
  });

  describe.each([
    { label: "legacy", newSystem: false },
    { label: "new", newSystem: true }
  ])("$label privilege system", ({ newSystem }) => {
    beforeAll(async () => {
      await setNewPrivilegeSystem(newSystem);
    });

    test("baseline: DELETE on an Admin target follows the removal boundary", async () => {
      const target = await createTargetUser("del");
      const membershipId = await giveProjectMembership(target.userId, project.id, ProjectMembershipRole.Admin);

      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/projects/${project.id}/memberships/${membershipId}`,
        headers: asIdentity(actor.token)
      });
      // The new system lets this through on member:delete alone. That asymmetry is by design.
      expect(res.statusCode).toBe(newSystem ? 200 : 403);
    });

    test("setting a more privileged member to no-access is bounded, like removing them", async () => {
      const target = await createTargetUser("patch");
      const membershipId = await giveProjectMembership(target.userId, project.id, ProjectMembershipRole.Admin);

      const res = await testServer.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/memberships/${membershipId}`,
        headers: asIdentity(actor.token),
        body: { roles: [{ role: ProjectMembershipRole.NoAccess }] }
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged member");
    });

    test("regression: downgrading to a real role stays bounded", async () => {
      const target = await createTargetUser("patchv");
      const membershipId = await giveProjectMembership(target.userId, project.id, ProjectMembershipRole.Admin);

      const res = await testServer.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/memberships/${membershipId}`,
        headers: asIdentity(actor.token),
        body: { roles: [{ role: ProjectMembershipRole.Viewer }] }
      });
      expect(res.statusCode).toBe(403);
    });
  });

  test("regression: an admin can still downgrade an Admin member to no-access", async () => {
    await setNewPrivilegeSystem(false);
    const target = await createTargetUser("admin-downgrade");
    const membershipId = await giveProjectMembership(target.userId, project.id, ProjectMembershipRole.Admin);

    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/memberships/${membershipId}`,
      headers: adminHeaders(),
      body: { roles: [{ role: ProjectMembershipRole.NoAccess }] }
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("Privilege boundary on org membership downgrade", () => {
  // PATCH /api/v2/organizations/:orgId/memberships/:membershipId goes through org-service instead of
  // the scoped membership factory, and only bounded the role being ASSIGNED. Downgrading an Admin to
  // no-access, or deactivating them, assigns nothing the boundary could reject: downgrade first,
  // then remove the now-weaker member.
  let actor: { identityId: string; token: string };
  let adminTarget: { userId: string; membershipId: string };
  const targetUserIds: string[] = [];

  const roleSlug = `e2e-org-downgrader-${crypto.randomUUID()}`;

  const patchMembership = (membershipId: string, body: Record<string, unknown>, headers: Record<string, string>) =>
    testServer.inject({
      method: "PATCH",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships/${membershipId}`,
      headers,
      body
    });

  const createAdminTarget = async () => {
    const { userId } = await createTargetUser("org-downgrade");
    const [membership] = await testDb(TableName.Membership)
      .insert({ scope: AccessScope.Organization, scopeOrgId: seedData1.organization.id, actorUserId: userId })
      .returning("id");
    const membershipId = (membership as { id: string }).id;
    await testDb(TableName.MembershipRole).insert({ membershipId, role: OrgMembershipRole.Admin });
    targetUserIds.push(userId);
    return { userId, membershipId };
  };

  beforeAll(async () => {
    // member edit+delete and nothing else: the actor can legitimately reach the route, yet holds
    // strictly less than the org Admin it is pointed at.
    const [role] = await testDb(TableName.Role)
      .insert({
        name: roleSlug,
        slug: roleSlug,
        orgId: seedData1.organization.id,
        permissions: JSON.stringify(packRules([{ subject: "member", action: ["read", "edit", "delete"] }] as never))
      })
      .returning("id");

    actor = await createActorIdentity(`e2e-org-downgrade-actor-${crypto.randomUUID()}`);
    const actorMembership = await testDb(TableName.Membership)
      .where({
        actorIdentityId: actor.identityId,
        scope: AccessScope.Organization,
        scopeOrgId: seedData1.organization.id
      })
      .first();
    const actorMembershipId = (actorMembership as { id: string }).id;
    await testDb(TableName.MembershipRole).where({ membershipId: actorMembershipId }).delete();
    await testDb(TableName.MembershipRole).insert({
      membershipId: actorMembershipId,
      role: OrgMembershipRole.Custom,
      customRoleId: (role as { id: string }).id
    });

    adminTarget = await createAdminTarget();
  });

  afterAll(async () => {
    await setNewPrivilegeSystem(true);
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/identities/${actor.identityId}`,
      headers: adminHeaders()
    });
    await testDb(TableName.Membership).whereIn("actorUserId", targetUserIds).delete();
    await testDb(TableName.Users).whereIn("id", targetUserIds).delete();
    await testDb(TableName.Role).where({ slug: roleSlug }).delete();
  });

  describe.each([
    { label: "legacy", newSystem: false },
    { label: "new", newSystem: true }
  ])("$label privilege system", ({ newSystem }) => {
    beforeAll(async () => {
      await setNewPrivilegeSystem(newSystem);
    });

    test("downgrading a more privileged member to no-access is bounded", async () => {
      const res = await patchMembership(
        adminTarget.membershipId,
        { role: OrgMembershipRole.NoAccess },
        asIdentity(actor.token)
      );
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("Failed to change the roles or attributes of this org member");
    });

    test("deactivating a more privileged member is bounded on the legacy system only", async () => {
      // Deactivation keys on member:edit, which the route's own permission check already demanded, so
      // the new system has nothing further to ask. Own target, because it succeeds on one of the two runs.
      const target = await createAdminTarget();

      const res = await patchMembership(target.membershipId, { isActive: false }, asIdentity(actor.token));
      expect(res.statusCode).toBe(newSystem ? 200 : 403);
      if (!newSystem)
        expect(res.json().message).toContain("Failed to change the activation status of this org member");
    });
  });

  test("regression: an admin can still downgrade an org Admin to no-access", async () => {
    const res = await patchMembership(adminTarget.membershipId, { role: OrgMembershipRole.NoAccess }, adminHeaders());
    expect(res.statusCode).toBe(200);
  });
});
