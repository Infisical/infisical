import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

export const PAM_PRODUCT_ROLE_OPTIONS = [
  {
    value: ProjectMembershipRole.Admin,
    label: "Admin",
    description:
      "Manage account templates, top-level folders, and product access control. Access to individual accounts and folders is still granted per-resource."
  },
  {
    value: ProjectMembershipRole.Member,
    label: "Member",
    description: "Access limited to the folders and accounts they're granted."
  }
];
