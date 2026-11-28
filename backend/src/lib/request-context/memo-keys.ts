/**
 * Builders for {@link requestMemoize} string keys. Centralizes formats so call sites
 * cannot drift (e.g. `project:findById` vs `project:findbyId`).
 */
export const requestMemoKeys = {
  projectFindById: (projectId: string) => `project:findById:${projectId}`,

  folderSecretPath: (projectId: string, folderId: string) => `folder:secretPath:${projectId}:${folderId}`,

  secretChangePolicyFindById: (policyId: string) => `secret-change-policy:findById:${policyId}`,

  userGroupMembershipsInOrg: (userId: string, orgId: string) => `user-group-memberships:${orgId}:${userId}`,

  groupMembers: (groupId: string) => `group:members:${groupId}`,

  auditLogSettings: (orgId: string, projectId?: string | null) => `audit-log-settings:${orgId}:${projectId ?? ""}`,

  licensePlan: (orgId: string) => `license:plan:${orgId}`,

  userFindById: (userId: string) => `user:findById:${userId}`,

  identityFindById: (identityId: string) => `identity:findById:${identityId}`,

  orgFindById: (orgId: string) => `org:findById:${orgId}`,

  orgFindOrgById: (orgId: string) => `org:findOrgById:${orgId}`,

  orgFindRootOrgDetails: (orgId: string) => `org:findRootOrgDetails:${orgId}`
};
