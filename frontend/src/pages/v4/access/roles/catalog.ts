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
    subject: "audit-log-streams",
    title: "Audit log streams",
    actions: [
      {
        value: "read",
        label: "Read",
        description: "Read audit log streams and their alerts"
      },
      {
        value: "edit",
        label: "Edit",
        description: "Create, update and delete audit log streams, and manage their alerts"
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

export const KMS_KEY_SUBJECTS: PermissionSubject[] = [
  {
    subject: "cmek",
    title: "KMS keys",
    description: "Manage encryption keys and cryptographic operations",
    actions: [
      { value: "read", label: "Read", description: "View KMS keys and their metadata" },
      { value: "create", label: "Create", description: "Create new KMS encryption keys" },
      { value: "edit", label: "Modify", description: "Update KMS key configuration" },
      { value: "delete", label: "Remove", description: "Delete KMS keys" },
      { value: "encrypt", label: "Encrypt", description: "Use KMS keys to encrypt data" },
      { value: "decrypt", label: "Decrypt", description: "Use KMS keys to decrypt data" },
      { value: "sign", label: "Sign", description: "Create signatures using KMS keys" },
      { value: "verify", label: "Verify", description: "Verify signatures using KMS keys" },
      { value: "generate-mac", label: "Generate MAC", description: "Generate MACs using KMS keys" },
      { value: "verify-mac", label: "Verify MAC", description: "Verify MACs using KMS keys" },
      { value: "rotate", label: "Rotate", description: "Rotate KMS key material" },
      {
        value: "export-private-key",
        label: "Export private key",
        description: "Export the private key from KMS (sensitive operation)"
      },
      {
        value: "publish-public-key",
        label: "Publish public key",
        description: "Publish a sign-verify key's public key at an unauthenticated JWKS URL"
      }
    ]
  },
  {
    subject: "kmip",
    title: "KMIP",
    description: "Manage keys via KMIP protocol",
    actions: [
      {
        value: "read-clients",
        label: "Read clients",
        description: "View KMIP clients and their configuration"
      },
      {
        value: "create-clients",
        label: "Create clients",
        description: "Register new KMIP clients"
      },
      {
        value: "update-clients",
        label: "Modify clients",
        description: "Update KMIP client settings"
      },
      { value: "delete-clients", label: "Delete clients", description: "Remove KMIP clients" },
      {
        value: "generate-client-certificates",
        label: "Generate client certificates",
        description: "Generate authentication certificates for KMIP clients"
      }
    ]
  }
];

export const CERT_MANAGER_SUBJECTS: PermissionSubject[] = [
  {
    subject: "certificate-authorities",
    title: "Certificate authorities",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View certificate authorities and their configuration"
      },
      { value: "create", label: "Create", description: "Create new certificate authorities" },
      { value: "edit", label: "Modify", description: "Update certificate authority settings" },
      { value: "delete", label: "Remove", description: "Delete certificate authorities" },
      {
        value: "issue-ca-certificate",
        label: "Issue CA certificate",
        description: "Issue certificates from a certificate authority"
      },
      {
        value: "sign-intermediate",
        label: "Sign intermediate",
        description: "Sign intermediate CA certificates"
      }
    ]
  },
  {
    subject: "certificates",
    title: "Certificates",
    conditional: true,
    actions: [
      { value: "read", label: "Read", description: "View certificates and their metadata" },
      {
        value: "read-private-key",
        label: "Read private key",
        description: "Access and view certificate private keys (sensitive operation)"
      },
      {
        value: "import",
        label: "Import",
        description: "Import existing certificates into the system"
      },
      { value: "edit", label: "Modify", description: "Update certificate properties" },
      { value: "delete", label: "Remove", description: "Delete certificates" }
    ]
  },
  {
    subject: "certificate-profiles",
    title: "Certificate profiles",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View certificate profiles and their configuration"
      },
      { value: "create", label: "Create", description: "Create new certificate profiles" },
      { value: "edit", label: "Modify", description: "Update certificate profile settings" },
      { value: "delete", label: "Remove", description: "Delete certificate profiles" },
      {
        value: "issue-cert",
        label: "Request certificates",
        description: "Request new certificates using a profile"
      }
    ]
  },
  {
    subject: "certificate-policies",
    title: "Certificate policies",
    conditional: true,
    actions: [
      { value: "read", label: "Read", description: "View certificate policies and their rules" },
      { value: "create", label: "Create", description: "Create new certificate policies" },
      { value: "edit", label: "Modify", description: "Update certificate policy rules" },
      { value: "delete", label: "Remove", description: "Delete certificate policies" }
    ]
  },
  {
    subject: "certificate-application",
    title: "Applications",
    description: "Services and workloads that issue their own certificates",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description:
          "See all applications in Certificate Manager. An application's details stay hidden unless you are a member of it"
      },
      { value: "list", label: "List", description: "List the applications in Certificate Manager" },
      { value: "create", label: "Create", description: "Create new applications" }
    ]
  },
  {
    subject: "pki-subscribers",
    title: "PKI subscribers",
    description: "Entities that receive certificates",
    conditional: true,
    actions: [
      { value: "read", label: "Read", description: "View PKI subscribers and their details" },
      { value: "create", label: "Create", description: "Register new PKI subscribers" },
      { value: "edit", label: "Modify", description: "Update subscriber configuration" },
      { value: "delete", label: "Remove", description: "Remove PKI subscribers" },
      {
        value: "list-certs",
        label: "List certificates",
        description: "View certificates associated with a subscriber"
      }
    ]
  },
  {
    subject: "pki-collections",
    title: "PKI collections",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View PKI collections" },
      { value: "create", label: "Create", description: "Create new certificate collections" },
      { value: "edit", label: "Modify", description: "Update collection properties" },
      { value: "delete", label: "Remove", description: "Delete PKI collections" }
    ]
  },
  {
    subject: "pki-alerts",
    title: "PKI alerts",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View PKI alerts and notifications" },
      { value: "create", label: "Create", description: "Set up new certificate expiration alerts" },
      { value: "edit", label: "Modify", description: "Update alert configuration" },
      { value: "delete", label: "Remove", description: "Delete PKI alerts" }
    ]
  },
  {
    subject: "certificate-inventory-views",
    title: "Inventory views",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View saved inventory views" },
      { value: "create", label: "Create", description: "Create new inventory views" },
      { value: "edit", label: "Modify", description: "Update inventory views and toggle sharing" },
      { value: "delete", label: "Remove", description: "Delete inventory views" }
    ]
  },
  {
    subject: "pki-syncs",
    title: "Certificate syncs",
    conditional: true,
    actions: [
      { value: "read", label: "Read", description: "View certificate sync configurations" },
      { value: "create", label: "Create", description: "Set up new certificate syncs" },
      { value: "edit", label: "Modify", description: "Update sync configuration" },
      { value: "delete", label: "Remove", description: "Delete certificate sync configurations" },
      {
        value: "sync-certificates",
        label: "Trigger syncs",
        description: "Manually trigger certificate synchronization"
      },
      {
        value: "import-certificates",
        label: "Import certificates from destination",
        description: "Import certificates from the sync destination"
      },
      {
        value: "remove-certificates",
        label: "Remove certificates from destination",
        description: "Remove synced certificates from the destination"
      },
      {
        value: "set-health-check-command",
        label: "Set health check",
        description: "Set the command a sync runs on the destination host before delivering"
      },
      {
        value: "set-post-sync-command",
        label: "Set post-sync command",
        description: "Set the command a sync runs on the destination host after delivering"
      },
      {
        value: "set-target-host",
        label: "Set target host",
        description:
          "Choose which host a sync delivers to when using an LDAP connection. The sync authenticates to that host with the connection's credential"
      }
    ]
  },
  {
    subject: "pki-discovery",
    title: "PKI discovery",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View PKI discovery configurations and results"
      },
      { value: "create", label: "Create", description: "Set up new PKI discovery scans" },
      { value: "edit", label: "Modify", description: "Update discovery configuration" },
      { value: "delete", label: "Remove", description: "Delete PKI discovery configurations" },
      { value: "run-scan", label: "Run scan", description: "Trigger a certificate discovery scan" }
    ]
  },
  {
    subject: "pki-certificate-installations",
    title: "Certificate installations",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View certificate installation records" },
      { value: "edit", label: "Modify", description: "Update installation properties" },
      { value: "delete", label: "Remove", description: "Remove certificate installation records" }
    ]
  },
  {
    subject: "code-signers",
    title: "PKI code signing",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View code signers and signing operations" },
      { value: "create", label: "Create", description: "Create new code signers" },
      { value: "edit", label: "Modify", description: "Update code signer configuration" },
      { value: "delete", label: "Remove", description: "Delete code signers" },
      { value: "sign", label: "Sign", description: "Perform code signing operations" }
    ]
  },
  {
    subject: "hsm-connectors",
    title: "HSM connectors",
    description: "Bridge Infisical to your HSM",
    conditional: false,
    actions: [
      {
        value: "read-hsm-connectors",
        label: "Read",
        description: "View HSM Connectors and their configuration (PIN is never returned)"
      },
      {
        value: "create-hsm-connectors",
        label: "Create",
        description: "Create a new HSM Connector"
      },
      {
        value: "edit-hsm-connectors",
        label: "Update",
        description: "Edit name, description, key name prefix, routing, or rotate the PIN"
      },
      {
        value: "delete-hsm-connectors",
        label: "Delete",
        description: "Delete an HSM Connector (blocked if any certificate references it)"
      },
      {
        value: "test-hsm-connectors",
        label: "Verify",
        description: "Verify the connector reaches the HSM through the gateway"
      },
      {
        value: "attach-hsm-connectors",
        label: "Attach",
        description:
          "Attach an HSM Connector when issuing a certificate (mints a fresh keypair on the HSM)"
      }
    ]
  }
];

export const SECRET_SCANNING_SUBJECTS: PermissionSubject[] = [
  {
    subject: "secret-scanning-data-sources",
    title: "Secret scanning data sources",
    conditional: false,
    actions: [
      {
        value: "read-data-sources",
        label: "Read data sources",
        description: "View configured data sources for secret scanning"
      },
      {
        value: "create-data-sources",
        label: "Create data sources",
        description: "Add new data sources"
      },
      {
        value: "edit-data-sources",
        label: "Modify data sources",
        description: "Update data source configuration"
      },
      {
        value: "delete-data-sources",
        label: "Delete data sources",
        description: "Remove data sources"
      },
      {
        value: "read-data-source-resources",
        label: "Read resources",
        description: "View discovered resources within data sources"
      },
      {
        value: "read-data-source-scans",
        label: "Read scans",
        description: "View scan history and results"
      },
      {
        value: "trigger-data-source-scans",
        label: "Trigger scans",
        description: "Manually initiate secret scanning"
      }
    ]
  },
  {
    subject: "secret-scanning-findings",
    title: "Secret scanning findings",
    conditional: false,
    actions: [
      {
        value: "read-findings",
        label: "Read findings",
        description: "View detected secrets and vulnerabilities"
      },
      {
        value: "update-findings",
        label: "Update findings",
        description: "Mark findings as resolved or false positive"
      }
    ]
  },
  {
    subject: "secret-scanning-configs",
    title: "Secret scanning config",
    conditional: false,
    actions: [
      {
        value: "read-configs",
        label: "Read config",
        description: "View secret scanning configuration"
      },
      {
        value: "update-configs",
        label: "Update config",
        description: "Modify scanning rules and settings"
      }
    ]
  }
];

export const AGENT_VAULT_SUBJECTS: PermissionSubject[] = [
  {
    subject: "agent-vault-access-bundles",
    title: "Access bundles",
    description: "What an agent can reach and who can reach it",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View access bundles and their connections" },
      {
        value: "create",
        label: "Create",
        description: "Create access bundles and add connections"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update access bundles and their credentials"
      },
      { value: "delete", label: "Remove", description: "Delete access bundles" },
      {
        value: "manage-members",
        label: "Manage members",
        description: "Grant and revoke access to a bundle"
      }
    ]
  },
  {
    subject: "agent-vault-sessions",
    title: "Sessions",
    description: "The tokens agents run with",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View your own sessions" },
      {
        value: "create",
        label: "Create",
        description: "Mint a session over access bundles you can reach"
      },
      { value: "edit", label: "Edit", description: "Change the label of your own sessions" },
      { value: "revoke", label: "Revoke", description: "Revoke your own sessions" },
      {
        value: "read-any",
        label: "Read any",
        description: "View everyone's sessions and their session logs"
      },
      { value: "edit-any", label: "Edit any", description: "Change the label of anyone's session" },
      { value: "revoke-any", label: "Revoke any", description: "Revoke anyone's session" },
      {
        value: "create-with-inline-services",
        label: "Create with inline services",
        description: "Send services with a session instead of only naming an access bundle"
      }
    ]
  },
  {
    subject: "agent-vault-proxies",
    title: "Proxies",
    description: "The egress proxies that attach credentials",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View proxies, their health and certificate authority fingerprints"
      },
      {
        value: "create",
        label: "Create",
        description: "Register a proxy and issue its enrollment token"
      },
      { value: "edit", label: "Modify", description: "Update proxy settings" },
      { value: "delete", label: "Remove", description: "Delete proxies" },
      {
        value: "issue-token",
        label: "Issue token",
        description: "Issue a replacement enrollment token for a proxy"
      },
      { value: "revoke", label: "Revoke", description: "Revoke a proxy's access token" }
    ]
  },
  {
    subject: "agent-vault-skills",
    title: "Skills",
    description: "The skills access bundles deliver to agents",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View skills, their versions and files" },
      { value: "create", label: "Create", description: "Add skills" },
      { value: "edit", label: "Modify", description: "Publish and restore skill versions" },
      { value: "delete", label: "Remove", description: "Delete skills" }
    ]
  },
  {
    subject: "agent-vault-variables",
    title: "Variables",
    description: "The global variables services can use",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View global variables and the services that use them"
      },
      { value: "create", label: "Create", description: "Add global variables" },
      { value: "edit", label: "Modify", description: "Change a global variable's key or value" },
      { value: "delete", label: "Remove", description: "Delete global variables" },
      { value: "read-value", label: "Read value", description: "Reveal a global variable's value" }
    ]
  }
];

export const APPROVAL_SUBJECTS: PermissionSubject[] = [
  {
    subject: "approval-requests",
    title: "Access requests",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View all pending access requests" },
      { value: "create", label: "Create", description: "Submit new access requests" }
    ]
  },
  {
    subject: "approval-request-grants",
    title: "Access grants",
    description: "Access granted by approved requests",
    conditional: false,
    actions: [
      { value: "read", label: "Read", description: "View active and past access grants" },
      { value: "revoke", label: "Revoke", description: "Revoke active access grants" }
    ]
  }
];
