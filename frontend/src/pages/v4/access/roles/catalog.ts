export type PermissionAction = { value: string; label: string; description?: string };
export type PermissionSubject = {
  subject: string;
  title: string;
  description: string;
  actions: PermissionAction[];
  conditional?: boolean;
};
export type PolicyTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  permissions: { subject: string; title: string; actions: PermissionAction[] }[];
};

export const ORG_SUBJECTS: PermissionSubject[] = [
  {
    subject: "member",
    title: "User management",
    description: "Manage organization member access and role assignments",
    actions: [
      {
        value: "read",
        label: "View all members",
        description: "View organization members and their roles"
      },
      {
        value: "create",
        label: "Invite members",
        description: "Invite new users to join the organization"
      },
      {
        value: "edit",
        label: "Edit members",
        description: "Update member attributes and activation status"
      },
      {
        value: "delete",
        label: "Remove members",
        description: "Remove members from the organization"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges",
        description: "Assign and change the roles held by organization members"
      }
    ]
  },
  {
    subject: "role",
    title: "Role management",
    description: "Define and configure custom organization-level permission roles",
    actions: [
      {
        value: "read",
        label: "View",
        description: "View organization roles and their permissions"
      },
      {
        value: "create",
        label: "Create",
        description: "Create new custom organization roles"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update role permissions and settings"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete organization roles"
      }
    ]
  },
  {
    subject: "incident-contact",
    title: "Incident contacts",
    description: "Manage contacts notified during security incidents",
    actions: [
      {
        value: "read",
        label: "View contacts",
        description: "View contacts notified during security incidents"
      },
      {
        value: "create",
        label: "Add new contacts",
        description: "Add new contacts for incident notifications"
      },
      {
        value: "edit",
        label: "Edit contacts",
        description: "Update existing contact information"
      },
      {
        value: "delete",
        label: "Remove contacts",
        description: "Remove contacts from incident notifications"
      }
    ]
  },
  {
    subject: "settings",
    title: "Organization profile",
    description: "Configure organization-wide settings and preferences",
    actions: [
      {
        value: "read",
        label: "View",
        description: "View organization settings and configuration"
      },
      {
        value: "create",
        label: "Create",
        description: "Configure new organization settings"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update organization profile and settings"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove organization configuration entries"
      }
    ]
  },
  {
    subject: "secret-scanning",
    title: "Secret scanning",
    description: "Configure automated scanning for leaked secrets",
    actions: [
      {
        value: "read",
        label: "View risks",
        description: "View detected leaked secret risks"
      },
      {
        value: "create",
        label: "Add integrations",
        description: "Connect new secret scanning integrations"
      },
      {
        value: "edit",
        label: "Edit risk status",
        description: "Update the status of detected risks"
      },
      {
        value: "delete",
        label: "Remove integrations",
        description: "Disconnect secret scanning integrations"
      }
    ]
  },
  {
    subject: "ldap",
    title: "LDAP",
    description: "Configure LDAP directory integration for authentication",
    actions: [
      {
        value: "read",
        label: "View",
        description: "View LDAP directory configuration"
      },
      {
        value: "create",
        label: "Create",
        description: "Configure LDAP integration"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update LDAP settings"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove LDAP configuration"
      }
    ]
  },
  {
    subject: "scim",
    title: "SCIM",
    description: "Manage SCIM provisioning for automated user lifecycle management",
    actions: [
      {
        value: "read",
        label: "View",
        description: "View SCIM provisioning configuration"
      },
      {
        value: "create",
        label: "Create",
        description: "Set up SCIM provisioning"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update SCIM settings"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove SCIM configuration"
      }
    ]
  },
  {
    subject: "github-org-sync",
    title: "GitHub organization sync",
    description: "Sync GitHub organization teams with Infisical groups",
    actions: [
      {
        value: "read",
        label: "View",
        description: "View GitHub organization sync configuration"
      },
      {
        value: "create",
        label: "Create",
        description: "Set up GitHub organization team sync"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update sync configuration"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove GitHub organization sync"
      }
    ]
  },
  {
    subject: "kms",
    title: "External KMS",
    description: "Configure external key management systems for encryption",
    actions: [
      {
        value: "read",
        label: "View",
        description: "View external KMS configuration"
      },
      {
        value: "create",
        label: "Create",
        description: "Configure external key management systems"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update KMS settings"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove external KMS configuration"
      }
    ]
  },
  {
    subject: "project-templates",
    title: "Secrets management project templates",
    description: "Manage reusable templates applied when creating new projects",
    actions: [
      {
        value: "read",
        label: "View & apply",
        description: "View and apply templates when creating projects"
      },
      {
        value: "create",
        label: "Create",
        description: "Create new project templates"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update existing project templates"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete project templates"
      }
    ]
  },
  {
    subject: "sso",
    title: "SSO",
    description: "Configure and enforce single sign-on authentication for the organization",
    actions: [
      {
        value: "read",
        label: "View",
        description: "View SSO configuration"
      },
      {
        value: "create",
        label: "Create",
        description: "Set up new SSO providers"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update SSO configuration"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove SSO providers"
      },
      {
        value: "bypass-sso-enforcement",
        label: "Bypass SSO enforcement",
        description: "Allow login without SSO when enforcement is enabled"
      }
    ]
  },
  {
    subject: "audit-logs",
    title: "Audit logs",
    description: "View organization activity and audit trail, and choose which events are recorded",
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View organization activity and audit events"
      },
      {
        value: "edit",
        label: "Edit",
        description: "Choose which audit log event classes the organization records"
      }
    ]
  },
  {
    subject: "identity",
    title: "Machine identity management",
    description: "Manage machine identities and their access within the organization",
    actions: [
      {
        value: "read",
        label: "Read identities",
        description: "View machine identities and their configuration"
      },
      {
        value: "create",
        label: "Create identities",
        description: "Create new machine identities"
      },
      {
        value: "edit",
        label: "Edit identities",
        description: "Update machine identity settings"
      },
      {
        value: "delete",
        label: "Delete identities",
        description: "Delete machine identities"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges",
        description: "Assign roles and additional privileges to machine identities"
      },
      {
        value: "revoke-auth",
        label: "Revoke auth",
        description: "Revoke authentication for a machine identity"
      },
      {
        value: "edit-auth",
        label: "Configure auth",
        description: "Add or update authentication methods for a machine identity"
      },
      {
        value: "create-token",
        label: "Create token",
        description: "Generate access tokens for machine identities"
      },
      {
        value: "get-token",
        label: "Get token",
        description: "View existing access tokens"
      },
      {
        value: "delete-token",
        label: "Delete token",
        description: "Revoke access tokens"
      }
    ]
  },
  {
    subject: "groups",
    title: "Group management",
    description: "Organize users into groups for bulk permission management",
    actions: [
      {
        value: "read",
        label: "Read groups",
        description: "View groups and their members"
      },
      {
        value: "create",
        label: "Create groups",
        description: "Create new user groups"
      },
      {
        value: "edit",
        label: "Edit groups",
        description: "Update group membership and settings"
      },
      {
        value: "delete",
        label: "Delete groups",
        description: "Delete groups"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges",
        description: "Assign roles and additional privileges to groups"
      },
      {
        value: "add-members",
        label: "Add members",
        description: "Add users to a group"
      },
      {
        value: "remove-members",
        label: "Remove members",
        description: "Remove users from a group"
      }
    ]
  },
  {
    subject: "app-connections",
    title: "App connections",
    description: "Manage connections to external platforms and services",
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View configured app connections"
      },
      {
        value: "create",
        label: "Create",
        description: "Create new connections to external platforms and services"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Modify app connection settings"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove app connections"
      },
      {
        value: "connect",
        label: "Connect",
        description: "Use this connection when configuring syncs and integrations"
      },
      {
        value: "rotate-credentials",
        label: "Rotate credentials",
        description: "Rotate credentials for app connections"
      }
    ]
  },
  {
    subject: "gateway",
    title: "Gateways",
    description: "Manage gateways that securely connect Infisical to your infrastructure",
    actions: [
      {
        value: "list-gateways",
        label: "List gateways",
        description: "View available gateways"
      },
      {
        value: "create-gateways",
        label: "Create gateways",
        description:
          "Register new gateways that securely proxy Infisical traffic into your infrastructure"
      },
      {
        value: "edit-gateways",
        label: "Edit gateways",
        description: "Update gateway configuration"
      },
      {
        value: "delete-gateways",
        label: "Delete gateways",
        description: "Remove gateways"
      },
      {
        value: "attach-gateways",
        label: "Attach gateways",
        description: "Attach gateways to organization resources"
      },
      {
        value: "revoke-gateway-access",
        label: "Revoke gateway access",
        description: "Revoke access to gateways"
      }
    ]
  },
  {
    subject: "gateway-pool",
    title: "Gateway pools",
    description: "Manage gateway pools for grouping gateways",
    actions: [
      {
        value: "list-gateway-pools",
        label: "List gateway pools",
        description: "View available gateway pools"
      },
      {
        value: "create-gateway-pools",
        label: "Create gateway pools",
        description: "Create new gateway pools"
      },
      {
        value: "edit-gateway-pools",
        label: "Edit gateway pools",
        description: "Update gateway pool configuration"
      },
      {
        value: "delete-gateway-pools",
        label: "Delete gateway pools",
        description: "Remove gateway pools"
      },
      {
        value: "attach-gateway-pools",
        label: "Attach gateway pools",
        description: "Attach gateway pools to organization resources"
      }
    ]
  },
  {
    subject: "relay",
    title: "Relays",
    description: "Manage relay servers used for secure network tunneling",
    actions: [
      {
        value: "list-relays",
        label: "List relays",
        description: "View available relay servers"
      },
      {
        value: "create-relays",
        label: "Create relays",
        description: "Add new relay servers for network tunneling"
      },
      {
        value: "edit-relays",
        label: "Edit relays",
        description: "Update relay server configuration"
      },
      {
        value: "delete-relays",
        label: "Delete relays",
        description: "Remove relay servers"
      },
      {
        value: "revoke-relay-access",
        label: "Revoke relay access",
        description: "Revoke access to relay servers"
      }
    ]
  },
  {
    subject: "kmip-server",
    title: "KMIP servers",
    description: "Manage KMIP servers that proxy KMIP requests to Infisical KMS",
    actions: [
      {
        value: "list-kmip-servers",
        label: "List KMIP servers",
        description: "View available KMIP servers"
      },
      {
        value: "create-kmip-servers",
        label: "Create KMIP servers",
        description: "Add new KMIP servers"
      },
      {
        value: "edit-kmip-servers",
        label: "Edit KMIP servers",
        description: "Update KMIP server configuration and auth method"
      },
      {
        value: "delete-kmip-servers",
        label: "Delete KMIP servers",
        description: "Remove KMIP servers"
      },
      {
        value: "revoke-kmip-server-access",
        label: "Revoke KMIP server access",
        description: "Revoke access to KMIP servers"
      }
    ]
  },
  {
    subject: "billing",
    title: "Billing",
    description: "View and manage billing details, invoices, and payment methods",
    actions: [
      {
        value: "read",
        label: "View bills",
        description: "View invoices and billing history"
      },
      {
        value: "manage-billing",
        label: "Manage billing",
        description: "Update payment methods and billing settings"
      }
    ]
  },
  {
    subject: "email-domains",
    title: "Email domains",
    description: "Manage organization email domain verification and configuration",
    actions: [
      {
        value: "read",
        label: "View domains",
        description: "View organization email domains"
      },
      {
        value: "create",
        label: "Add domains",
        description: "Add new email domains to the organization"
      },
      {
        value: "verify-domain",
        label: "Verify domains",
        description: "Verify ownership of email domains"
      },
      {
        value: "delete",
        label: "Delete domains",
        description: "Remove email domains from the organization"
      }
    ]
  },
  {
    subject: "secret-share",
    title: "Secrets management secret sharing",
    description: "Configure settings for sharing secrets externally",
    actions: [
      {
        value: "manage-settings",
        label: "Manage settings",
        description: "Configure settings for sharing secrets externally"
      }
    ]
  },
  {
    subject: "secrets-management-insights",
    title: "Secrets management insights",
    description: "View organization-wide secrets management insights and reports",
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View secrets management insights"
      },
      {
        value: "generate-report",
        label: "Generate report",
        description: "Generate new secrets management insight reports"
      },
      {
        value: "delete-report",
        label: "Delete report",
        description: "Delete secrets management insight reports"
      },
      {
        value: "search-all-secret-values",
        label: "Search all secret values",
        description:
          "Locate secrets that share a value in any project, including projects the user isn't a member of"
      }
    ]
  },
  {
    subject: "honey-tokens",
    title: "Secrets management honey tokens",
    description: "Configure honey token setup for the organization",
    actions: [
      {
        value: "setup",
        label: "Setup",
        description: "Set up honey tokens for the organization"
      }
    ]
  },
  {
    subject: "project",
    title: "Project",
    description: "Create new projects within the organization",
    actions: [
      {
        value: "create",
        label: "Create projects",
        description: "Create new projects within the organization"
      },
      {
        value: "request-access",
        label: "Request access",
        description: "Request access to projects in the organization"
      }
    ]
  },
  {
    subject: "organization-admin-console",
    title: "Organization admin console",
    description: "Bypass project membership to access all projects in the organization",
    actions: [
      {
        value: "access-all-projects",
        label: "Access all organization projects",
        description: "Bypass project membership to access all projects in the organization"
      }
    ]
  },
  {
    subject: "machine-identity-auth-template",
    title: "Machine identity auth templates",
    description: "Manage reusable authentication configuration templates for machine identities",
    actions: [
      {
        value: "list-templates",
        label: "List templates",
        description: "View available authentication templates"
      },
      {
        value: "create-templates",
        label: "Create templates",
        description: "Create reusable authentication configuration templates"
      },
      {
        value: "edit-templates",
        label: "Edit templates",
        description: "Update authentication template settings"
      },
      {
        value: "delete-templates",
        label: "Delete templates",
        description: "Remove authentication templates"
      },
      {
        value: "unlink-templates",
        label: "Unlink templates",
        description: "Detach authentication templates from machine identities"
      },
      {
        value: "attach-templates",
        label: "Attach templates",
        description: "Apply authentication templates to machine identities"
      }
    ]
  },
  {
    subject: "sub-organization",
    title: "Sub-organizations",
    description: "Create and manage namespaces within the organization",
    actions: [
      {
        value: "create",
        label: "Create",
        description: "Create new sub-organizations"
      },
      {
        value: "edit",
        label: "Edit",
        description: "Update sub-organization settings"
      },
      {
        value: "delete",
        label: "Delete",
        description: "Remove sub-organizations"
      },
      {
        value: "direct-access",
        label: "Direct access",
        description: "Access sub-organizations directly without membership"
      },
      {
        value: "link-group",
        label: "Link group",
        description: "Link organization groups to sub-organizations"
      }
    ]
  }
];

export const PROJECT_SUBJECTS: PermissionSubject[] = [
  {
    subject: "secrets",
    title: "Secrets",
    description: "Manage secret values, metadata, and access within project environments",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read (legacy)",
        description:
          "This is a legacy action and will be removed in the future. Use Describe Secret and Read Value instead."
      },
      {
        value: "describeSecret",
        label: "Describe secret",
        description:
          "View secret metadata (name, tags, access insights, etc.) without revealing the actual secret value"
      },
      {
        value: "readValue",
        label: "Read value",
        description: "Access and view the actual secret value"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Edit existing secrets and their values"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete secrets from the project"
      },
      {
        value: "create",
        label: "Create",
        description: "Create new secrets in the project"
      }
    ]
  },
  {
    subject: "secret-folders",
    title: "Secret folders",
    description: "Organize secrets into hierarchical folder structures",
    conditional: true,
    actions: [
      {
        value: "create",
        label: "Create",
        description: "Create new folders to organize secrets"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Rename or modify folder properties"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete folders and their contents"
      }
    ]
  },
  {
    subject: "secret-imports",
    title: "Secret imports",
    description: "Import and reference secrets from other environments or projects",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View imported secrets from other projects"
      },
      {
        value: "create",
        label: "Create",
        description: "Set up new secret imports"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Change import configuration"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove secret imports"
      }
    ]
  },
  {
    subject: "dynamic-secrets",
    title: "Dynamic secrets",
    description: "Configure auto-rotating credentials for databases and services",
    conditional: true,
    actions: [
      {
        value: "read-root-credential",
        label: "Read root credentials",
        description: "View the root credentials used for dynamic secret generation"
      },
      {
        value: "create-root-credential",
        label: "Create root credentials",
        description: "Configure new root credentials for dynamic secrets"
      },
      {
        value: "edit-root-credential",
        label: "Modify root credentials",
        description: "Update existing root credentials configuration"
      },
      {
        value: "delete-root-credential",
        label: "Remove root credentials",
        description: "Delete root credentials configuration"
      },
      {
        value: "lease",
        label: "Manage leases",
        description: "Create and revoke dynamic secret leases"
      }
    ]
  },
  {
    subject: "kms",
    title: "Project KMS configuration",
    description: "Configure key management system settings for the project",
    conditional: false,
    actions: [
      {
        value: "edit",
        label: "Modify",
        description: "Change KMS configuration settings for the project"
      }
    ]
  },
  {
    subject: "integrations",
    title: "Native integrations",
    description: "Connect secrets to third-party services and platforms",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View configured integrations"
      },
      {
        value: "create",
        label: "Create",
        description: "Set up new integrations with external services"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update integration configuration"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete integrations"
      }
    ]
  },
  {
    subject: "workspace",
    title: "Project",
    description: "Manage project settings, details, and lifecycle",
    conditional: false,
    actions: [
      {
        value: "edit",
        label: "Update project details",
        description: "Modify project name, description, and settings"
      },
      {
        value: "delete",
        label: "Delete project",
        description: "Permanently delete the entire project"
      }
    ]
  },
  {
    subject: "role",
    title: "Roles",
    description: "Define and configure custom permission roles",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View roles and their permissions"
      },
      {
        value: "create",
        label: "Create",
        description: "Create new custom roles"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update role permissions and policies"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete custom roles"
      }
    ]
  },
  {
    subject: "member",
    title: "User management",
    description: "Manage project member access and role assignments",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View project members and their roles"
      },
      {
        value: "create",
        label: "Add",
        description: "Invite new users to the project"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Change user roles and permissions"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove users from the project"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges (legacy)",
        description:
          "Legacy action that combines role assignment and additional privileges granting without any conditions. Use Assign Roles and Assign Additional Privileges instead."
      },
      {
        value: "assign-role",
        label: "Assign roles",
        description: "Assign or update roles for project members"
      },
      {
        value: "assign-additional-privileges",
        label: "Assign additional privileges",
        description: "Grant additional privileges to project members"
      },
      {
        value: "assume-privileges",
        label: "Assume privileges",
        description: "Temporarily assume another user's privileges"
      }
    ]
  },
  {
    subject: "identity",
    title: "Machine identity management",
    description: "Manage machine identities and their access to secrets",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View machine identities and their configuration"
      },
      {
        value: "create",
        label: "Add",
        description: "Create new machine identities for automation"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update machine identity settings"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete machine identities"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges (legacy)",
        description:
          "Legacy action that combines role assignment and additional privileges granting without any conditions. Use Assign Roles and Assign Additional Privileges instead."
      },
      {
        value: "assign-role",
        label: "Assign roles",
        description: "Assign or update roles for machine identities"
      },
      {
        value: "assign-additional-privileges",
        label: "Assign additional privileges",
        description: "Grant additional privileges to machine identities"
      },
      {
        value: "assume-privileges",
        label: "Assume privileges",
        description: "Temporarily assume another identity's privileges"
      },
      {
        value: "revoke-auth",
        label: "Revoke auth",
        description: "Revoke authentication for a machine identity"
      },
      {
        value: "edit-auth",
        label: "Configure auth methods",
        description: "Add or update authentication methods for a machine identity"
      },
      {
        value: "create-token",
        label: "Create token",
        description: "Generate access tokens for machine identities"
      },
      {
        value: "get-token",
        label: "Get token",
        description: "View existing access tokens"
      },
      {
        value: "delete-token",
        label: "Delete token",
        description: "Revoke access tokens"
      }
    ]
  },
  {
    subject: "groups",
    title: "Group management",
    description: "Organize users into groups for bulk permission management",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View groups and their members"
      },
      {
        value: "create",
        label: "Create",
        description: "Create new user groups"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update group membership and settings"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete groups"
      },
      {
        value: "grant-privileges",
        label: "Grant privileges (legacy)",
        description: "Legacy action. Use Assign Roles instead."
      },
      {
        value: "assign-role",
        label: "Assign roles",
        description: "Assign project roles to groups"
      }
    ]
  },
  {
    subject: "webhooks",
    title: "Webhooks",
    description: "Configure automated notifications for secret events",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View configured webhooks"
      },
      {
        value: "create",
        label: "Create",
        description: "Set up new webhooks for event notifications"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update webhook configuration and triggers"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete webhooks"
      }
    ]
  },
  {
    subject: "service-tokens",
    title: "Service tokens",
    description: "Create and manage tokens for programmatic access",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View service tokens"
      },
      {
        value: "create",
        label: "Create",
        description: "Generate new service tokens for API access"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update service token configuration"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Revoke service tokens"
      }
    ]
  },
  {
    subject: "honey-tokens",
    title: "Honey tokens",
    description: "Create and manage honey tokens and triggered events",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View honey tokens and events"
      },
      {
        value: "read-credentials",
        label: "Read credentials",
        description: "Reveal honey token credentials"
      },
      {
        value: "create",
        label: "Create",
        description: "Create honey tokens"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update honey token metadata and mappings"
      },
      {
        value: "reset",
        label: "Reset",
        description: "Reset triggered honey tokens"
      },
      {
        value: "revoke",
        label: "Revoke",
        description: "Revoke honey tokens and credentials"
      }
    ]
  },
  {
    subject: "proxied-services",
    title: "Proxied services",
    description: "Manage proxied services and route agent traffic through them",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View proxied services"
      },
      {
        value: "create",
        label: "Create",
        description: "Create proxied services"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update proxied service configuration"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete proxied services"
      },
      {
        value: "proxy",
        label: "Proxy",
        description: "Route traffic through proxied services (for agent identities)"
      },
      {
        value: "report-usage",
        label: "Report usage",
        description: "Record last-used timestamps for proxied services (for the agent proxy)"
      }
    ]
  },
  {
    subject: "settings",
    title: "Settings",
    description: "Configure project-level settings and preferences",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View project settings"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Change project settings and configuration"
      }
    ]
  },
  {
    subject: "secret-validation-rules",
    title: "Secret validation rules",
    description: "Define the constraints secrets and generated credentials must satisfy",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View validation rules"
      },
      {
        value: "create",
        label: "Create",
        description: "Add validation rules"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Change validation rules"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete validation rules"
      }
    ]
  },
  {
    subject: "environments",
    title: "Environment management",
    description: "Create and manage project environments",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View environments (dev, staging, prod, etc.)"
      },
      {
        value: "create",
        label: "Create",
        description: "Create new environments"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update environment configuration"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete environments"
      }
    ]
  },
  {
    subject: "commits",
    title: "Commits",
    description: "View and manage secret version history",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "View",
        description: "View secret change history and commits"
      },
      {
        value: "perform-rollback",
        label: "Perform rollback",
        description: "Rollback secrets to a previous commit"
      }
    ]
  },
  {
    subject: "tags",
    title: "Tags",
    description: "Organize and categorize secrets with labels",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View secret tags"
      },
      {
        value: "create",
        label: "Create",
        description: "Create new tags for organizing secrets"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update tag properties"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete tags"
      }
    ]
  },
  {
    subject: "audit-logs",
    title: "Audit logs",
    description: "View project activity and audit trail, and choose which events are recorded",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View audit logs and security events"
      },
      {
        value: "edit",
        label: "Edit",
        description:
          "Choose which audit log event classes the project records and how long it keeps its audit logs"
      }
    ]
  },
  {
    subject: "insights",
    title: "Insights",
    description: "View project analytics and insights dashboards, and generate reports",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description:
          "View secret access volume, locations, auth methods, calendar insights, and reports"
      },
      {
        value: "generate-report",
        label: "Generate report",
        description: "Generate new reports"
      },
      {
        value: "delete-report",
        label: "Delete report",
        description: "Delete reports"
      }
    ]
  },
  {
    subject: "ip-allowlist",
    title: "IP allowlist",
    description: "Restrict project access by IP address",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View IP allowlist configuration"
      },
      {
        value: "create",
        label: "Create",
        description: "Add IP addresses to the allowlist"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update IP allowlist entries"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Remove IP addresses from the allowlist"
      }
    ]
  },
  {
    subject: "secret-approval",
    title: "Approval policies",
    description: "Define approval workflows for secret changes and access requests",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View approval policies"
      },
      {
        value: "create",
        label: "Create",
        description: "Create new approval policies"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update approval policy rules"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete approval policies"
      }
    ]
  },
  {
    subject: "secret-rotation",
    title: "Secret rotation",
    description: "Configure automatic secret rotation policies",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read config",
        description: "View secret rotation configurations"
      },
      {
        value: "read-generated-credentials",
        label: "Read generated credentials",
        description: "Access rotated credential values"
      },
      {
        value: "create",
        label: "Create config",
        description: "Create new secret rotation configuration"
      },
      {
        value: "edit",
        label: "Modify config",
        description: "Update rotation configuration"
      },
      {
        value: "delete",
        label: "Remove config",
        description: "Delete rotation configurations"
      },
      {
        value: "rotate-secrets",
        label: "Rotate secrets",
        description: "Manually trigger secret rotation"
      }
    ]
  },
  {
    subject: "secret-syncs",
    title: "Secret syncs",
    description: "Sync secrets across environments and projects",
    conditional: true,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View secret sync configurations"
      },
      {
        value: "create",
        label: "Create",
        description: "Set up new secret syncs to external destinations"
      },
      {
        value: "edit",
        label: "Modify",
        description: "Update sync configuration"
      },
      {
        value: "delete",
        label: "Remove",
        description: "Delete secret sync configurations"
      },
      {
        value: "sync-secrets",
        label: "Trigger syncs",
        description: "Manually trigger secret synchronization"
      },
      {
        value: "import-secrets",
        label: "Import secrets from destination",
        description: "Import secrets from the sync destination"
      },
      {
        value: "remove-secrets",
        label: "Remove secrets from destination",
        description: "Remove synced secrets from the destination"
      }
    ]
  },
  {
    subject: "secret-event-subscriptions",
    title: "Secret event subscriptions",
    description: "Subscribe to secret lifecycle events",
    conditional: true,
    actions: [
      {
        value: "subscribe-to-creation-events",
        label: "Subscribe to creation events",
        description: "Receive notifications when secrets are created"
      },
      {
        value: "subscribe-to-deletion-events",
        label: "Subscribe to deletion events",
        description: "Receive notifications when secrets are deleted"
      },
      {
        value: "subscribe-to-update-events",
        label: "Subscribe to update events",
        description: "Receive notifications when secrets are updated"
      },
      {
        value: "subscribe-to-import-mutation-events",
        label: "Subscribe to import mutation events",
        description: "Receive notifications when secret imports change"
      }
    ]
  },
  {
    subject: "app-connections",
    title: "App connections",
    description: "Manage connections to external platforms and services",
    conditional: true,
    actions: [
      {
        value: "read-app-connections",
        label: "Read",
        description: "View configured app connections"
      },
      {
        value: "create-app-connections",
        label: "Create",
        description: "Create new connections to external platforms and services"
      },
      {
        value: "edit-app-connections",
        label: "Update",
        description: "Modify app connection settings"
      },
      {
        value: "delete-app-connections",
        label: "Delete",
        description: "Remove app connections"
      },
      {
        value: "connect-app-connections",
        label: "Connect",
        description: "Establish connections to external platforms and services"
      },
      {
        value: "rotate-credentials",
        label: "Rotate credentials",
        description: "Rotate credentials for app connections"
      }
    ]
  },
  {
    subject: "project-folder-grant",
    title: "Project folder grants",
    description: "Grant or revoke access to secrets in specific environments and paths",
    conditional: true,
    actions: [
      {
        value: "read-grant",
        label: "Read",
        description: "View existing project folder grants"
      },
      {
        value: "create-grant",
        label: "Create grant",
        description: "Grant access to secrets in specified environments and secret paths"
      },
      {
        value: "revoke-grant",
        label: "Revoke grant",
        description: "Revoke previously granted access to secrets"
      }
    ]
  },
  {
    subject: "secret-approval-request",
    title: "Secret approval requests",
    description: "View secret change requests pending approval",
    conditional: false,
    actions: [
      {
        value: "read",
        label: "Read",
        description: "View pending secret change requests"
      }
    ]
  }
];

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "secret-viewer",
    name: "Secret viewing policies",
    description: "Grants read access to secrets and related resources",
    icon: "Eye",
    permissions: [
      {
        subject: "secret-rollback",
        title: "Secret rollback",
        actions: [
          {
            value: "read",
            label: "View",
            description: "View rollback history"
          }
        ]
      },
      {
        subject: "secret-imports",
        title: "Secret imports",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View imported secrets from other projects"
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
            description:
              "View secret metadata (name, tags, access insights, etc.) without revealing the actual secret value"
          },
          {
            value: "readValue",
            label: "Read value",
            description: "Access and view the actual secret value"
          }
        ]
      },
      {
        subject: "dynamic-secrets",
        title: "Dynamic secrets",
        actions: [
          {
            value: "read-root-credential",
            label: "Read root credentials",
            description: "View the root credentials used for dynamic secret generation"
          }
        ]
      },
      {
        subject: "environments",
        title: "Environment management",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View environments (dev, staging, prod, etc.)"
          }
        ]
      },
      {
        subject: "tags",
        title: "Tags",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View secret tags"
          }
        ]
      },
      {
        subject: "secret-rotation",
        title: "Secret rotation",
        actions: [
          {
            value: "read",
            label: "Read config",
            description: "View secret rotation configurations"
          }
        ]
      },
      {
        subject: "integrations",
        title: "Native integrations",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View configured integrations"
          }
        ]
      },
      {
        subject: "secret-syncs",
        title: "Secret syncs",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View secret sync configurations"
          }
        ]
      },
      {
        subject: "commits",
        title: "Commits",
        actions: [
          {
            value: "read",
            label: "View",
            description: "View secret change history and commits"
          }
        ]
      },
      {
        subject: "honey-tokens",
        title: "Honey tokens",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View honey tokens and events"
          }
        ]
      },
      {
        subject: "proxied-services",
        title: "Proxied services",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View proxied services"
          }
        ]
      }
    ]
  },
  {
    id: "secret-editor",
    name: "Secret editing policies",
    description: "Grants read and edit access to secrets and related resources",
    icon: "Pencil",
    permissions: [
      {
        subject: "environments",
        title: "Environment management",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View environments (dev, staging, prod, etc.)"
          },
          {
            value: "create",
            label: "Create",
            description: "Create new environments"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update environment configuration"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete environments"
          }
        ]
      },
      {
        subject: "dynamic-secrets",
        title: "Dynamic secrets",
        actions: [
          {
            value: "read-root-credential",
            label: "Read root credentials",
            description: "View the root credentials used for dynamic secret generation"
          },
          {
            value: "create-root-credential",
            label: "Create root credentials",
            description: "Configure new root credentials for dynamic secrets"
          },
          {
            value: "edit-root-credential",
            label: "Modify root credentials",
            description: "Update existing root credentials configuration"
          },
          {
            value: "delete-root-credential",
            label: "Remove root credentials",
            description: "Delete root credentials configuration"
          },
          {
            value: "lease",
            label: "Manage leases",
            description: "Create and revoke dynamic secret leases"
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
            description:
              "View secret metadata (name, tags, access insights, etc.) without revealing the actual secret value"
          },
          {
            value: "readValue",
            label: "Read value",
            description: "Access and view the actual secret value"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Edit existing secrets and their values"
          },
          {
            value: "create",
            label: "Create",
            description: "Create new secrets in the project"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete secrets from the project"
          }
        ]
      },
      {
        subject: "secret-rollback",
        title: "Secret rollback",
        actions: [
          {
            value: "read",
            label: "View",
            description: "View rollback history"
          },
          {
            value: "create",
            label: "Perform rollback",
            description: "Rollback secrets to a previous version"
          }
        ]
      },
      {
        subject: "tags",
        title: "Tags",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View secret tags"
          },
          {
            value: "create",
            label: "Create",
            description: "Create new tags for organizing secrets"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update tag properties"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete tags"
          }
        ]
      },
      {
        subject: "secret-imports",
        title: "Secret imports",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View imported secrets from other projects"
          },
          {
            value: "create",
            label: "Create",
            description: "Set up new secret imports"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Change import configuration"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Remove secret imports"
          }
        ]
      },
      {
        subject: "secret-rotation",
        title: "Secret rotation",
        actions: [
          {
            value: "read",
            label: "Read config",
            description: "View secret rotation configurations"
          },
          {
            value: "read-generated-credentials",
            label: "Read generated credentials",
            description: "Access rotated credential values"
          },
          {
            value: "create",
            label: "Create config",
            description: "Create new secret rotation configuration"
          },
          {
            value: "edit",
            label: "Modify config",
            description: "Update rotation configuration"
          },
          {
            value: "delete",
            label: "Remove config",
            description: "Delete rotation configurations"
          },
          {
            value: "rotate-secrets",
            label: "Rotate secrets",
            description: "Manually trigger secret rotation"
          }
        ]
      },
      {
        subject: "secret-folders",
        title: "Secret folders",
        actions: [
          {
            value: "create",
            label: "Create",
            description: "Create new folders to organize secrets"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Rename or modify folder properties"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete folders and their contents"
          }
        ]
      },
      {
        subject: "integrations",
        title: "Native integrations",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View configured integrations"
          },
          {
            value: "create",
            label: "Create",
            description: "Set up new integrations with external services"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update integration configuration"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete integrations"
          }
        ]
      },
      {
        subject: "secret-syncs",
        title: "Secret syncs",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View secret sync configurations"
          },
          {
            value: "create",
            label: "Create",
            description: "Set up new secret syncs to external destinations"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update sync configuration"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete secret sync configurations"
          },
          {
            value: "sync-secrets",
            label: "Trigger syncs",
            description: "Manually trigger secret synchronization"
          },
          {
            value: "import-secrets",
            label: "Import secrets from destination",
            description: "Import secrets from the sync destination"
          },
          {
            value: "remove-secrets",
            label: "Remove secrets from destination",
            description: "Remove synced secrets from the destination"
          }
        ]
      },
      {
        subject: "commits",
        title: "Commits",
        actions: [
          {
            value: "read",
            label: "View",
            description: "View secret change history and commits"
          },
          {
            value: "perform-rollback",
            label: "Perform rollback",
            description: "Rollback secrets to a previous commit"
          }
        ]
      },
      {
        subject: "honey-tokens",
        title: "Honey tokens",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View honey tokens and events"
          },
          {
            value: "read-credentials",
            label: "Read credentials",
            description: "Reveal honey token credentials"
          },
          {
            value: "create",
            label: "Create",
            description: "Create honey tokens"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update honey token metadata and mappings"
          },
          {
            value: "reset",
            label: "Reset",
            description: "Reset triggered honey tokens"
          },
          {
            value: "revoke",
            label: "Revoke",
            description: "Revoke honey tokens and credentials"
          }
        ]
      },
      {
        subject: "proxied-services",
        title: "Proxied services",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View proxied services"
          },
          {
            value: "create",
            label: "Create",
            description: "Create proxied services"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update proxied service configuration"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete proxied services"
          },
          {
            value: "proxy",
            label: "Proxy",
            description: "Route traffic through proxied services (for agent identities)"
          },
          {
            value: "report-usage",
            label: "Report usage",
            description: "Record last-used timestamps for proxied services (for the agent proxy)"
          }
        ]
      }
    ]
  },
  {
    id: "project-manager",
    name: "Project management policies",
    description: "Grants access to manage project members and settings",
    icon: "Users",
    permissions: [
      {
        subject: "audit-logs",
        title: "Audit logs",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View audit logs and security events"
          }
        ]
      },
      {
        subject: "groups",
        title: "Group management",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View groups and their members"
          },
          {
            value: "create",
            label: "Create",
            description: "Create new user groups"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update group membership and settings"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete groups"
          },
          {
            value: "assign-role",
            label: "Assign roles",
            description: "Assign project roles to groups"
          }
        ]
      },
      {
        subject: "member",
        title: "User management",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View project members and their roles"
          },
          {
            value: "create",
            label: "Add",
            description: "Invite new users to the project"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Change user roles and permissions"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Remove users from the project"
          },
          {
            value: "assign-role",
            label: "Assign roles",
            description: "Assign or update roles for project members"
          },
          {
            value: "assign-additional-privileges",
            label: "Assign additional privileges",
            description: "Grant additional privileges to project members"
          },
          {
            value: "assume-privileges",
            label: "Assume privileges",
            description: "Temporarily assume another user's privileges"
          }
        ]
      },
      {
        subject: "identity",
        title: "Machine identity management",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View machine identities and their configuration"
          },
          {
            value: "create",
            label: "Add",
            description: "Create new machine identities for automation"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update machine identity settings"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete machine identities"
          },
          {
            value: "assign-role",
            label: "Assign roles",
            description: "Assign or update roles for machine identities"
          },
          {
            value: "assign-additional-privileges",
            label: "Assign additional privileges",
            description: "Grant additional privileges to machine identities"
          },
          {
            value: "assume-privileges",
            label: "Assume privileges",
            description: "Temporarily assume another identity's privileges"
          },
          {
            value: "revoke-auth",
            label: "Revoke auth",
            description: "Revoke authentication for a machine identity"
          },
          {
            value: "edit-auth",
            label: "Configure auth methods",
            description: "Add or update authentication methods for a machine identity"
          },
          {
            value: "create-token",
            label: "Create token",
            description: "Generate access tokens for machine identities"
          },
          {
            value: "get-token",
            label: "Get token",
            description: "View existing access tokens"
          },
          {
            value: "delete-token",
            label: "Delete token",
            description: "Revoke access tokens"
          }
        ]
      },
      {
        subject: "workspace",
        title: "Project",
        actions: [
          {
            value: "edit",
            label: "Update project details",
            description: "Modify project name, description, and settings"
          },
          {
            value: "delete",
            label: "Delete project",
            description: "Permanently delete the entire project"
          }
        ]
      },
      {
        subject: "role",
        title: "Roles",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View roles and their permissions"
          },
          {
            value: "create",
            label: "Create",
            description: "Create new custom roles"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update role permissions and policies"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete custom roles"
          }
        ]
      },
      {
        subject: "settings",
        title: "Settings",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View project settings"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Change project settings and configuration"
          }
        ]
      },
      {
        subject: "ip-allowlist",
        title: "IP allowlist",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View IP allowlist configuration"
          },
          {
            value: "create",
            label: "Create",
            description: "Add IP addresses to the allowlist"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update IP allowlist entries"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Remove IP addresses from the allowlist"
          }
        ]
      },
      {
        subject: "kms",
        title: "Project KMS configuration",
        actions: [
          {
            value: "edit",
            label: "Modify",
            description: "Change KMS configuration settings for the project"
          }
        ]
      },
      {
        subject: "secret-approval",
        title: "Approval policies",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View approval policies"
          },
          {
            value: "create",
            label: "Create",
            description: "Create new approval policies"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update approval policy rules"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete approval policies"
          }
        ]
      },
      {
        subject: "service-tokens",
        title: "Service tokens",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View service tokens"
          },
          {
            value: "create",
            label: "Create",
            description: "Generate new service tokens for API access"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update service token configuration"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Revoke service tokens"
          }
        ]
      },
      {
        subject: "honey-tokens",
        title: "Honey tokens",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View honey tokens and events"
          },
          {
            value: "read-credentials",
            label: "Read credentials",
            description: "Reveal honey token credentials"
          },
          {
            value: "create",
            label: "Create",
            description: "Create honey tokens"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update honey token metadata and mappings"
          },
          {
            value: "reset",
            label: "Reset",
            description: "Reset triggered honey tokens"
          },
          {
            value: "revoke",
            label: "Revoke",
            description: "Revoke honey tokens and credentials"
          }
        ]
      },
      {
        subject: "proxied-services",
        title: "Proxied services",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View proxied services"
          },
          {
            value: "create",
            label: "Create",
            description: "Create proxied services"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update proxied service configuration"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete proxied services"
          },
          {
            value: "proxy",
            label: "Proxy",
            description: "Route traffic through proxied services (for agent identities)"
          },
          {
            value: "report-usage",
            label: "Report usage",
            description: "Record last-used timestamps for proxied services (for the agent proxy)"
          }
        ]
      },
      {
        subject: "webhooks",
        title: "Webhooks",
        actions: [
          {
            value: "read",
            label: "Read",
            description: "View configured webhooks"
          },
          {
            value: "create",
            label: "Create",
            description: "Set up new webhooks for event notifications"
          },
          {
            value: "edit",
            label: "Modify",
            description: "Update webhook configuration and triggers"
          },
          {
            value: "delete",
            label: "Remove",
            description: "Delete webhooks"
          }
        ]
      }
    ]
  },
  {
    id: "agent-proxy",
    name: "Agent proxy policies",
    description: "Reads secret values, mints dynamic secret leases, and reports service usage",
    icon: "Share2",
    permissions: [
      {
        subject: "secrets",
        title: "Secrets",
        actions: [
          {
            value: "describeSecret",
            label: "Describe secret",
            description:
              "View secret metadata (name, tags, access insights, etc.) without revealing the actual secret value"
          },
          {
            value: "readValue",
            label: "Read value",
            description: "Access and view the actual secret value"
          }
        ]
      },
      {
        subject: "dynamic-secrets",
        title: "Dynamic secrets",
        actions: [
          {
            value: "lease",
            label: "Manage leases",
            description: "Create and revoke dynamic secret leases"
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
            description: "Record last-used timestamps for proxied services (for the agent proxy)"
          }
        ]
      }
    ]
  },
  {
    id: "agent",
    name: "Agent policies",
    description: "Routes traffic through proxied services",
    icon: "Bot",
    permissions: [
      {
        subject: "proxied-services",
        title: "Proxied services",
        actions: [
          {
            value: "proxy",
            label: "Proxy",
            description: "Route traffic through proxied services (for agent identities)"
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
