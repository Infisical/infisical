import jwt from "jsonwebtoken";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  ProjectType,
  TableName
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

import { createIdentityActor } from "../../testUtils/identities";

// A sub-org can hold a machine identity only through a group linked in from the root org. Such an
// identity gets project access through that group, so it must not be assignable to a sub-org project
// on its own.
const rootOrgId = seedData1.organization.id;
const GROUP_ONLY_MESSAGE = "only through a group";

describe("Sub-org project assignment of identities that belong only through a group", () => {
  let subOrgId: string;
  let subOrgProjectId: string;
  let groupId: string;
  let subOrgJwt: string;
  let directIdentityId: string;
  let groupOnlyIdentityId: string;
  let unrelatedIdentityId: string;
  const insertedMembershipIds: string[] = [];

  const insertMembership = async (
    row: {
      scope: AccessScope;
      scopeOrgId: string;
      scopeProjectId?: string;
      actorUserId?: string;
      actorIdentityId?: string;
      actorGroupId?: string;
      status?: OrgMembershipStatus;
    },
    role: OrgMembershipRole | ProjectMembershipRole
  ) => {
    const [membership] = await testDb(TableName.Membership)
      .insert({ isActive: true, ...row })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role });
    insertedMembershipIds.push(membership.id);
    return membership.id;
  };

  const assignUrl = (identityId: string) => `/api/v1/projects/${subOrgProjectId}/memberships/identities/${identityId}`;

  const projectMembershipRows = (identityId: string) =>
    testDb(TableName.Membership).where({
      scope: AccessScope.Project,
      scopeProjectId: subOrgProjectId,
      actorIdentityId: identityId
    });

  beforeAll(async () => {
    const suffix = alphaNumericNanoId(8).toLowerCase();
    const [subOrg] = await testDb(TableName.Organization)
      .insert({
        name: `group-only-suborg-${suffix}`,
        slug: `group-only-suborg-${suffix}`,
        parentOrgId: rootOrgId,
        rootOrgId
      })
      .returning("*");
    subOrgId = subOrg.id;

    const [project] = await testDb(TableName.Project)
      .insert({
        name: `group-only-proj-${suffix}`,
        slug: `group-only-proj-${suffix}`,
        orgId: subOrgId,
        type: ProjectType.SecretManager
      })
      .returning("*");
    subOrgProjectId = project.id;

    await insertMembership(
      {
        scope: AccessScope.Organization,
        scopeOrgId: subOrgId,
        actorUserId: seedData1.id,
        status: OrgMembershipStatus.Accepted
      },
      OrgMembershipRole.Admin
    );
    await insertMembership(
      { scope: AccessScope.Project, scopeOrgId: subOrgId, scopeProjectId: subOrgProjectId, actorUserId: seedData1.id },
      ProjectMembershipRole.Admin
    );

    ({ identityId: directIdentityId } = await createIdentityActor({ orgId: rootOrgId, authToken: jwtAuthToken }));
    ({ identityId: groupOnlyIdentityId } = await createIdentityActor({ orgId: rootOrgId, authToken: jwtAuthToken }));
    ({ identityId: unrelatedIdentityId } = await createIdentityActor({ orgId: rootOrgId, authToken: jwtAuthToken }));

    await insertMembership(
      { scope: AccessScope.Organization, scopeOrgId: subOrgId, actorIdentityId: directIdentityId },
      OrgMembershipRole.NoAccess
    );

    const groupSlug = `group-only-grp-${suffix}`;
    const [group] = await testDb(TableName.Groups)
      .insert({ orgId: rootOrgId, name: groupSlug, slug: groupSlug })
      .returning("*");
    groupId = group.id;
    await insertMembership(
      { scope: AccessScope.Organization, scopeOrgId: rootOrgId, actorGroupId: groupId },
      OrgMembershipRole.NoAccess
    );
    await insertMembership(
      { scope: AccessScope.Organization, scopeOrgId: subOrgId, actorGroupId: groupId },
      OrgMembershipRole.NoAccess
    );
    await testDb(TableName.IdentityGroupMembership).insert({ identityId: groupOnlyIdentityId, groupId });

    subOrgJwt = jwt.sign(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: seedData1.id,
        tokenVersionId: seedData1.token.id,
        authMethod: AuthMethod.EMAIL,
        organizationId: rootOrgId,
        subOrganizationId: subOrgId,
        accessVersion: 1
      },
      process.env.AUTH_SECRET as string,
      { expiresIn: 3600 }
    );
  });

  afterAll(async () => {
    const identityIds = [directIdentityId, groupOnlyIdentityId, unrelatedIdentityId];
    await testDb(TableName.IdentityGroupMembership).where({ groupId }).del();
    const projectMembershipIds = await testDb(TableName.Membership)
      .where({ scopeProjectId: subOrgProjectId })
      .pluck("id");
    const allMembershipIds = [...insertedMembershipIds, ...projectMembershipIds];
    await testDb(TableName.MembershipRole).whereIn("membershipId", allMembershipIds).del();
    await testDb(TableName.Membership).whereIn("id", allMembershipIds).del();
    await testDb(TableName.Groups).where({ id: groupId }).del();
    for (const identityId of identityIds) {
      // eslint-disable-next-line no-await-in-loop
      await testServer.inject({
        method: "DELETE",
        url: `/api/v1/identities/${identityId}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
    }
    await testDb(TableName.Project).where({ id: subOrgProjectId }).del();
    await testDb(TableName.Organization).where({ id: subOrgId }).del();
  });

  test("rejects individually assigning an identity that belongs to the sub-org only through a group", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: assignUrl(groupOnlyIdentityId),
      headers: { authorization: `Bearer ${subOrgJwt}` },
      body: { roles: [{ role: ProjectMembershipRole.Viewer }] }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain(GROUP_ONLY_MESSAGE);
    expect(await projectMembershipRows(groupOnlyIdentityId)).toHaveLength(0);
  });

  test("assigns an identity that is a direct member of the sub-org", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: assignUrl(directIdentityId),
      headers: { authorization: `Bearer ${subOrgJwt}` },
      body: { roles: [{ role: ProjectMembershipRole.Viewer }] }
    });

    expect(res.statusCode).toBe(200);
    expect(await projectMembershipRows(directIdentityId)).toHaveLength(1);
  });

  test("reports a missing membership, not a group, for an identity unrelated to the sub-org", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: assignUrl(unrelatedIdentityId),
      headers: { authorization: `Bearer ${subOrgJwt}` },
      body: { roles: [{ role: ProjectMembershipRole.Viewer }] }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("missing organization membership");
    expect(res.json().message).not.toContain(GROUP_ONLY_MESSAGE);
  });

  // A group-only identity can still hold an individual project row written before the rule existed.
  describe("legacy individual membership of a group-only identity", () => {
    let legacyMembershipId: string;

    beforeAll(async () => {
      legacyMembershipId = await insertMembership(
        {
          scope: AccessScope.Project,
          scopeOrgId: subOrgId,
          scopeProjectId: subOrgProjectId,
          actorIdentityId: groupOnlyIdentityId
        },
        ProjectMembershipRole.Viewer
      );
    });

    test("rejects changing its roles", async () => {
      const res = await testServer.inject({
        method: "PATCH",
        url: assignUrl(groupOnlyIdentityId),
        headers: { authorization: `Bearer ${subOrgJwt}` },
        body: { roles: [{ role: ProjectMembershipRole.Admin, isTemporary: false }] }
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain(GROUP_ONLY_MESSAGE);
      const roles = await testDb(TableName.MembershipRole).where({ membershipId: legacyMembershipId }).pluck("role");
      expect(roles).toEqual([ProjectMembershipRole.Viewer]);
    });

    test("still lets an admin remove it", async () => {
      const res = await testServer.inject({
        method: "DELETE",
        url: assignUrl(groupOnlyIdentityId),
        headers: { authorization: `Bearer ${subOrgJwt}` }
      });

      expect(res.statusCode).toBe(200);
      expect(await projectMembershipRows(groupOnlyIdentityId)).toHaveLength(0);
    });
  });
});
