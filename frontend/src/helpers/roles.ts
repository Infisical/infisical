import { ProjectMembershipRole, TOrgRole } from "@app/hooks/api/roles/types";

export enum OrgMembershipRole {
  Admin = "admin",
  Member = "member",
  NoAccess = "no-access"
}

export const isCustomOrgRole = (slug: string) =>
  !Object.values(OrgMembershipRole).includes(slug as OrgMembershipRole);

export const isCustomProjectRole = (slug: string) =>
  !Object.values(ProjectMembershipRole).includes(slug as ProjectMembershipRole);

export const findOrgMembershipRole = (roles: TOrgRole[], roleIdOrSlug: string) =>
  isCustomOrgRole(roleIdOrSlug)
    ? roles.find((r) => r.id === roleIdOrSlug)
    : roles.find((r) => r.slug === roleIdOrSlug);

export const formatProjectRoleName = (role: string, customRoleName?: string) => {
  switch (role) {
    case ProjectMembershipRole.Admin:
      return "Admin";
    case ProjectMembershipRole.Member:
      return "Developer";
    case ProjectMembershipRole.Viewer:
      return "Viewer";
    case ProjectMembershipRole.NoAccess:
      return "No Access";
    case ProjectMembershipRole.Custom:
      return customRoleName ?? role;
    case ProjectMembershipRole.SshHostBootstrapper:
      return "SSH Host Bootstrapper";
    case ProjectMembershipRole.KmsCryptographicOperator:
      return "Cryptographic Operator";
    default:
      return role;
  }
};
