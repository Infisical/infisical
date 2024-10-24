enum OrgMembershipRole {
  Admin = "admin",
  Member = "member",
  NoAccess = "no-access"
}

enum ProjectMemberRole {
  Admin = "admin",
  Member = "member",
  Viewer = "viewer",
  NoAccess = "no-access"
}

export const isCustomOrgRole = (slug: string) =>
  !Object.values(OrgMembershipRole).includes(slug as OrgMembershipRole);

export const formatProjectRoleName = (name: string) => {
  if (name === ProjectMemberRole.Member) return "developer";
  return name;
};
