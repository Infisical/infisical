import crypto from "node:crypto";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";

export const createProjectGroup = async (dto: { orgId: string; projectId: string; userIds: string[] }) => {
  const slug = `group-${crypto.randomUUID().slice(0, 8)}`;
  const [group] = (await testDb(TableName.Groups)
    .insert({ orgId: dto.orgId, name: slug, slug })
    .returning(["id", "name", "slug"])) as { id: string; name: string; slug: string }[];

  const [orgMembership] = await testDb(TableName.Membership)
    .insert({ scope: AccessScope.Organization, scopeOrgId: dto.orgId, actorGroupId: group.id })
    .returning("id");
  const [projectMembership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Project,
      scopeOrgId: dto.orgId,
      scopeProjectId: dto.projectId,
      actorGroupId: group.id
    })
    .returning("id");
  await testDb(TableName.MembershipRole).insert([
    { membershipId: (orgMembership as { id: string }).id, role: OrgMembershipRole.Member },
    { membershipId: (projectMembership as { id: string }).id, role: ProjectMembershipRole.Member }
  ]);

  if (dto.userIds.length) {
    await testDb(TableName.UserGroupMembership).insert(dto.userIds.map((userId) => ({ userId, groupId: group.id })));
  }

  return { ...group, orgId: dto.orgId };
};

// Inserts rows directly: the group API refuses users with no org membership, which is exactly who these specs test.
// `ownerOrgId` puts the group row in another org while its membership stays in `orgId`, the shape a parent
// org's group takes when it is linked into a sub-org.
export const createOrgGroup = async (dto: {
  orgId: string;
  ownerOrgId?: string;
  name: string;
  role: OrgMembershipRole;
  temporaryRole?: { role: OrgMembershipRole; endsAt: Date };
}) => {
  const [group] = await testDb(TableName.Groups)
    .insert({ orgId: dto.ownerOrgId ?? dto.orgId, name: dto.name, slug: dto.name })
    .returning("id");
  const groupId = (group as { id: string }).id;

  const [membership] = await testDb(TableName.Membership)
    .insert({ scope: AccessScope.Organization, scopeOrgId: dto.orgId, actorGroupId: groupId, isActive: true })
    .returning("id");
  const membershipId = (membership as { id: string }).id;

  await testDb(TableName.MembershipRole).insert([
    { membershipId, role: dto.role },
    ...(dto.temporaryRole
      ? [
          {
            membershipId,
            role: dto.temporaryRole.role,
            isTemporary: true,
            temporaryAccessEndTime: dto.temporaryRole.endsAt
          }
        ]
      : [])
  ]);

  return groupId;
};

export const addUsersToGroup = async (groupId: string, userIds: string[]) => {
  if (userIds.length === 0) return;
  await testDb(TableName.UserGroupMembership).insert(userIds.map((userId) => ({ userId, groupId })));
};

export const deleteGroups = async (groupIds: string[]) => {
  if (groupIds.length === 0) return;
  await testDb(TableName.UserGroupMembership).whereIn("groupId", groupIds).delete();
  await testDb(TableName.IdentityGroupMembership).whereIn("groupId", groupIds).delete();
  const membershipIds = await testDb(TableName.Membership).whereIn("actorGroupId", groupIds).pluck("id");
  await testDb(TableName.MembershipRole).whereIn("membershipId", membershipIds).delete();
  await testDb(TableName.Membership).whereIn("id", membershipIds).delete();
  await testDb(TableName.Groups).whereIn("id", groupIds).delete();
};

// `authToken` has to be scoped to the sub-org, the route reads the org from it.
export const linkGroupToOrg = async (dto: { groupId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/organizations/memberships/groups/${dto.groupId}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: { roles: [{ role: OrgMembershipRole.Member }] }
  });
  expect(res.statusCode).toBe(200);
};

export const unlinkGroupFromOrg = async (dto: { groupId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/organizations/memberships/groups/${dto.groupId}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });
  expect(res.statusCode).toBe(200);
};

export const removeUserFromGroup = async (dto: { groupId: string; username: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/groups/${dto.groupId}/users/${encodeURIComponent(dto.username)}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });
  expect(res.statusCode).toBe(200);
};

export const removeIdentityFromGroup = async (dto: { groupId: string; identityId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/groups/${dto.groupId}/machine-identities/${dto.identityId}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });
  expect(res.statusCode).toBe(200);
};
