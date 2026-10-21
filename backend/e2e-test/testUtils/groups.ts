import { randomUUID } from "node:crypto";

import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";

// Group creation sits behind a plan flag the license fake turns off, so the group and its org row are
// written directly.
export const createOrgGroup = async (dto: { orgId: string; label: string; role?: OrgMembershipRole }) => {
  const slug = `${dto.label}-${randomUUID().slice(0, 8)}`;
  const [group] = await testDb(TableName.Groups).insert({ orgId: dto.orgId, name: slug, slug }).returning("*");
  const [membership] = await testDb(TableName.Membership)
    .insert({ scope: AccessScope.Organization, scopeOrgId: dto.orgId, actorGroupId: group.id })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({
    membershipId: membership.id,
    role: dto.role ?? OrgMembershipRole.NoAccess
  });
  return { groupId: group.id as string, slug };
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
export const linkGroupToOrg = async (dto: { groupId: string; authToken: string; role?: OrgMembershipRole }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/organizations/memberships/groups/${dto.groupId}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: { roles: [{ role: dto.role ?? OrgMembershipRole.Member }] }
  });
  expect(res.statusCode).toBe(200);
  return res.json().groupMembership.id as string;
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
