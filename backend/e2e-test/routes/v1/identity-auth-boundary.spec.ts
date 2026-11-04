/**
 * The gap these cover: repointing an identity's auth trust (attach/update), revoking it, or minting
 * a token for it all let the caller authenticate *as* that identity. The action check alone was
 * enough, so an actor holding only `identity:edit-auth` could take over an Admin-role identity.
 *
 * The boundary added for this only bites on the legacy privilege system. Under the new system
 * holding the action IS the authorization, so every operation below must still pass — that half is
 * a regression guard, not an aspiration.
 *
 * Every test drives the reach as a machine identity rather than the seeded admin user, so the
 * actor's role is exactly what the assertion is about.
 */

import { packRules } from "@casl/ability/extra";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const ORG_ID = seedData1.organization.id;

const adminHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });
const asIdentity = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * Picks the boundary semantics: false => the actor must dominate the target's privileges, true =>
 * holding the action is enough. Defaults to true, so both branches need exercising explicitly.
 */
const setNewPrivilegeSystem = async (enabled: boolean) => {
  await testDb(TableName.Organization).where({ id: ORG_ID }).update({ shouldUseNewPrivilegeSystem: enabled });
};

/**
 * Written straight to the table because the e2e license mock reports `rbac: false` and the
 * custom-role routes refuse to create one. The boundary reads these same columns either way.
 */
const insertRole = async (slug: string, permissions: object[], scope: { orgId: string } | { projectId: string }) => {
  const [role] = await testDb(TableName.Role)
    .insert({ name: slug, slug, permissions: JSON.stringify(packRules(permissions as never)), ...scope })
    .returning("id");

  return (role as { id: string }).id;
};

const findMembership = async (actorIdentityId: string, scope: { scopeProjectId?: string }) => {
  const membership = await testDb(TableName.Membership)
    .where({
      scope: scope.scopeProjectId ? AccessScope.Project : AccessScope.Organization,
      scopeOrgId: ORG_ID,
      actorIdentityId,
      ...(scope.scopeProjectId ? { scopeProjectId: scope.scopeProjectId } : {})
    })
    .first();
  expect(membership).toBeDefined();
  return (membership as { id: string }).id;
};

/** Repoint an existing membership at a custom role, replacing the built-in role it was created with. */
const useCustomRole = async (membershipId: string, customRoleId: string) => {
  await testDb(TableName.MembershipRole).where({ membershipId }).delete();
  await testDb(TableName.MembershipRole).insert({ membershipId, role: "custom", customRoleId });
};

const createOrgIdentity = async (name: string, role: OrgMembershipRole) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    headers: adminHeaders(),
    body: { name, role, organizationId: ORG_ID }
  });
  expect(res.statusCode).toBe(200);
  return res.json().identity.id as string;
};

const deleteIdentity = (identityId: string) =>
  testServer.inject({ method: "DELETE", url: `/api/v1/identities/${identityId}`, headers: adminHeaders() });

/** Attaches Universal Auth and logs in, so the identity can act as the caller. */
const loginAsIdentity = async (identityId: string) => {
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

  const loginRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: { clientId, clientSecret: csRes.json().clientSecret }
  });
  expect(loginRes.statusCode).toBe(200);
  return loginRes.json().accessToken as string;
};

// The four guarded operations. Each is the *first* thing the route does after the plain action
// check, so a 403 here is the boundary and anything else means it let the actor through.
const attachTokenAuth = (identityId: string, headers: Record<string, string>) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/auth/token-auth/identities/${identityId}`,
    headers,
    body: { accessTokenTTL: 2592000, accessTokenMaxTTL: 2592000, accessTokenNumUsesLimit: 0 }
  });

const updateTokenAuth = (identityId: string, headers: Record<string, string>) =>
  testServer.inject({
    method: "PATCH",
    url: `/api/v1/auth/token-auth/identities/${identityId}`,
    headers,
    body: { accessTokenTTL: 1800 }
  });

const createTokenAuthToken = (identityId: string, headers: Record<string, string>) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/auth/token-auth/identities/${identityId}/tokens`,
    headers,
    body: { name: "e2e-token" }
  });

const revokeTokenAuth = (identityId: string, headers: Record<string, string>) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/auth/token-auth/identities/${identityId}`,
    headers
  });

/** Detach token auth so the same target can be re-attached by the next test. */
const resetTokenAuth = async (identityId: string) => {
  await revokeTokenAuth(identityId, adminHeaders());
};

const AUTH_EDITOR_PERMISSIONS = [
  { subject: "identity", action: ["read", "create", "edit", "edit-auth", "revoke-auth", "create-token"] }
];

describe("Privilege boundary on organization-scoped identity auth", () => {
  let actor: { identityId: string; token: string };
  let peerTarget: string;
  let adminTarget: string;
  let groupTarget: string;
  let dominatedTarget: string;
  let groupId: string;

  beforeAll(async () => {
    const actorIdentityId = await createOrgIdentity("e2e-iab-actor", OrgMembershipRole.Member);
    const token = await loginAsIdentity(actorIdentityId);
    actor = { identityId: actorIdentityId, token };

    // The actor legitimately holds every guarded action, and nothing else. That is the shape the
    // boundary is about: real reach, yet weaker than the targets below.
    const authEditorRoleId = await insertRole("e2e-iab-auth-editor", AUTH_EDITOR_PERMISSIONS, { orgId: ORG_ID });
    await useCustomRole(await findMembership(actorIdentityId, {}), authEditorRoleId);

    peerTarget = await createOrgIdentity("e2e-iab-peer-target", OrgMembershipRole.Member);
    adminTarget = await createOrgIdentity("e2e-iab-admin-target", OrgMembershipRole.Admin);

    // No-access directly, Admin only by group inheritance. The direct role has to be one the actor
    // out-ranks, or the boundary trips on it and the assertion below passes whether or not the
    // group-derived membership was ever resolved. `resolveMembershipRoleSlugs` drops no-access, so
    // the inherited Admin is the only grant this target contributes.
    groupTarget = await createOrgIdentity("e2e-iab-group-target", OrgMembershipRole.NoAccess);
    const [group] = await testDb(TableName.Groups)
      .insert({ orgId: ORG_ID, name: "e2e-iab-admin-group", slug: "e2e-iab-admin-group" })
      .returning("id");
    groupId = (group as { id: string }).id;
    await testDb(TableName.IdentityGroupMembership).insert({ identityId: groupTarget, groupId });
    const [groupMembership] = await testDb(TableName.Membership)
      .insert({ scope: AccessScope.Organization, scopeOrgId: ORG_ID, actorGroupId: groupId })
      .returning("id");
    await testDb(TableName.MembershipRole).insert({
      membershipId: (groupMembership as { id: string }).id,
      role: OrgMembershipRole.Admin
    });

    // The control for every 403 below: same no-access starting point, nothing added. If this one
    // stops returning 200 the other targets are being refused for their base role and the fixtures
    // above have stopped proving anything.
    dominatedTarget = await createOrgIdentity("e2e-iab-dominated-target", OrgMembershipRole.NoAccess);
  });

  afterAll(async () => {
    await testDb(TableName.Groups).where({ id: groupId }).delete();
    await Promise.all(
      [actor.identityId, peerTarget, adminTarget, groupTarget, dominatedTarget].map((id) => deleteIdentity(id))
    );
    await testDb(TableName.Role).where({ slug: "e2e-iab-auth-editor", orgId: ORG_ID }).delete();
  });

  test("the actor does hold the guarded actions, so the reach is real", async () => {
    // Attaching to an equal-privilege target succeeds, which is what makes the assertions below
    // boundary checks rather than plain missing-permission rejections.
    const attachRes = await attachTokenAuth(peerTarget, asIdentity(actor.token));
    expect(attachRes.statusCode).toBe(200);

    const updateRes = await updateTokenAuth(peerTarget, asIdentity(actor.token));
    expect(updateRes.statusCode).toBe(200);

    const tokenRes = await createTokenAuthToken(peerTarget, asIdentity(actor.token));
    expect(tokenRes.statusCode).toBe(200);

    const revokeRes = await revokeTokenAuth(peerTarget, asIdentity(actor.token));
    expect(revokeRes.statusCode).toBe(200);
  });

  describe("on the legacy privilege system", () => {
    beforeAll(() => setNewPrivilegeSystem(false));
    afterAll(() => setNewPrivilegeSystem(true));

    test("the actor cannot attach token auth to an Admin-role identity", async () => {
      const res = await attachTokenAuth(adminTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");
    });

    test("the actor cannot update token auth of an Admin-role identity", async () => {
      await attachTokenAuth(adminTarget, adminHeaders());

      const res = await updateTokenAuth(adminTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");
    });

    test("the actor cannot mint a token for an Admin-role identity", async () => {
      const res = await createTokenAuthToken(adminTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");
    });

    test("the actor cannot revoke token auth of an Admin-role identity", async () => {
      const res = await revokeTokenAuth(adminTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");

      await resetTokenAuth(adminTarget);
    });

    test("a target that is Admin only through a group is still out of reach", async () => {
      const res = await attachTokenAuth(groupTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");
    });

    test("a target the actor does out-rank stays reachable", async () => {
      const res = await attachTokenAuth(dominatedTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(200);

      await resetTokenAuth(dominatedTarget);
    });

    test("an admin can still drive every guarded operation", async () => {
      expect((await attachTokenAuth(adminTarget, adminHeaders())).statusCode).toBe(200);
      expect((await updateTokenAuth(adminTarget, adminHeaders())).statusCode).toBe(200);
      expect((await createTokenAuthToken(adminTarget, adminHeaders())).statusCode).toBe(200);
      expect((await revokeTokenAuth(adminTarget, adminHeaders())).statusCode).toBe(200);
    });
  });

  describe("on the new privilege system", () => {
    // Deliberate, not an oversight: under the new system holding the action IS the authorization, so
    // these pass regardless of the target's roles. You narrow it with conditions on the action, not
    // with a privilege comparison. This is the default, so most orgs get an inert boundary here.
    afterAll(() => resetTokenAuth(adminTarget));

    test("the actor can attach and update token auth on an Admin-role identity", async () => {
      expect((await attachTokenAuth(adminTarget, asIdentity(actor.token))).statusCode).toBe(200);
      expect((await updateTokenAuth(adminTarget, asIdentity(actor.token))).statusCode).toBe(200);
    });

    test("the actor can mint a token for an Admin-role identity", async () => {
      expect((await createTokenAuthToken(adminTarget, asIdentity(actor.token))).statusCode).toBe(200);
    });

    test("the actor can revoke token auth of an Admin-role identity", async () => {
      expect((await revokeTokenAuth(adminTarget, asIdentity(actor.token))).statusCode).toBe(200);
    });

    test("group inheritance on the target changes nothing", async () => {
      expect((await attachTokenAuth(groupTarget, asIdentity(actor.token))).statusCode).toBe(200);

      await resetTokenAuth(groupTarget);
    });
  });
});

describe("Privilege boundary on project-scoped identity auth", () => {
  // Project-level identities (identities.projectId set) take the project branch of the guard, which
  // had no boundary at all before this change — the org branch was the only one that checked.
  let project: { id: string };
  let actor: { identityId: string; token: string };
  let peerTarget: string;
  let adminTarget: string;
  let privilegeTarget: string;
  let dominatedTarget: string;

  const createProjectIdentity = async (name: string, role: ProjectMembershipRole) => {
    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/identities`,
      headers: adminHeaders(),
      body: { name, roles: [{ role }] }
    });
    expect(res.statusCode).toBe(200);
    return res.json().identity.id as string;
  };

  beforeAll(async () => {
    const createProjectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders(),
      body: { projectName: "e2e-identity-auth-boundary" }
    });
    expect(createProjectRes.statusCode).toBe(200);
    project = createProjectRes.json().project;

    const actorIdentityId = await createProjectIdentity("e2e-iab-proj-actor", ProjectMembershipRole.Member);
    const token = await loginAsIdentity(actorIdentityId);
    actor = { identityId: actorIdentityId, token };

    const authEditorRoleId = await insertRole("e2e-iab-proj-auth-editor", AUTH_EDITOR_PERMISSIONS, {
      projectId: project.id
    });
    await useCustomRole(await findMembership(actorIdentityId, { scopeProjectId: project.id }), authEditorRoleId);

    peerTarget = await createProjectIdentity("e2e-iab-proj-peer", ProjectMembershipRole.Member);
    adminTarget = await createProjectIdentity("e2e-iab-proj-admin", ProjectMembershipRole.Admin);

    // Project scope is where an identity additional privilege is actually reachable: the org factory
    // refuses every operation, while every project created before the legacy-privileges migration
    // carries `isLegacyAdditionalPrivilegesEnabled`. Written straight to the table because a project
    // created here defaults the flag off, the same reason the roles above bypass their routes.
    //
    // No-access base role, so the privilege is the only grant the target contributes and the 403 can
    // only be the privilege. `delete` is the action closest to what the actor holds that it lacks.
    privilegeTarget = await createProjectIdentity("e2e-iab-proj-privilege", ProjectMembershipRole.NoAccess);
    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-iab-proj-broad-privilege",
      actorIdentityId: privilegeTarget,
      projectId: project.id,
      permissions: JSON.stringify(packRules([{ subject: "identity", action: ["delete"] }] as never))
    });

    dominatedTarget = await createProjectIdentity("e2e-iab-proj-dominated", ProjectMembershipRole.NoAccess);
  });

  afterAll(async () => {
    await Promise.all(
      [actor.identityId, peerTarget, adminTarget, privilegeTarget, dominatedTarget].map((id) => deleteIdentity(id))
    );
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}`,
      headers: adminHeaders()
    });
  });

  test("the actor does hold the guarded actions, so the reach is real", async () => {
    expect((await attachTokenAuth(peerTarget, asIdentity(actor.token))).statusCode).toBe(200);
    expect((await createTokenAuthToken(peerTarget, asIdentity(actor.token))).statusCode).toBe(200);
    expect((await revokeTokenAuth(peerTarget, asIdentity(actor.token))).statusCode).toBe(200);
  });

  describe("on the legacy privilege system", () => {
    beforeAll(() => setNewPrivilegeSystem(false));
    afterAll(() => setNewPrivilegeSystem(true));

    test("the actor cannot attach token auth to a project Admin identity", async () => {
      const res = await attachTokenAuth(adminTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");
    });

    test("the actor cannot mint a token for a project Admin identity", async () => {
      await attachTokenAuth(adminTarget, adminHeaders());

      const res = await createTokenAuthToken(adminTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");
    });

    test("the actor cannot revoke token auth of a project Admin identity", async () => {
      const res = await revokeTokenAuth(adminTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");

      await resetTokenAuth(adminTarget);
    });

    test("a target whose extra reach comes from an additional privilege is still out of reach", async () => {
      const res = await attachTokenAuth(privilegeTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");
    });

    test("the same target without that privilege stays reachable", async () => {
      const res = await attachTokenAuth(dominatedTarget, asIdentity(actor.token));
      expect(res.statusCode).toBe(200);

      await resetTokenAuth(dominatedTarget);
    });
  });

  describe("on the new privilege system", () => {
    test("the actor can drive every guarded operation on a project Admin identity", async () => {
      expect((await attachTokenAuth(adminTarget, asIdentity(actor.token))).statusCode).toBe(200);
      expect((await updateTokenAuth(adminTarget, asIdentity(actor.token))).statusCode).toBe(200);
      expect((await createTokenAuthToken(adminTarget, asIdentity(actor.token))).statusCode).toBe(200);
      expect((await revokeTokenAuth(adminTarget, asIdentity(actor.token))).statusCode).toBe(200);
    });

    test("an additional privilege on the target changes nothing", async () => {
      expect((await attachTokenAuth(privilegeTarget, asIdentity(actor.token))).statusCode).toBe(200);

      await resetTokenAuth(privilegeTarget);
    });
  });
});

/**
 * The client-secret paths were the half of the auth surface the first pass missed: bounded in the
 * org branch, unbounded in the project branch. That asymmetry let an actor holding only
 * `identity:delete-token` on one project identity revoke an Admin identity's credentials, while
 * being refused when it tried to create one — a boundary that fires on create and not on revoke.
 */
describe("Privilege boundary on project-scoped Universal Auth client secrets", () => {
  let project: { id: string };
  let actor: { identityId: string; token: string };
  let adminTarget: string;

  const createProjectIdentity = async (name: string, role: ProjectMembershipRole) => {
    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/identities`,
      headers: adminHeaders(),
      body: { name, roles: [{ role }] }
    });
    expect(res.statusCode).toBe(200);
    return res.json().identity.id as string;
  };

  const attachUniversalAuth = (identityId: string) =>
    testServer.inject({
      method: "POST",
      url: `/api/v1/auth/universal-auth/identities/${identityId}`,
      headers: adminHeaders(),
      body: { accessTokenTTL: 2592000, accessTokenMaxTTL: 2592000, accessTokenNumUsesLimit: 0 }
    });

  const createClientSecret = (identityId: string, headers: Record<string, string>) =>
    testServer.inject({
      method: "POST",
      url: `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`,
      headers,
      body: {}
    });

  const listClientSecrets = (identityId: string, headers: Record<string, string>) =>
    testServer.inject({
      method: "GET",
      url: `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`,
      headers
    });

  const revokeClientSecret = (identityId: string, clientSecretId: string, headers: Record<string, string>) =>
    testServer.inject({
      method: "POST",
      url: `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets/${clientSecretId}/revoke`,
      headers,
      body: {}
    });

  beforeAll(async () => {
    const createProjectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders(),
      body: { projectName: "e2e-identity-auth-boundary-ua" }
    });
    expect(createProjectRes.statusCode).toBe(200);
    project = createProjectRes.json().project;

    const actorIdentityId = await createProjectIdentity("e2e-iab-ua-actor", ProjectMembershipRole.Member);
    const token = await loginAsIdentity(actorIdentityId);
    actor = { identityId: actorIdentityId, token };

    // Holds every client-secret action, so a refusal below is the boundary and not a missing action.
    const roleId = await insertRole(
      "e2e-iab-ua-secret-manager",
      [{ subject: "identity", action: ["read", "create", "edit", "create-token", "get-token", "delete-token"] }],
      { projectId: project.id }
    );
    await useCustomRole(await findMembership(actorIdentityId, { scopeProjectId: project.id }), roleId);

    adminTarget = await createProjectIdentity("e2e-iab-ua-admin", ProjectMembershipRole.Admin);
    expect((await attachUniversalAuth(adminTarget)).statusCode).toBe(200);
  });

  afterAll(async () => {
    await Promise.all([actor.identityId, adminTarget].map((id) => deleteIdentity(id)));
    // Deleting the project cascades the custom role; deleting the role directly races the
    // membership_roles rows that still reference it.
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}`,
      headers: adminHeaders()
    });
  });

  describe("on the legacy privilege system", () => {
    beforeAll(() => setNewPrivilegeSystem(false));
    afterAll(() => setNewPrivilegeSystem(true));

    test("the actor cannot revoke a client secret of a project Admin identity", async () => {
      // Minted as an admin, because the actor is refused on create under this same boundary.
      const created = await createClientSecret(adminTarget, adminHeaders());
      expect(created.statusCode).toBe(200);
      const clientSecretId = created.json().clientSecretData.id as string;

      const res = await revokeClientSecret(adminTarget, clientSecretId, asIdentity(actor.token));
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("more privileged role");

      // The refusal has to be a no-op, not just a non-200.
      const row = await testDb(TableName.IdentityUaClientSecret).where({ id: clientSecretId }).first();
      expect((row as { isClientSecretRevoked: boolean }).isClientSecretRevoked).toBe(false);
    });

    test("the actor cannot list or create client secrets of a project Admin identity", async () => {
      const listed = await listClientSecrets(adminTarget, asIdentity(actor.token));
      expect(listed.statusCode).toBe(403);
      expect(listed.json().message).toContain("more privileged role");

      const created = await createClientSecret(adminTarget, asIdentity(actor.token));
      expect(created.statusCode).toBe(403);
      expect(created.json().message).toContain("more privileged role");
    });
  });

  describe("on the new privilege system", () => {
    // Holding the action is the authorization here, so all three pass regardless of the target's roles.
    test("the actor can create, list and revoke client secrets of a project Admin identity", async () => {
      const created = await createClientSecret(adminTarget, asIdentity(actor.token));
      expect(created.statusCode).toBe(200);

      expect((await listClientSecrets(adminTarget, asIdentity(actor.token))).statusCode).toBe(200);

      const revoked = await revokeClientSecret(
        adminTarget,
        created.json().clientSecretData.id as string,
        asIdentity(actor.token)
      );
      expect(revoked.statusCode).toBe(200);
    });
  });
});
