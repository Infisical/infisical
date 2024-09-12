export const userKeys = {
  getUser: ["user"] as const,
  getPrivateKey: ["user"] as const,
  userAction: ["user-action"] as const,
  userProjectFavorites: (orgId: string) => [{ orgId }, "user-project-favorites"] as const,
  getOrgMembership: (orgId: string, orgMembershipId: string) =>
    [{ orgId, orgMembershipId }, "org-membership"] as const,
  allOrgMembershipProjectMemberships: (orgId: string) => [orgId, "all-user-memberships"] as const,
  forOrgMembershipProjectMemberships: (orgId: string, orgMembershipId: string) =>
    [...userKeys.allOrgMembershipProjectMemberships(orgId), { orgMembershipId }] as const,
  getOrgMembershipProjectMemberships: (orgId: string, username: string) =>
    [{ orgId, username }, "org-membership-project-memberships"] as const,
  getOrgUsers: (orgId: string) => [{ orgId }, "user"],
  myIp: ["ip"] as const,
  myAPIKeys: ["api-keys"] as const,
  myAPIKeysV2: ["api-keys-v2"] as const,
  mySessions: ["sessions"] as const,
  listUsers: ["user-list"] as const,
  listUserGroupMemberships: (username: string) => [{ username }, "user-group-memberships"] as const,
  myOrganizationProjects: (orgId: string) => [{ orgId }, "organization-projects"] as const
};
