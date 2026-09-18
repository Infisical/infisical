type TResolveOidcGroupMembershipChangesDTO<TGroup extends { id: string; name: string }> = {
  // The raw "groups" claim from the OIDC IdP. Casing is preserved by the caller (it is recorded in
  // audit logs); matching below is case-insensitive.
  idpGroups: string[];
  // The user's current org group memberships.
  userGroupMemberships: { groupId: string; groupName: string }[];
  // Every group that exists in the org.
  orgGroups: TGroup[];
};

/**
 * Decides which org groups a user should be added to / removed from when syncing OIDC group
 * memberships. Group names are matched against the IdP "groups" claim case-insensitively — the
 * email claim is already lowercased on ingest, so group names are treated the same way.
 *
 * Because the groups table's unique constraint on (orgId, name) is case-sensitive, an org can
 * legally hold case-variant groups (e.g. "Engineering" and "engineering"). In that case a single
 * IdP claim adds the user to every variant they are not already a member of, and removal is driven
 * by the user's actual memberships so a group the user never joined is never queued for removal.
 */
export const resolveOidcGroupMembershipChanges = <TGroup extends { id: string; name: string }>({
  idpGroups,
  userGroupMemberships,
  orgGroups
}: TResolveOidcGroupMembershipChangesDTO<TGroup>): {
  groupsToAddUserTo: TGroup[];
  groupsToRemoveUserFrom: TGroup[];
} => {
  const idpGroupNames = new Set(idpGroups.map((groupName) => groupName.toLowerCase()));
  // Track current memberships by group ID (not name): when an org holds case-variant groups, the
  // user must still be added to every matching variant they are not actually a member of. Keying on
  // ID also keeps this consistent with how the removal path below is constructed.
  const userGroupIds = new Set(userGroupMemberships.map((membership) => membership.groupId));

  const groupsToAddUserTo = orgGroups.filter(
    (group) => idpGroupNames.has(group.name.toLowerCase()) && !userGroupIds.has(group.id)
  );

  const groupIdsToRemoveUserFrom = new Set(
    userGroupMemberships
      .filter((membership) => !idpGroupNames.has(membership.groupName.toLowerCase()))
      .map((membership) => membership.groupId)
  );
  const groupsToRemoveUserFrom = orgGroups.filter((group) => groupIdsToRemoveUserFrom.has(group.id));

  return { groupsToAddUserTo, groupsToRemoveUserFrom };
};
