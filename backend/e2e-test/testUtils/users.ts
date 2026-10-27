import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

// Writes the rows directly rather than going through signup, which needs SRP. The user can be named
// in memberships and reminders but cannot log in.
export const createUser = async (label: string) => {
  const username = `${label}-${crypto.randomUUID()}@localhost.local`;
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, firstName: label, isAccepted: true, isGhost: false })
    .returning("id");

  return { userId: (user as { id: string }).id, username };
};

// Spec files share one database, so a spec deletes the users it created. Removes their memberships too.
export const deleteUsers = async (userIds: string[]) => {
  if (userIds.length === 0) return;
  await testDb(TableName.Membership).whereIn("actorUserId", userIds).delete();
  await testDb(TableName.Users).whereIn("id", userIds).delete();
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

// A user from createUser has no password, so this signs the access token a login would have issued, against a
// session row of its own. The row goes with the user in deleteUsers.
export const createUserAccessToken = async ({ userId, orgId }: { userId: string; orgId: string }) => {
  const [session] = await testDb(TableName.AuthTokenSession)
    .insert({
      userId,
      ip: "127.0.0.1",
      userAgent: "e2e-test-user",
      accessVersion: 1,
      refreshVersion: 1,
      lastUsed: new Date()
    } as never)
    .returning("id");

  return jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId,
      tokenVersionId: (session as { id: string }).id,
      authMethod: AuthMethod.EMAIL,
      organizationId: orgId,
      accessVersion: 1
    },
    process.env.AUTH_SECRET as string,
    { expiresIn: "1h" }
  );
};
