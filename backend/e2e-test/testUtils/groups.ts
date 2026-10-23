import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";

const HOUR_MS = 60 * 60 * 1000;

// Writes the rows directly: the group API only adds a user once they already hold an org membership, and
// the specs that need a group are usually testing a user whose only way into the org is the group.
export const createOrgGroup = async (dto: {
  orgId: string;
  name: string;
  role: OrgMembershipRole;
  temporaryRole?: { role: OrgMembershipRole; endsAt: Date };
}) => {
  const [group] = await testDb(TableName.Groups)
    .insert({ orgId: dto.orgId, name: dto.name, slug: dto.name })
    .returning("id");
  const groupId = (group as { id: string }).id;

  const [membership] = await testDb(TableName.Membership)
    .insert({ scope: AccessScope.Organization, scopeOrgId: dto.orgId, actorGroupId: groupId, isActive: true })
    .returning("id");
  const membershipId = (membership as { id: string }).id;

  await testDb(TableName.MembershipRole).insert({ membershipId, role: dto.role });
  if (dto.temporaryRole) {
    await testDb(TableName.MembershipRole).insert({
      membershipId,
      role: dto.temporaryRole.role,
      isTemporary: true,
      temporaryMode: "relative",
      temporaryRange: "1h",
      temporaryAccessStartTime: new Date(dto.temporaryRole.endsAt.getTime() - HOUR_MS),
      temporaryAccessEndTime: dto.temporaryRole.endsAt
    });
  }

  return groupId;
};

export const addUsersToGroup = async (groupId: string, userIds: string[]) => {
  if (userIds.length === 0) return;
  await testDb(TableName.UserGroupMembership).insert(userIds.map((userId) => ({ userId, groupId })));
};

// The org delete cascades the group rows; this is for specs that reuse a shared org.
export const deleteGroups = async (groupIds: string[]) => {
  if (groupIds.length === 0) return;
  await testDb(TableName.UserGroupMembership).whereIn("groupId", groupIds).delete();
  const membershipIds = await testDb(TableName.Membership).whereIn("actorGroupId", groupIds).pluck("id");
  await testDb(TableName.MembershipRole).whereIn("membershipId", membershipIds).delete();
  await testDb(TableName.Membership).whereIn("id", membershipIds).delete();
  await testDb(TableName.Groups).whereIn("id", groupIds).delete();
};
