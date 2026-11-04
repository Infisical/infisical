export type AccessView = { value: string; label: string; href: string; overlay?: boolean };

export const accessViews: AccessView[] = [
  {
    value: "org-users",
    label: "Organization: Users",
    href: "/v4/organizations/demo/access-management?selectedTab=members"
  },
  {
    value: "org-users-search",
    label: "Organization: Users, search",
    href: "/v4/organizations/demo/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "org-users-edit-role",
    label: "Organization: Users, edit role",
    href: "/v4/organizations/demo/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "org-users-filter",
    label: "Organization: Users, role filter",
    href: "/v4/organizations/demo/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "org-users-row-menu",
    label: "Organization: Users, row actions",
    href: "/v4/organizations/demo/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "org-users-bulk",
    label: "Organization: Users, bulk selection",
    href: "/v4/organizations/demo/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "org-invite",
    label: "Organization: Invite users",
    href: "/v4/organizations/demo/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "org-users-remove",
    label: "Organization: Remove user",
    href: "/v4/organizations/demo/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "org-user-detail",
    label: "Organization: User details",
    href: "/v4/organizations/demo/members/m-priya"
  },
  {
    value: "org-identities",
    label: "Organization: Machine identities",
    href: "/v4/organizations/demo/access-management?selectedTab=identities"
  },
  {
    value: "org-identity-row-menu",
    label: "Organization: Machine identities, row actions",
    href: "/v4/organizations/demo/access-management?selectedTab=identities",
    overlay: true
  },
  {
    value: "org-loading",
    label: "Organization: Machine identities, loading",
    href: "/v4/organizations/demo/access-management?selectedTab=identities&scenario=loading"
  },
  {
    value: "org-identity-create",
    label: "Organization: Create machine identity",
    href: "/v4/organizations/demo/access-management?selectedTab=identities",
    overlay: true
  },
  {
    value: "org-identity-detail",
    label: "Organization: Machine identity details",
    href: "/v4/organizations/demo/identities/4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11"
  },
  {
    value: "org-groups",
    label: "Organization: Groups",
    href: "/v4/organizations/demo/access-management?selectedTab=groups"
  },
  {
    value: "org-group-row-menu",
    label: "Organization: Groups, row actions",
    href: "/v4/organizations/demo/access-management?selectedTab=groups",
    overlay: true
  },
  {
    value: "org-empty-groups",
    label: "Organization: Groups, empty",
    href: "/v4/organizations/demo/access-management?selectedTab=groups&scenario=empty"
  },
  {
    value: "org-group-create",
    label: "Organization: Create group",
    href: "/v4/organizations/demo/access-management?selectedTab=groups",
    overlay: true
  },
  {
    value: "org-group-detail",
    label: "Organization: Group details",
    href: "/v4/organizations/demo/groups/g-platform"
  },
  {
    value: "org-roles",
    label: "Organization: Roles",
    href: "/v4/organizations/demo/access-management?selectedTab=roles"
  },
  {
    value: "org-role-row-menu",
    label: "Organization: Roles, row actions",
    href: "/v4/organizations/demo/access-management?selectedTab=roles",
    overlay: true
  },
  {
    value: "org-role-create",
    label: "Organization: Create role",
    href: "/v4/organizations/demo/access-management?selectedTab=roles",
    overlay: true
  },
  {
    value: "org-role-detail",
    label: "Organization: Role editor",
    href: "/v4/organizations/demo/roles/r-auditor"
  },
  {
    value: "org-role-add-policy",
    label: "Organization: Role editor, add policies",
    href: "/v4/organizations/demo/roles/r-auditor",
    overlay: true
  },
  {
    value: "org-denied",
    label: "Organization: No access",
    href: "/v4/organizations/demo/access-management?selectedTab=members&scenario=denied"
  },
  {
    value: "org-denied-tab",
    label: "Organization: Roles, no access to the tab",
    href: "/v4/organizations/demo/access-management?selectedTab=roles&scenario=restricted"
  },
  {
    value: "proj-members",
    label: "Project: Users",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=members"
  },
  {
    value: "proj-members-filter",
    label: "Project: Users, role filter",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "proj-members-row-menu",
    label: "Project: Users, row actions",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "proj-add-member",
    label: "Project: Add users",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "proj-add-member-user-picker",
    label: "Project: Add users, user picker",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "proj-remove-member",
    label: "Project: Remove user",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=members",
    overlay: true
  },
  {
    value: "proj-member-detail",
    label: "Project: User details",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/members/pm-diego"
  },
  {
    value: "proj-member-edit-roles",
    label: "Project: Edit roles with temporary access",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/members/pm-diego",
    overlay: true
  },
  {
    value: "proj-identities",
    label: "Project: Machine identities",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=identities"
  },
  {
    value: "proj-identities-row-menu",
    label: "Project: Machine identities, row actions",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=identities",
    overlay: true
  },
  {
    value: "proj-identity-add",
    label: "Project: Add machine identity",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=identities",
    overlay: true
  },
  {
    value: "proj-identity-add-create-new",
    label: "Project: Create project machine identity",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=identities",
    overlay: true
  },
  {
    value: "proj-groups",
    label: "Project: Groups",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=groups"
  },
  {
    value: "proj-group-add",
    label: "Project: Add group",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=groups",
    overlay: true
  },
  {
    value: "proj-service-tokens",
    label: "Project: Service tokens",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=service-tokens"
  },
  {
    value: "proj-service-token-create",
    label: "Project: Create service token",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=service-tokens",
    overlay: true
  },
  {
    value: "proj-roles",
    label: "Project: Roles",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=roles"
  },
  {
    value: "proj-role-create",
    label: "Project: Create role",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=roles",
    overlay: true
  },
  {
    value: "proj-role-detail",
    label: "Project: Role editor",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/roles/deploy-bot-reviewer"
  },
  {
    value: "proj-role-large",
    label: "Project: Role editor, large role",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/roles/platform-operator"
  },
  {
    value: "proj-role-conditions",
    label: "Project: Role editor, conditions",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/roles/deploy-bot-reviewer",
    overlay: true
  },
  {
    value: "proj-role-add-policy",
    label: "Project: Role editor, add policies",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/roles/deploy-bot-reviewer",
    overlay: true
  },
  {
    value: "proj-role-add-from-template",
    label: "Project: Role editor, add from template menu",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/roles/deploy-bot-reviewer",
    overlay: true
  },
  {
    value: "proj-denied",
    label: "Project: No access",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=members&scenario=denied"
  },
  {
    value: "proj-loading",
    label: "Project: Users, loading",
    href: "/v4/organizations/demo/projects/secret-management/payments-api/access-management?selectedTab=members&scenario=loading"
  }
];
