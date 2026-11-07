export type PermissionAction = { value: string; label: string; description?: string };
export type PermissionSubject = {
  subject: string;
  title: string;
  description?: string;
  actions: PermissionAction[];
  conditional?: boolean;
};
export type PolicyTemplate = {
  id: string;
  name: string;
  description?: string;
  icon: string;
  permissions: { subject: string; title: string; actions: PermissionAction[] }[];
};

export const ORG_SUBJECTS: PermissionSubject[] = [
  {
    subject: "member",
    title: "User management",
    actions: [
      {
        value: "read",
        label: "View all members"
      },
      {
        value: "create",
        label: "Invite members"
      },
      {
        value: "edit",
        label: "Edit members",
        description: "Includes activating and deactivating members"
      },
      {
        value: "delete",
        label: "Remove members"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges",
        description: "Change the roles members hold"
      }
    ]
  },
  {
    subject: "role",
    title: "Role management",
    actions: [
      {
        value: "read",
        label: "View"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "incident-contact",
    title: "Incident contacts",
    description: "Notified during security incidents",
    actions: [
      {
        value: "read",
        label: "View contacts"
      },
      {
        value: "create",
        label: "Add new contacts"
      },
      {
        value: "edit",
        label: "Edit contacts"
      },
      {
        value: "delete",
        label: "Remove contacts"
      }
    ]
  },
  {
    subject: "settings",
    title: "Organization profile",
    description: "Organization-wide settings",
    actions: [
      {
        value: "read",
        label: "View"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "secret-scanning",
    title: "Secret scanning",
    actions: [
      {
        value: "read",
        label: "View risks"
      },
      {
        value: "create",
        label: "Add integrations"
      },
      {
        value: "edit",
        label: "Edit risk status"
      },
      {
        value: "delete",
        label: "Remove integrations"
      }
    ]
  },
  {
    subject: "ldap",
    title: "LDAP",
    actions: [
      {
        value: "read",
        label: "View"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "scim",
    title: "SCIM",
    actions: [
      {
        value: "read",
        label: "View"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "github-org-sync",
    title: "GitHub organization sync",
    description: "Syncs GitHub teams to Infisical groups",
    actions: [
      {
        value: "read",
        label: "View"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "kms",
    title: "External KMS",
    description: "Your own key management system for encryption",
    actions: [
      {
        value: "read",
        label: "View"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "project-templates",
    title: "Secrets management project templates",
    description: "Applied when creating projects",
    actions: [
      {
        value: "read",
        label: "View & apply"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "sso",
    title: "SSO",
    actions: [
      {
        value: "read",
        label: "View"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      },
      {
        value: "bypass-sso-enforcement",
        label: "Bypass SSO enforcement",
        description: "Log in without SSO while SSO is enforced"
      }
    ]
  },
  {
    subject: "audit-logs",
    title: "Audit logs",
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "edit",
        label: "Edit",
        description: "Choose which events are recorded"
      }
    ]
  },
  {
    subject: "identity",
    title: "Machine identity management",
    actions: [
      {
        value: "read",
        label: "Read identities"
      },
      {
        value: "create",
        label: "Create identities"
      },
      {
        value: "edit",
        label: "Edit identities"
      },
      {
        value: "delete",
        label: "Delete identities"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges",
        description: "Assign roles and additional privileges"
      },
      {
        value: "revoke-auth",
        label: "Revoke auth"
      },
      {
        value: "edit-auth",
        label: "Configure auth"
      },
      {
        value: "create-token",
        label: "Create token"
      },
      {
        value: "get-token",
        label: "Get token"
      },
      {
        value: "delete-token",
        label: "Delete token"
      }
    ]
  },
  {
    subject: "groups",
    title: "Group management",
    actions: [
      {
        value: "read",
        label: "Read groups"
      },
      {
        value: "create",
        label: "Create groups"
      },
      {
        value: "edit",
        label: "Edit groups"
      },
      {
        value: "delete",
        label: "Delete groups"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges",
        description: "Assign roles and additional privileges"
      },
      {
        value: "add-members",
        label: "Add members"
      },
      {
        value: "remove-members",
        label: "Remove members"
      }
    ]
  },
  {
    subject: "app-connections",
    title: "App connections",
    description: "Credentials for external platforms and services",
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      },
      {
        value: "connect",
        label: "Connect",
        description: "Use connections in syncs and integrations"
      },
      {
        value: "rotate-credentials",
        label: "Rotate credentials"
      }
    ]
  },
  {
    subject: "gateway",
    title: "Gateways",
    description: "Connect Infisical to private infrastructure",
    actions: [
      {
        value: "list-gateways",
        label: "List gateways"
      },
      {
        value: "create-gateways",
        label: "Create gateways"
      },
      {
        value: "edit-gateways",
        label: "Edit gateways"
      },
      {
        value: "delete-gateways",
        label: "Delete gateways"
      },
      {
        value: "attach-gateways",
        label: "Attach gateways"
      },
      {
        value: "revoke-gateway-access",
        label: "Revoke gateway access"
      }
    ]
  },
  {
    subject: "gateway-pool",
    title: "Gateway pools",
    description: "Groups of gateways",
    actions: [
      {
        value: "list-gateway-pools",
        label: "List gateway pools"
      },
      {
        value: "create-gateway-pools",
        label: "Create gateway pools"
      },
      {
        value: "edit-gateway-pools",
        label: "Edit gateway pools"
      },
      {
        value: "delete-gateway-pools",
        label: "Delete gateway pools"
      },
      {
        value: "attach-gateway-pools",
        label: "Attach gateway pools"
      }
    ]
  },
  {
    subject: "relay",
    title: "Relays",
    description: "Servers that tunnel gateway traffic",
    actions: [
      {
        value: "list-relays",
        label: "List relays"
      },
      {
        value: "create-relays",
        label: "Create relays"
      },
      {
        value: "edit-relays",
        label: "Edit relays"
      },
      {
        value: "delete-relays",
        label: "Delete relays"
      },
      {
        value: "revoke-relay-access",
        label: "Revoke relay access"
      }
    ]
  },
  {
    subject: "kmip-server",
    title: "KMIP servers",
    description: "Proxy KMIP requests to Infisical KMS",
    actions: [
      {
        value: "list-kmip-servers",
        label: "List KMIP servers"
      },
      {
        value: "create-kmip-servers",
        label: "Create KMIP servers"
      },
      {
        value: "edit-kmip-servers",
        label: "Edit KMIP servers"
      },
      {
        value: "delete-kmip-servers",
        label: "Delete KMIP servers"
      },
      {
        value: "revoke-kmip-server-access",
        label: "Revoke KMIP server access"
      }
    ]
  },
  {
    subject: "billing",
    title: "Billing",
    actions: [
      {
        value: "read",
        label: "View bills"
      },
      {
        value: "manage-billing",
        label: "Manage billing"
      }
    ]
  },
  {
    subject: "email-domains",
    title: "Email domains",
    actions: [
      {
        value: "read",
        label: "View domains"
      },
      {
        value: "create",
        label: "Add domains"
      },
      {
        value: "verify-domain",
        label: "Verify domains"
      },
      {
        value: "delete",
        label: "Delete domains"
      }
    ]
  },
  {
    subject: "secret-share",
    title: "Secrets management secret sharing",
    description: "Settings for sharing secrets externally",
    actions: [
      {
        value: "manage-settings",
        label: "Manage settings"
      }
    ]
  },
  {
    subject: "secrets-management-insights",
    title: "Secrets management insights",
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "generate-report",
        label: "Generate report"
      },
      {
        value: "delete-report",
        label: "Delete report"
      },
      {
        value: "search-all-secret-values",
        label: "Search all secret values",
        description: "Includes projects the user isn't a member of"
      }
    ]
  },
  {
    subject: "honey-tokens",
    title: "Secrets management honey tokens",
    description: "Decoy credentials that alert when used",
    actions: [
      {
        value: "setup",
        label: "Setup"
      }
    ]
  },
  {
    subject: "project",
    title: "Project",
    description: "Creating projects and requesting access",
    actions: [
      {
        value: "create",
        label: "Create projects"
      },
      {
        value: "request-access",
        label: "Request access"
      }
    ]
  },
  {
    subject: "organization-admin-console",
    title: "Organization admin console",
    description: "Access to every project without membership",
    actions: [
      {
        value: "access-all-projects",
        label: "Access all organization projects",
        description: "Bypasses project membership"
      }
    ]
  },
  {
    subject: "machine-identity-auth-template",
    title: "Machine identity auth templates",
    description: "Reusable auth configurations for identities",
    actions: [
      {
        value: "list-templates",
        label: "List templates"
      },
      {
        value: "create-templates",
        label: "Create templates"
      },
      {
        value: "edit-templates",
        label: "Edit templates"
      },
      {
        value: "delete-templates",
        label: "Delete templates"
      },
      {
        value: "unlink-templates",
        label: "Unlink templates"
      },
      {
        value: "attach-templates",
        label: "Attach templates"
      }
    ]
  },
  {
    subject: "sub-organization",
    title: "Sub-organizations",
    description: "Namespaces within the organization",
    actions: [
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Edit"
      },
      {
        value: "delete",
        label: "Delete"
      },
      {
        value: "direct-access",
        label: "Direct access",
        description: "Without being a member"
      },
      {
        value: "link-group",
        label: "Link group"
      }
    ]
  }
];

export const PROJECT_SUBJECTS: PermissionSubject[] = [
  {
    subject: "secrets",
    title: "Secrets",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read (legacy)",
        description: "Legacy. Use Describe secret and Read value instead."
      },
      {
        value: "describeSecret",
        label: "Describe secret",
        description: "Name, tags, and metadata only. Does not reveal the value."
      },
      {
        value: "readValue",
        label: "Read value"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      },
      {
        value: "create",
        label: "Create"
      }
    ]
  },
  {
    subject: "secret-folders",
    title: "Secret folders",
    conditional: true,
    actions: [
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Also deletes everything in the folder"
      }
    ]
  },
  {
    subject: "secret-imports",
    title: "Secret imports",
    description: "Reference secrets from other environments or folders",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "dynamic-secrets",
    title: "Dynamic secrets",
    description: "On-demand credentials for databases and services",
    conditional: true,
    actions: [
      {
        value: "read-root-credential",
        label: "Read root credentials"
      },
      {
        value: "create-root-credential",
        label: "Create root credentials"
      },
      {
        value: "edit-root-credential",
        label: "Modify root credentials"
      },
      {
        value: "delete-root-credential",
        label: "Remove root credentials"
      },
      {
        value: "lease",
        label: "Manage leases"
      }
    ]
  },
  {
    subject: "kms",
    title: "Project KMS configuration",
    description: "Key used to encrypt this project's data",
    conditional: false,
    actions: [
      {
        value: "edit",
        label: "Modify"
      }
    ]
  },
  {
    subject: "integrations",
    title: "Native integrations",
    description: "Push secrets to third-party services",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "workspace",
    title: "Project",
    conditional: false,
    actions: [
      {
        value: "edit",
        label: "Update project details"
      },
      {
        value: "delete",
        label: "Delete project",
        description: "Permanently deletes the project"
      }
    ]
  },
  {
    subject: "role",
    title: "Roles",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "member",
    title: "User management",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Add"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges (legacy)",
        description: "Legacy. Use Assign roles and Assign additional privileges instead."
      },
      {
        value: "assign-role",
        label: "Assign roles"
      },
      {
        value: "assign-additional-privileges",
        label: "Assign additional privileges"
      },
      {
        value: "assume-privileges",
        label: "Assume privileges",
        description: "Temporarily act with another member's privileges"
      }
    ]
  },
  {
    subject: "identity",
    title: "Machine identity management",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Add"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges (legacy)",
        description: "Legacy. Use Assign roles and Assign additional privileges instead."
      },
      {
        value: "assign-role",
        label: "Assign roles"
      },
      {
        value: "assign-additional-privileges",
        label: "Assign additional privileges"
      },
      {
        value: "assume-privileges",
        label: "Assume privileges",
        description: "Temporarily act with a machine identity's privileges"
      },
      {
        value: "revoke-auth",
        label: "Revoke auth"
      },
      {
        value: "edit-auth",
        label: "Configure auth methods"
      },
      {
        value: "create-token",
        label: "Create token"
      },
      {
        value: "get-token",
        label: "Get token"
      },
      {
        value: "delete-token",
        label: "Delete token"
      }
    ]
  },
  {
    subject: "groups",
    title: "Group management",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges (legacy)",
        description: "Legacy. Use Assign roles instead."
      },
      {
        value: "assign-role",
        label: "Assign roles"
      }
    ]
  },
  {
    subject: "webhooks",
    title: "Webhooks",
    description: "Notifications for secret events",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "service-tokens",
    title: "Service tokens",
    description: "Tokens for programmatic access",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "honey-tokens",
    title: "Honey tokens",
    description: "Decoy credentials that alert when used",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "read-credentials",
        label: "Read credentials"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "reset",
        label: "Reset"
      },
      {
        value: "revoke",
        label: "Revoke"
      }
    ]
  },
  {
    subject: "proxied-services",
    title: "Proxied services",
    description: "Services agent traffic is routed through",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      },
      {
        value: "proxy",
        label: "Proxy",
        description: "For agent identities routing traffic"
      },
      {
        value: "report-usage",
        label: "Report usage",
        description: "For the agent proxy recording last use"
      }
    ]
  },
  {
    subject: "settings",
    title: "Settings",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "edit",
        label: "Modify"
      }
    ]
  },
  {
    subject: "secret-validation-rules",
    title: "Secret validation rules",
    description: "Constraints secrets must meet",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "environments",
    title: "Environment management",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "commits",
    title: "Commits",
    description: "Secret version history and rollbacks",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "View"
      },
      {
        value: "perform-rollback",
        label: "Perform rollback"
      }
    ]
  },
  {
    subject: "tags",
    title: "Tags",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "audit-logs",
    title: "Audit logs",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "edit",
        label: "Edit",
        description: "Choose which events are recorded and how long logs are kept"
      }
    ]
  },
  {
    subject: "insights",
    title: "Insights",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "generate-report",
        label: "Generate report"
      },
      {
        value: "delete-report",
        label: "Delete report"
      }
    ]
  },
  {
    subject: "ip-allowlist",
    title: "IP allowlist",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "secret-approval",
    title: "Approval policies",
    description: "Approvals for secret changes and access requests",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      }
    ]
  },
  {
    subject: "secret-rotation",
    title: "Secret rotation",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read config"
      },
      {
        value: "read-generated-credentials",
        label: "Read generated credentials"
      },
      {
        value: "create",
        label: "Create config"
      },
      {
        value: "edit",
        label: "Modify config"
      },
      {
        value: "delete",
        label: "Remove config"
      },
      {
        value: "rotate-secrets",
        label: "Rotate secrets"
      }
    ]
  },
  {
    subject: "secret-syncs",
    title: "Secret syncs",
    description: "Push secrets to external destinations",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read"
      },
      {
        value: "create",
        label: "Create"
      },
      {
        value: "edit",
        label: "Modify"
      },
      {
        value: "delete",
        label: "Remove"
      },
      {
        value: "sync-secrets",
        label: "Trigger syncs"
      },
      {
        value: "import-secrets",
        label: "Import secrets from destination"
      },
      {
        value: "remove-secrets",
        label: "Remove secrets from destination"
      }
    ]
  },
  {
    subject: "secret-event-subscriptions",
    title: "Secret event subscriptions",
    description: "Receive secret lifecycle events",
    conditional: true,
    actions: [
      {
        value: "subscribe-to-creation-events",
        label: "Subscribe to creation events"
      },
      {
        value: "subscribe-to-deletion-events",
        label: "Subscribe to deletion events"
      },
      {
        value: "subscribe-to-update-events",
        label: "Subscribe to update events"
      },
      {
        value: "subscribe-to-import-mutation-events",
        label: "Subscribe to import mutation events"
      }
    ]
  },
  {
    subject: "app-connections",
    title: "App connections",
    description: "Credentials for external platforms and services",
    conditional: true,
    actions: [
      {
        value: "read-app-connections",
        label: "Read"
      },
      {
        value: "create-app-connections",
        label: "Create"
      },
      {
        value: "edit-app-connections",
        label: "Update"
      },
      {
        value: "delete-app-connections",
        label: "Delete"
      },
      {
        value: "connect-app-connections",
        label: "Connect",
        description: "Use connections in syncs and integrations"
      },
      {
        value: "rotate-credentials",
        label: "Rotate credentials"
      }
    ]
  },
  {
    subject: "project-folder-grant",
    title: "Project folder grants",
    description: "Access to secrets in specific environments and paths",
    conditional: true,
    actions: [
      {
        value: "read-grant",
        label: "Read"
      },
      {
        value: "create-grant",
        label: "Create grant"
      },
      {
        value: "revoke-grant",
        label: "Revoke grant"
      }
    ]
  },
  {
    subject: "secret-approval-request",
    title: "Secret approval requests",
    description: "Secret changes pending approval",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read"
      }
    ]
  }
];

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "secret-viewer",
    name: "Secret viewing policies",
    icon: "Eye",
    permissions: [
      {
        subject: "secret-rollback",
        title: "Secret rollback",
        actions: [
          {
            value: "read",
            label: "View"
          }
        ]
      },
      {
        subject: "secret-imports",
        title: "Secret imports",
        actions: [
          {
            value: "read",
            label: "Read"
          }
        ]
      },
      {
        subject: "secrets",
        title: "Secrets",
        actions: [
          {
            value: "describeSecret",
            label: "Describe secret",
            description: "Name, tags, and metadata only. Does not reveal the value."
          },
          {
            value: "readValue",
            label: "Read value"
          }
        ]
      },
      {
        subject: "dynamic-secrets",
        title: "Dynamic secrets",
        actions: [
          {
            value: "read-root-credential",
            label: "Read root credentials"
          }
        ]
      },
      {
        subject: "environments",
        title: "Environment management",
        actions: [
          {
            value: "read",
            label: "Read"
          }
        ]
      },
      {
        subject: "tags",
        title: "Tags",
        actions: [
          {
            value: "read",
            label: "Read"
          }
        ]
      },
      {
        subject: "secret-rotation",
        title: "Secret rotation",
        actions: [
          {
            value: "read",
            label: "Read config"
          }
        ]
      },
      {
        subject: "integrations",
        title: "Native integrations",
        actions: [
          {
            value: "read",
            label: "Read"
          }
        ]
      },
      {
        subject: "secret-syncs",
        title: "Secret syncs",
        actions: [
          {
            value: "read",
            label: "Read"
          }
        ]
      },
      {
        subject: "commits",
        title: "Commits",
        actions: [
          {
            value: "read",
            label: "View"
          }
        ]
      },
      {
        subject: "honey-tokens",
        title: "Honey tokens",
        actions: [
          {
            value: "read",
            label: "Read"
          }
        ]
      },
      {
        subject: "proxied-services",
        title: "Proxied services",
        actions: [
          {
            value: "read",
            label: "Read"
          }
        ]
      }
    ]
  },
  {
    id: "secret-editor",
    name: "Secret editing policies",
    icon: "Pencil",
    permissions: [
      {
        subject: "environments",
        title: "Environment management",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      },
      {
        subject: "dynamic-secrets",
        title: "Dynamic secrets",
        actions: [
          {
            value: "read-root-credential",
            label: "Read root credentials"
          },
          {
            value: "create-root-credential",
            label: "Create root credentials"
          },
          {
            value: "edit-root-credential",
            label: "Modify root credentials"
          },
          {
            value: "delete-root-credential",
            label: "Remove root credentials"
          },
          {
            value: "lease",
            label: "Manage leases"
          }
        ]
      },
      {
        subject: "secrets",
        title: "Secrets",
        actions: [
          {
            value: "describeSecret",
            label: "Describe secret",
            description: "Name, tags, and metadata only. Does not reveal the value."
          },
          {
            value: "readValue",
            label: "Read value"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      },
      {
        subject: "secret-rollback",
        title: "Secret rollback",
        actions: [
          {
            value: "read",
            label: "View"
          },
          {
            value: "create",
            label: "Perform rollback"
          }
        ]
      },
      {
        subject: "tags",
        title: "Tags",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      },
      {
        subject: "secret-imports",
        title: "Secret imports",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      },
      {
        subject: "secret-rotation",
        title: "Secret rotation",
        actions: [
          {
            value: "read",
            label: "Read config"
          },
          {
            value: "read-generated-credentials",
            label: "Read generated credentials"
          },
          {
            value: "create",
            label: "Create config"
          },
          {
            value: "edit",
            label: "Modify config"
          },
          {
            value: "delete",
            label: "Remove config"
          },
          {
            value: "rotate-secrets",
            label: "Rotate secrets"
          }
        ]
      },
      {
        subject: "secret-folders",
        title: "Secret folders",
        actions: [
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Also deletes everything in the folder"
          }
        ]
      },
      {
        subject: "integrations",
        title: "Native integrations",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      },
      {
        subject: "secret-syncs",
        title: "Secret syncs",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          },
          {
            value: "sync-secrets",
            label: "Trigger syncs"
          },
          {
            value: "import-secrets",
            label: "Import secrets from destination"
          },
          {
            value: "remove-secrets",
            label: "Remove secrets from destination"
          }
        ]
      },
      {
        subject: "commits",
        title: "Commits",
        actions: [
          {
            value: "read",
            label: "View"
          },
          {
            value: "perform-rollback",
            label: "Perform rollback"
          }
        ]
      },
      {
        subject: "honey-tokens",
        title: "Honey tokens",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "read-credentials",
            label: "Read credentials"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "reset",
            label: "Reset"
          },
          {
            value: "revoke",
            label: "Revoke"
          }
        ]
      },
      {
        subject: "proxied-services",
        title: "Proxied services",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          },
          {
            value: "proxy",
            label: "Proxy",
            description: "For agent identities routing traffic"
          },
          {
            value: "report-usage",
            label: "Report usage",
            description: "For the agent proxy recording last use"
          }
        ]
      }
    ]
  },
  {
    id: "project-manager",
    name: "Project management policies",
    icon: "Users",
    permissions: [
      {
        subject: "audit-logs",
        title: "Audit logs",
        actions: [
          {
            value: "read",
            label: "Read"
          }
        ]
      },
      {
        subject: "groups",
        title: "Group management",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          },
          {
            value: "assign-role",
            label: "Assign roles"
          }
        ]
      },
      {
        subject: "member",
        title: "User management",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Add"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          },
          {
            value: "assign-role",
            label: "Assign roles"
          },
          {
            value: "assign-additional-privileges",
            label: "Assign additional privileges"
          },
          {
            value: "assume-privileges",
            label: "Assume privileges",
            description: "Temporarily act with another member's privileges"
          }
        ]
      },
      {
        subject: "identity",
        title: "Machine identity management",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Add"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          },
          {
            value: "assign-role",
            label: "Assign roles"
          },
          {
            value: "assign-additional-privileges",
            label: "Assign additional privileges"
          },
          {
            value: "assume-privileges",
            label: "Assume privileges",
            description: "Temporarily act with a machine identity's privileges"
          },
          {
            value: "revoke-auth",
            label: "Revoke auth"
          },
          {
            value: "edit-auth",
            label: "Configure auth methods"
          },
          {
            value: "create-token",
            label: "Create token"
          },
          {
            value: "get-token",
            label: "Get token"
          },
          {
            value: "delete-token",
            label: "Delete token"
          }
        ]
      },
      {
        subject: "workspace",
        title: "Project",
        actions: [
          {
            value: "edit",
            label: "Update project details"
          },
          {
            value: "delete",
            label: "Delete project",
            description: "Permanently deletes the project"
          }
        ]
      },
      {
        subject: "role",
        title: "Roles",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      },
      {
        subject: "settings",
        title: "Settings",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "edit",
            label: "Modify"
          }
        ]
      },
      {
        subject: "ip-allowlist",
        title: "IP allowlist",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      },
      {
        subject: "kms",
        title: "Project KMS configuration",
        actions: [
          {
            value: "edit",
            label: "Modify"
          }
        ]
      },
      {
        subject: "secret-approval",
        title: "Approval policies",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      },
      {
        subject: "service-tokens",
        title: "Service tokens",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      },
      {
        subject: "honey-tokens",
        title: "Honey tokens",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "read-credentials",
            label: "Read credentials"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "reset",
            label: "Reset"
          },
          {
            value: "revoke",
            label: "Revoke"
          }
        ]
      },
      {
        subject: "proxied-services",
        title: "Proxied services",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          },
          {
            value: "proxy",
            label: "Proxy",
            description: "For agent identities routing traffic"
          },
          {
            value: "report-usage",
            label: "Report usage",
            description: "For the agent proxy recording last use"
          }
        ]
      },
      {
        subject: "webhooks",
        title: "Webhooks",
        actions: [
          {
            value: "read",
            label: "Read"
          },
          {
            value: "create",
            label: "Create"
          },
          {
            value: "edit",
            label: "Modify"
          },
          {
            value: "delete",
            label: "Remove"
          }
        ]
      }
    ]
  },
  {
    id: "agent-proxy",
    name: "Agent proxy policies",
    description: "For the agent proxy: reads secret values, leases dynamic secrets, reports usage",
    icon: "Share2",
    permissions: [
      {
        subject: "secrets",
        title: "Secrets",
        actions: [
          {
            value: "describeSecret",
            label: "Describe secret",
            description: "Name, tags, and metadata only. Does not reveal the value."
          },
          {
            value: "readValue",
            label: "Read value"
          }
        ]
      },
      {
        subject: "dynamic-secrets",
        title: "Dynamic secrets",
        actions: [
          {
            value: "lease",
            label: "Manage leases"
          }
        ]
      },
      {
        subject: "proxied-services",
        title: "Proxied services",
        actions: [
          {
            value: "report-usage",
            label: "Report usage",
            description: "For the agent proxy recording last use"
          }
        ]
      }
    ]
  },
  {
    id: "agent",
    name: "Agent policies",
    description: "For agent identities: routes traffic through proxied services",
    icon: "Bot",
    permissions: [
      {
        subject: "proxied-services",
        title: "Proxied services",
        actions: [
          {
            value: "proxy",
            label: "Proxy",
            description: "For agent identities routing traffic"
          }
        ]
      }
    ]
  }
];

export const ACTION_ALLOWED_CONDITIONS: Record<string, Record<string, string[]>> = {
  member: {
    read: [],
    create: [],
    edit: [],
    delete: [],
    "assume-privileges": ["userEmail"],
    "grant-privileges": ["userEmail", "assignableRole", "assignableSubject", "assignableAction"],
    "assign-role": ["userEmail", "assignableRole"],
    "assign-additional-privileges": ["userEmail", "assignableSubject", "assignableAction"]
  },
  identity: {
    read: ["identityId"],
    create: [],
    edit: ["identityId"],
    delete: ["identityId"],
    "grant-privileges": ["identityId", "assignableRole", "assignableSubject", "assignableAction"],
    "assign-role": ["identityId", "assignableRole"],
    "assign-additional-privileges": ["identityId", "assignableSubject", "assignableAction"],
    "assume-privileges": ["identityId"],
    "revoke-auth": ["identityId"],
    "edit-auth": ["identityId"],
    "create-token": ["identityId"],
    "get-token": ["identityId"],
    "delete-token": ["identityId"]
  },
  groups: {
    read: [],
    create: [],
    edit: [],
    delete: [],
    "grant-privileges": ["groupName", "assignableRole"],
    "assign-role": ["groupName", "assignableRole"]
  }
};
