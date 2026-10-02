import crypto from "node:crypto";

import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { createIdentityActor } from "../../testUtils/identities";

// Infrastructure-as-code links root groups into sub-orgs with a machine identity whose session is
// scoped to the sub-org (universal auth login with organizationSlug), so the link endpoints have to
// accept identity tokens while still requiring LinkGroup on the root org.
const rootOrgId = seedData1.organization.id;

describe("Linking root groups to a sub-organization with a machine identity", () => {
  let subOrgId: string;
  let subOrgSlug: string;
  let groupId: string;
  let adminIdentityId: string;
  let memberIdentityId: string;
  let adminSubOrgToken: string;
  let memberSubOrgToken: string;
  const insertedMembershipIds: string[] = [];

  const insertMembership = async (
    row: { scopeOrgId: string; actorIdentityId?: string; actorGroupId?: string },
    role: OrgMembershipRole
  ) => {
    const [membership] = await testDb(TableName.Membership)
      .insert({ isActive: true, scope: AccessScope.Organization, ...row })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role });
    insertedMembershipIds.push(membership.id);
  };

  const loginToSubOrg = async (identityId: string) => {
    const headers = { authorization: `Bearer ${jwtAuthToken}` };
    const uaRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/auth/universal-auth/identities/${identityId}`,
      headers
    });
    expect(uaRes.statusCode).toBe(200);
    const { clientId } = uaRes.json().identityUniversalAuth as { clientId: string };

    const secretRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`,
      headers,
      body: {}
    });
    expect(secretRes.statusCode).toBe(200);

    const loginRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/universal-auth/login",
      body: { clientId, clientSecret: secretRes.json().clientSecret, organizationSlug: subOrgSlug }
    });
    expect(loginRes.statusCode).toBe(200);
    return loginRes.json().accessToken as string;
  };

  const linkUrl = () => `/api/v1/organizations/memberships/groups/${groupId}`;

  const subOrgLinkRows = () =>
    testDb(TableName.Membership).where({
      scope: AccessScope.Organization,
      scopeOrgId: subOrgId,
      actorGroupId: groupId
    });

  beforeAll(async () => {
    const suffix = alphaNumericNanoId(8).toLowerCase();
    subOrgSlug = `group-link-suborg-${suffix}`;
    const [subOrg] = await testDb(TableName.Organization)
      .insert({ name: subOrgSlug, slug: subOrgSlug, parentOrgId: rootOrgId, rootOrgId })
      .returning("*");
    subOrgId = subOrg.id;

    const groupSlug = `group-link-grp-${suffix}`;
    const [group] = await testDb(TableName.Groups)
      .insert({ orgId: rootOrgId, name: groupSlug, slug: groupSlug })
      .returning("*");
    groupId = group.id;
    await insertMembership({ scopeOrgId: rootOrgId, actorGroupId: groupId }, OrgMembershipRole.NoAccess);

    ({ identityId: adminIdentityId } = await createIdentityActor({
      orgId: rootOrgId,
      authToken: jwtAuthToken,
      role: OrgMembershipRole.Admin
    }));
    ({ identityId: memberIdentityId } = await createIdentityActor({
      orgId: rootOrgId,
      authToken: jwtAuthToken,
      role: OrgMembershipRole.Member
    }));
    await insertMembership({ scopeOrgId: subOrgId, actorIdentityId: adminIdentityId }, OrgMembershipRole.Admin);
    await insertMembership({ scopeOrgId: subOrgId, actorIdentityId: memberIdentityId }, OrgMembershipRole.Admin);

    adminSubOrgToken = await loginToSubOrg(adminIdentityId);
    memberSubOrgToken = await loginToSubOrg(memberIdentityId);
  });

  afterAll(async () => {
    const linkIds = await subOrgLinkRows().pluck("id");
    const allMembershipIds = [...insertedMembershipIds, ...linkIds];
    await testDb(TableName.MembershipRole).whereIn("membershipId", allMembershipIds).del();
    await testDb(TableName.Membership).whereIn("id", allMembershipIds).del();
    await testDb(TableName.Groups).where({ id: groupId }).del();
    for (const identityId of [adminIdentityId, memberIdentityId]) {
      // eslint-disable-next-line no-await-in-loop
      await testServer.inject({
        method: "DELETE",
        url: `/api/v1/identities/${identityId}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
    }
    await testDb(TableName.Organization).where({ id: subOrgId }).del();
  });

  test("rejects linking when the identity lacks LinkGroup on the root organization", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: linkUrl(),
      headers: { authorization: `Bearer ${memberSubOrgToken}` },
      body: { roles: [{ role: OrgMembershipRole.Member }] }
    });

    expect(res.statusCode).toBe(403);
    expect(await subOrgLinkRows()).toHaveLength(0);
  });

  test("rejects updating or unlinking an existing link when the identity lacks LinkGroup on the root organization", async () => {
    const adminHeaders = { authorization: `Bearer ${adminSubOrgToken}` };
    const memberHeaders = { authorization: `Bearer ${memberSubOrgToken}` };

    const createRes = await testServer.inject({
      method: "POST",
      url: linkUrl(),
      headers: adminHeaders,
      body: { roles: [{ role: OrgMembershipRole.NoAccess }] }
    });
    expect(createRes.statusCode).toBe(200);

    const updateRes = await testServer.inject({
      method: "PATCH",
      url: linkUrl(),
      headers: memberHeaders,
      body: { roles: [{ role: OrgMembershipRole.Member }] }
    });
    expect(updateRes.statusCode).toBe(403);

    const deleteRes = await testServer.inject({ method: "DELETE", url: linkUrl(), headers: memberHeaders });
    expect(deleteRes.statusCode).toBe(403);

    const [link] = await subOrgLinkRows();
    const roles = await testDb(TableName.MembershipRole).where({ membershipId: link.id }).pluck("role");
    expect(roles).toEqual([OrgMembershipRole.NoAccess]);

    const cleanupRes = await testServer.inject({ method: "DELETE", url: linkUrl(), headers: adminHeaders });
    expect(cleanupRes.statusCode).toBe(200);
    expect(await subOrgLinkRows()).toHaveLength(0);
  });

  test("answers a group from an unrelated organization the same as a missing one", async () => {
    const suffix = alphaNumericNanoId(8).toLowerCase();
    const [otherOrg] = await testDb(TableName.Organization)
      .insert({ name: `group-link-other-${suffix}`, slug: `group-link-other-${suffix}` })
      .returning("*");
    const [otherGroup] = await testDb(TableName.Groups)
      .insert({ orgId: otherOrg.id, name: `other-grp-${suffix}`, slug: `other-grp-${suffix}` })
      .returning("*");
    const [otherMembership] = await testDb(TableName.Membership)
      .insert({ isActive: true, scope: AccessScope.Organization, scopeOrgId: otherOrg.id, actorGroupId: otherGroup.id })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({
      membershipId: otherMembership.id,
      role: OrgMembershipRole.NoAccess
    });

    try {
      const headers = { authorization: `Bearer ${adminSubOrgToken}` };
      for (const id of [otherGroup.id, crypto.randomUUID()]) {
        const url = `/api/v1/organizations/memberships/groups/${id}`;
        // eslint-disable-next-line no-await-in-loop
        const updateRes = await testServer.inject({
          method: "PATCH",
          url,
          headers,
          body: { roles: [{ role: OrgMembershipRole.Member }] }
        });
        expect(updateRes.statusCode).toBe(404);
        expect(updateRes.json().message).toBe(`Group with ID '${id}' not found`);

        // eslint-disable-next-line no-await-in-loop
        const deleteRes = await testServer.inject({ method: "DELETE", url, headers });
        expect(deleteRes.statusCode).toBe(404);
        expect(deleteRes.json().message).toBe(`Group with ID '${id}' not found`);
      }
    } finally {
      await testDb(TableName.MembershipRole).where({ membershipId: otherMembership.id }).del();
      await testDb(TableName.Membership).where({ id: otherMembership.id }).del();
      await testDb(TableName.Groups).where({ id: otherGroup.id }).del();
      await testDb(TableName.Organization).where({ id: otherOrg.id }).del();
    }
  });

  test("refuses to unlink a group owned by the sub-organization", async () => {
    const suffix = alphaNumericNanoId(8).toLowerCase();
    const [ownedGroup] = await testDb(TableName.Groups)
      .insert({ orgId: subOrgId, name: `owned-grp-${suffix}`, slug: `owned-grp-${suffix}` })
      .returning("*");
    const [homeMembership] = await testDb(TableName.Membership)
      .insert({ isActive: true, scope: AccessScope.Organization, scopeOrgId: subOrgId, actorGroupId: ownedGroup.id })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({
      membershipId: homeMembership.id,
      role: OrgMembershipRole.NoAccess
    });

    try {
      const deleteRes = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/organizations/memberships/groups/${ownedGroup.id}`,
        headers: { authorization: `Bearer ${adminSubOrgToken}` }
      });
      expect(deleteRes.statusCode).toBe(400);
      expect(await testDb(TableName.Membership).where({ id: homeMembership.id })).toHaveLength(1);
    } finally {
      await testDb(TableName.MembershipRole).where({ membershipId: homeMembership.id }).del();
      await testDb(TableName.Membership).where({ id: homeMembership.id }).del();
      await testDb(TableName.Groups).where({ id: ownedGroup.id }).del();
    }
  });

  test("links, updates, and unlinks a root group", async () => {
    const headers = { authorization: `Bearer ${adminSubOrgToken}` };

    const createRes = await testServer.inject({
      method: "POST",
      url: linkUrl(),
      headers,
      body: { roles: [{ role: OrgMembershipRole.NoAccess }] }
    });
    expect(createRes.statusCode).toBe(200);
    expect(createRes.json().groupMembership.groupId).toBe(groupId);
    expect(await subOrgLinkRows()).toHaveLength(1);

    const updateRes = await testServer.inject({
      method: "PATCH",
      url: linkUrl(),
      headers,
      body: { roles: [{ role: OrgMembershipRole.Member }] }
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().groupMembership.roles.map((r: { role: string }) => r.role)).toEqual([
      OrgMembershipRole.Member
    ]);

    const deleteRes = await testServer.inject({ method: "DELETE", url: linkUrl(), headers });
    expect(deleteRes.statusCode).toBe(200);
    expect(await subOrgLinkRows()).toHaveLength(0);

    const getRes = await testServer.inject({ method: "GET", url: linkUrl(), headers });
    expect(getRes.statusCode).toBe(404);
  });
});
