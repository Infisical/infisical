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

// PAM has no externally visible project, so the generic project role copy ("...over a project") does
// not apply. These describe the product roles in PAM's own terms.
export const PAM_PRODUCT_ROLE_OPTIONS = [
  {
    value: ProjectMembershipRole.Admin,
    label: "Admin",
    description:
      "Manage account templates, folders, and product access control. Access to individual accounts and folders is still granted per-resource."
  },
  {
    value: ProjectMembershipRole.Member,
    label: "Member",
    description: "Access limited to the folders and accounts they're granted."
  }
];

export const formatProjectRoleName = (role: string, customRoleName?: string) => {
  switch (role) {
    case ProjectMembershipRole.Admin:
      return "Admin";
    case ProjectMembershipRole.Member:
      return "Member";
    case ProjectMembershipRole.Viewer:
      return "Viewer";
    case ProjectMembershipRole.NoAccess:
      return "No Access";
    case ProjectMembershipRole.Custom:
      return customRoleName ?? role;
    case ProjectMembershipRole.KmsCryptographicOperator:
      return "Cryptographic Operator";
    default:
      return role;
  }
};
