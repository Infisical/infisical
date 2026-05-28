export const DEFAULT_PROJECT_ROLE = { slug: "member", name: "Member" };

export const BUILT_IN_PROJECT_ROLES = [
  { slug: "admin", name: "Admin", description: "Full administrative access over a project" },
  { slug: "member", name: "Member", description: "Limited read/write role in a project" },
  { slug: "viewer", name: "Viewer", description: "Only read role in a project" },
  {
    slug: "no-access",
    name: "No Access",
    description: "No access to any resources in the project"
  }
];

export const CERT_MANAGER_ROLES = [
  {
    slug: "admin",
    name: "Admin",
    description: "Full administrative access over Certificate Manager"
  },
  {
    slug: "member",
    name: "Member",
    description: "Access scoped to the Applications and Code Signers they've been added to"
  }
];
