import { randomUUID } from "node:crypto";

import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";

import { createIsolatedOrgAndProject, createProject, createSubOrgAndProject } from "../../testUtils/fixtures";
import { linkGroupToOrg } from "../../testUtils/groups";
import { addIdentityProjectMembership, createIdentityActor } from "../../testUtils/identities";
import { overrideLicenseFeatures } from "../../testUtils/license";

// Group membership counts as org membership, so removing a parent-org identity from a sub-org has to
// take it out of the sub-org's own groups too, or it keeps logging in with the group's roles. Everything
// else the sub-org granted it goes as well; only access a parent-org group gives it survives.
describe("Removing a parent-org identity from a sub-organization", () => {
  let restoreLicense: () => void;
  let cleanupRootOrg: () => Promise<void>;
  let rootOrgId: string;
  let rootToken: string;
  let subOrgToken: string;
  let subOrgSlug: string;
  let subOrgId: string;
  const createdIdentityIds: string[] = [];

  const createGroup = async (authToken: string, role?: OrgMembershipRole) => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/groups",
      headers: { authorization: `Bearer ${authToken}` },
      body: { name: `removal-grp-${randomUUID().slice(0, 8)}`, ...(role ? { role } : {}) }
    });
    expect(res.statusCode).toBe(200);
    return res.json().id as string;
  };

  const addToGroup = async (authToken: string, groupId: string, identityId: string) => {
    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/groups/${groupId}/machine-identities/${identityId}`,
      headers: { authorization: `Bearer ${authToken}` }
    });
    expect(res.statusCode).toBe(200);
  };

  const loginToSubOrg = async (identityId: string) => {
    const headers = { authorization: `Bearer ${rootToken}` };
    const uaRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/auth/universal-auth/identities/${identityId}`,
      headers
    });
    expect(uaRes.statusCode).toBe(200);
    const secretRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`,
      headers,
      body: {}
    });
    expect(secretRes.statusCode).toBe(200);

    return testServer.inject({
      method: "POST",
      url: "/api/v1/auth/universal-auth/login",
      body: {
        clientId: uaRes.json().identityUniversalAuth.clientId as string,
        clientSecret: secretRes.json().clientSecret as string,
        organizationSlug: subOrgSlug
      }
    });
  };

  const groupRows = (identityId: string, groupId: string) =>
    testDb(TableName.IdentityGroupMembership).where({ identityId, groupId });

  const addGroupToProject = (groupId: string, projectId: string) =>
    testDb(TableName.Membership).insert({
      scope: AccessScope.Project,
      scopeOrgId: subOrgId,
      scopeProjectId: projectId,
      actorGroupId: groupId
    });

  const createPrivilege = async (identityId: string, projectId: string) => {
    const [privilege] = await testDb(TableName.AdditionalPrivilege)
      .insert({
        name: `removal-priv-${randomUUID().slice(0, 8)}`,
        actorIdentityId: identityId,
        projectId,
        permissions: JSON.stringify([])
      })
      .returning("id");
    return (privilege as { id: string }).id;
  };

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ groups: true, subOrganization: true });

    const root = await createIsolatedOrgAndProject("identity-removal-groups");
    rootOrgId = root.orgId;
    rootToken = root.authToken;
    cleanupRootOrg = root.cleanup;

    const sub = await createSubOrgAndProject({ rootOrgId, namePrefix: "identity-removal-groups-sub" });
    subOrgToken = sub.authToken;
    subOrgId = sub.subOrgId;
    const [subOrg] = await testDb(TableName.Organization).where({ id: sub.subOrgId }).select("slug");
    subOrgSlug = subOrg.slug;
  });

  afterAll(async () => {
    for (const identityId of createdIdentityIds) {
      // eslint-disable-next-line no-await-in-loop
      await testServer.inject({
        method: "DELETE",
        url: `/api/v1/identities/${identityId}`,
        headers: { authorization: `Bearer ${rootToken}` }
      });
    }
    await cleanupRootOrg();
    restoreLicense();
  });

  test.each([
    {
      path: "the org identity membership route",
      url: (id: string) => `/api/v1/organization/identity-memberships/${id}`
    },
    { path: "the identity delete route", url: (id: string) => `/api/v1/identities/${id}` }
  ])(
    "through $path drops its sub-org groups, its access and every privilege the sub-org granted it",
    async ({ url }) => {
      const { identityId } = await createIdentityActor({
        orgId: rootOrgId,
        authToken: rootToken,
        role: OrgMembershipRole.NoAccess
      });
      createdIdentityIds.push(identityId);

      const linkRes = await testServer.inject({
        method: "POST",
        url: `/api/v1/organization/identity-memberships/${identityId}`,
        headers: { authorization: `Bearer ${subOrgToken}` },
        body: { roles: [{ role: OrgMembershipRole.NoAccess }] }
      });
      expect(linkRes.statusCode).toBe(200);

      const subGroupId = await createGroup(subOrgToken, OrgMembershipRole.Admin);
      const rootGroupId = await createGroup(rootToken);
      await addToGroup(subOrgToken, subGroupId, identityId);
      await addToGroup(rootToken, rootGroupId, identityId);

      const subGroupOnlyProjectId = await createProject(subOrgToken, `removal-only-${randomUUID().slice(0, 8)}`);
      const sharedProjectId = await createProject(subOrgToken, `removal-shared-${randomUUID().slice(0, 8)}`);
      await addGroupToProject(subGroupId, subGroupOnlyProjectId);
      await addGroupToProject(subGroupId, sharedProjectId);
      await addGroupToProject(rootGroupId, sharedProjectId);
      const subGroupOnlyPrivilegeId = await createPrivilege(identityId, subGroupOnlyProjectId);
      const sharedPrivilegeId = await createPrivilege(identityId, sharedProjectId);

      expect((await loginToSubOrg(identityId)).statusCode).toBe(200);

      const removeRes = await testServer.inject({
        method: "DELETE",
        url: url(identityId),
        headers: { authorization: `Bearer ${subOrgToken}` }
      });
      expect(removeRes.statusCode).toBe(200);

      expect(await groupRows(identityId, subGroupId)).toHaveLength(0);
      expect(await groupRows(identityId, rootGroupId)).toHaveLength(1);
      expect((await loginToSubOrg(identityId)).statusCode).toBe(401);
      expect(
        await testDb(TableName.AdditionalPrivilege).whereIn("id", [subGroupOnlyPrivilegeId, sharedPrivilegeId])
      ).toHaveLength(0);
    }
  );

  test("keeps the access a linked parent-org group gives it and loses the sub-org's own grants", async () => {
    const { identityId } = await createIdentityActor({
      orgId: rootOrgId,
      authToken: rootToken,
      role: OrgMembershipRole.NoAccess
    });
    createdIdentityIds.push(identityId);

    const linkRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/organization/identity-memberships/${identityId}`,
      headers: { authorization: `Bearer ${subOrgToken}` },
      body: { roles: [{ role: OrgMembershipRole.NoAccess }] }
    });
    expect(linkRes.statusCode).toBe(200);

    const linkedRootGroupId = await createGroup(rootToken);
    await addToGroup(rootToken, linkedRootGroupId, identityId);
    await linkGroupToOrg({ groupId: linkedRootGroupId, authToken: subOrgToken });

    const projectId = await createProject(subOrgToken, `removal-linked-${randomUUID().slice(0, 8)}`);
    await addGroupToProject(linkedRootGroupId, projectId);
    await addIdentityProjectMembership({ identityId, orgId: subOrgId, projectId });
    const privilegeId = await createPrivilege(identityId, projectId);

    const removeRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/organization/identity-memberships/${identityId}`,
      headers: { authorization: `Bearer ${subOrgToken}` }
    });
    expect(removeRes.statusCode).toBe(200);

    expect(await groupRows(identityId, linkedRootGroupId)).toHaveLength(1);
    expect((await loginToSubOrg(identityId)).statusCode).toBe(200);
    expect(
      await testDb(TableName.Membership).where({
        scope: AccessScope.Project,
        scopeProjectId: projectId,
        actorIdentityId: identityId
      })
    ).toHaveLength(0);
    expect(await testDb(TableName.AdditionalPrivilege).where({ id: privilegeId })).toHaveLength(0);
  });
});
