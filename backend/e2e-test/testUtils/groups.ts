import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";

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
