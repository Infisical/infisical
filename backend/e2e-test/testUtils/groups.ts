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
