import { ProjectMembershipRole, TOrgRole } from "@app/hooks/api/roles/types";

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

export const isCustomProjectRole = (slug: string) =>
  !Object.values(ProjectMembershipRole).includes(slug as ProjectMembershipRole);

export const findOrgMembershipRole = (roles: TOrgRole[], roleIdOrSlug: string) =>
  isCustomOrgRole(roleIdOrSlug)
    ? roles.find((r) => r.id === roleIdOrSlug)
    : roles.find((r) => r.slug === roleIdOrSlug);
