import crypto from "node:crypto";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, ProjectMembershipRole, TableName } from "@app/db/schemas";

// Writes the rows directly rather than going through signup, which needs SRP. The user can be named
// in memberships and reminders but cannot log in.
export const createUser = async (label: string) => {
  const username = `${label}-${crypto.randomUUID()}@localhost.local`;
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, firstName: label, isAccepted: true, isGhost: false })
    .returning("id");

  return { userId: (user as { id: string }).id, username };
};

// Org memberships are written as accepted, the state a member who joined is in. Anything that
// resolves members (alert recipients, for one) skips a membership that is still invited.
export const addUserMembership = async (dto: {
  userId: string;
  orgId: string;
  projectId?: string;
  role: OrgMembershipRole | ProjectMembershipRole;
}) => {
  const [membership] = await testDb(TableName.Membership)
    .insert({
      scope: dto.projectId ? AccessScope.Project : AccessScope.Organization,
      scopeOrgId: dto.orgId,
      scopeProjectId: dto.projectId ?? null,
      actorUserId: dto.userId,
      ...(dto.projectId ? {} : { status: OrgMembershipStatus.Accepted })
    })
    .returning("id");

  const membershipId = (membership as { id: string }).id;
  await testDb(TableName.MembershipRole).insert({ membershipId, role: dto.role });
  return membershipId;
};
