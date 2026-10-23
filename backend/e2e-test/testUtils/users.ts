import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
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

// Org memberships are written as accepted, the state a member who joined is in, unless `status` says
// otherwise (eg Invited for a pending invitation). Anything that resolves members (alert recipients,
// for one) skips a membership that is still invited.
export const addUserMembership = async (dto: {
  userId: string;
  orgId: string;
  projectId?: string;
  role: OrgMembershipRole | ProjectMembershipRole;
  status?: OrgMembershipStatus;
}) => {
  const [membership] = await testDb(TableName.Membership)
    .insert({
      scope: dto.projectId ? AccessScope.Project : AccessScope.Organization,
      scopeOrgId: dto.orgId,
      scopeProjectId: dto.projectId ?? null,
      actorUserId: dto.userId,
      ...(dto.projectId ? {} : { status: dto.status ?? OrgMembershipStatus.Accepted })
    })
    .returning("id");

  const membershipId = (membership as { id: string }).id;
  await testDb(TableName.MembershipRole).insert({ membershipId, role: dto.role });
  return membershipId;
};

let envConfigReady = false;

// A user JWT scoped to `orgId`, for the specs that need a caller other than the seeded admin on a
// route that only takes AuthMode.JWT (a machine identity cannot reach those). The user has to
// exist already (see createUser); signing in would need SRP. The session row dies with the user,
// so deleteUsers is the only cleanup.
export const createUserAuthToken = async (dto: { userId: string; orgId: string }) => {
  if (!envConfigReady) {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
    envConfigReady = true;
  }

  const [session] = await testDb(TableName.AuthTokenSession)
    .insert({
      userId: dto.userId,
      ip: "127.0.0.1",
      userAgent: "e2e",
      accessVersion: 1,
      refreshVersion: 1,
      lastUsed: new Date()
    } as never)
    .returning("id");

  return jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      authMethod: AuthMethod.EMAIL,
      userId: dto.userId,
      tokenVersionId: (session as { id: string }).id,
      organizationId: dto.orgId,
      accessVersion: 1
    },
    getConfig().AUTH_SECRET,
    { expiresIn: 3600 }
  );
};
