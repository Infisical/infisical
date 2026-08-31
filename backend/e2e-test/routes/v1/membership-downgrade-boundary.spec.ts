/**
 * The membership *update* guard has to bound the target's current roles, not just the roles being
 * assigned.
 *
 * The update guards resolve `dto.data.roles` -- the roles being ASSIGNED -- and filter NoAccess out
 * before resolution. A request of exactly [no-access] therefore resolved to an empty list, the
 * boundary loop never ran, and nothing was checked on either privilege system. Since setting a
 * member to no-access revokes their access just as a delete does, that was a way around the
 * removal boundary rather than a separate concern:
 *
 *   DELETE an Admin target        -> 403 (bounded)
 *   PATCH  that Admin -> viewer   -> 403 (bounded, actor cannot assign viewer)
 *   PATCH  that Admin -> no-access-> 200 (unbounded)  <-- the gap
 *
 * Removing the filter alone does not fix the legacy system: no-access grants nothing, so
 * dominating it passes trivially. The boundary has to run against the target's CURRENT roles,
 * which is what the delete guard already does.
 */

import crypto from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, ProjectMembershipRole, TableName } from "@app/db/schemas";
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
      // Delete uses the privilege-system-aware boundary, so the new system permits it on the
      // strength of holding member:delete alone. That asymmetry is the documented design.
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
