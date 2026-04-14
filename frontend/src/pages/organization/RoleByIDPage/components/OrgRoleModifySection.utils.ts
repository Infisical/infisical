/* eslint-disable no-param-reassign */
import { z } from "zod";

import { OrgPermissionSubjects } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionActions,
  OrgPermissionAdminConsoleAction,
  OrgPermissionAppConnectionActions,
  OrgPermissionAuditLogsActions,
  OrgPermissionBillingActions,
  OrgPermissionEmailDomainActions,
  OrgPermissionGroupActions,
  OrgPermissionIdentityActions,
  OrgPermissionKmipActions,
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSecretShareAction,
  OrgPermissionSsoActions,
  OrgPermissionSubOrgActions,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { TPermission } from "@app/hooks/api/roles/types";

const generalPermissionSchema = z
  .object({
    read: z.boolean().optional(),
    edit: z.boolean().optional(),
    delete: z.boolean().optional(),
    create: z.boolean().optional()
  })
  .optional();

const auditLogsPermissionSchema = z
  .object({
    [OrgPermissionAuditLogsActions.Read]: z.boolean().optional()
  })
  .optional();

const billingPermissionSchema = z
  .object({
    [OrgPermissionBillingActions.Read]: z.boolean().optional(),
    [OrgPermissionBillingActions.ManageBilling]: z.boolean().optional()
  })
  .optional();

const emailDomainPermissionSchema = z
  .object({
    [OrgPermissionEmailDomainActions.Read]: z.boolean().optional(),
    [OrgPermissionEmailDomainActions.Create]: z.boolean().optional(),
    [OrgPermissionEmailDomainActions.VerifyDomain]: z.boolean().optional(),
    [OrgPermissionEmailDomainActions.Delete]: z.boolean().optional()
  })
  .optional();

const appConnectionsPermissionSchema = z
  .object({
    [OrgPermissionAppConnectionActions.Read]: z.boolean().optional(),
    [OrgPermissionAppConnectionActions.Edit]: z.boolean().optional(),
    [OrgPermissionAppConnectionActions.Create]: z.boolean().optional(),
    [OrgPermissionAppConnectionActions.Delete]: z.boolean().optional(),
    [OrgPermissionAppConnectionActions.Connect]: z.boolean().optional(),
    [OrgPermissionAppConnectionActions.RotateCredentials]: z.boolean().optional()
  })
  .optional();

const kmipPermissionSchema = z
  .object({
    [OrgPermissionKmipActions.Proxy]: z.boolean().optional()
  })
  .optional();

const identityPermissionSchema = z
  .object({
    [OrgPermissionIdentityActions.Read]: z.boolean().optional(),
    [OrgPermissionIdentityActions.Edit]: z.boolean().optional(),
    [OrgPermissionIdentityActions.Delete]: z.boolean().optional(),
    [OrgPermissionIdentityActions.Create]: z.boolean().optional(),
    [OrgPermissionIdentityActions.GrantPrivileges]: z.boolean().optional(),
    [OrgPermissionIdentityActions.RevokeAuth]: z.boolean().optional(),
    [OrgPermissionIdentityActions.CreateToken]: z.boolean().optional(),
    [OrgPermissionIdentityActions.GetToken]: z.boolean().optional(),
    [OrgPermissionIdentityActions.DeleteToken]: z.boolean().optional()
  })
  .optional();

const groupPermissionSchema = z
  .object({
    [OrgPermissionGroupActions.Read]: z.boolean().optional(),
    [OrgPermissionGroupActions.Create]: z.boolean().optional(),
    [OrgPermissionGroupActions.Edit]: z.boolean().optional(),
    [OrgPermissionGroupActions.Delete]: z.boolean().optional(),
    [OrgPermissionGroupActions.GrantPrivileges]: z.boolean().optional(),
    [OrgPermissionGroupActions.AddMembers]: z.boolean().optional(),
    [OrgPermissionGroupActions.RemoveMembers]: z.boolean().optional()
  })
  .optional();

const orgGatewayPermissionSchema = z
  .object({
    [OrgGatewayPermissionActions.ListGateways]: z.boolean().optional(),
    [OrgGatewayPermissionActions.EditGateways]: z.boolean().optional(),
    [OrgGatewayPermissionActions.DeleteGateways]: z.boolean().optional(),
    [OrgGatewayPermissionActions.CreateGateways]: z.boolean().optional(),
    [OrgGatewayPermissionActions.AttachGateways]: z.boolean().optional()
  })
  .optional();

const orgRelayPermissionSchema = z
  .object({
    [OrgRelayPermissionActions.ListRelays]: z.boolean().optional(),
    [OrgRelayPermissionActions.EditRelays]: z.boolean().optional(),
    [OrgRelayPermissionActions.DeleteRelays]: z.boolean().optional(),
    [OrgRelayPermissionActions.CreateRelays]: z.boolean().optional()
  })
  .optional();

const machineIdentityAuthTemplatePermissionSchema = z
  .object({
    [OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates]: z.boolean().optional(),
    [OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates]: z.boolean().optional(),
    [OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates]: z.boolean().optional(),
    [OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates]: z.boolean().optional(),
    [OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates]: z.boolean().optional(),
    [OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates]: z.boolean().optional()
  })
  .optional();

const adminConsolePermissionSchmea = z
  .object({
    "access-all-projects": z.boolean().optional()
  })
  .optional();

const secretSharingPermissionSchema = z
  .object({
    [OrgPermissionSecretShareAction.ManageSettings]: z.boolean().optional()
  })
  .optional();

const subOrganizationPermissionSchema = z
  .object({
    [OrgPermissionSubOrgActions.Create]: z.boolean().optional(),
    [OrgPermissionSubOrgActions.Edit]: z.boolean().optional(),
    [OrgPermissionSubOrgActions.Delete]: z.boolean().optional(),
    [OrgPermissionSubOrgActions.DirectAccess]: z.boolean().optional(),
    [OrgPermissionSubOrgActions.LinkGroup]: z.boolean().optional()
  })
  .optional();

const ssoPermissionSchema = z
  .object({
    [OrgPermissionSsoActions.Read]: z.boolean().optional(),
    [OrgPermissionSsoActions.Create]: z.boolean().optional(),
    [OrgPermissionSsoActions.Edit]: z.boolean().optional(),
    [OrgPermissionSsoActions.Delete]: z.boolean().optional(),
    [OrgPermissionSsoActions.BypassSsoEnforcement]: z.boolean().optional()
  })
  .optional();

export const formSchema = z.object({
  name: z.string().trim(),
  description: z.string().trim().optional(),
  slug: z
    .string()
    .trim()
    .refine((val) => val !== "custom", { message: "Cannot use custom as its a keyword" }),
  permissions: z
    .object({
      project: z
        .object({
          create: z.boolean().optional()
        })
        .optional(),
      "audit-logs": auditLogsPermissionSchema,
      member: generalPermissionSchema,
      groups: groupPermissionSchema,
      role: generalPermissionSchema,
      settings: generalPermissionSchema,
      "service-account": generalPermissionSchema,
      "incident-contact": generalPermissionSchema,
      "secret-scanning": generalPermissionSchema,
      sso: ssoPermissionSchema,
      scim: generalPermissionSchema,
      [OrgPermissionSubjects.GithubOrgSync]: generalPermissionSchema,
      ldap: generalPermissionSchema,
      billing: billingPermissionSchema,
      identity: identityPermissionSchema,
      "organization-admin-console": adminConsolePermissionSchmea,
      [OrgPermissionSubjects.Kms]: generalPermissionSchema,
      [OrgPermissionSubjects.ProjectTemplates]: generalPermissionSchema,
      "app-connections": appConnectionsPermissionSchema,
      kmip: kmipPermissionSchema,
      gateway: orgGatewayPermissionSchema,
      relay: orgRelayPermissionSchema,
      "machine-identity-auth-template": machineIdentityAuthTemplatePermissionSchema,
      "secret-share": secretSharingPermissionSchema,
      "sub-organization": subOrganizationPermissionSchema,
      "email-domains": emailDomainPermissionSchema
    })
    .optional()
});

export type TFormSchema = z.infer<typeof formSchema>;

// convert role permission to form compatiable  data structure
export const rolePermission2Form = (permissions: TPermission[] = []) => {
  // any because if it set it as form type due to the discriminated union type of ts
  // i would have to write a if loop with both conditions same
  const formVal: Record<string, any> = {};
  permissions.forEach((permission) => {
    const { action } = permission;
    let { subject } = permission;
    if (subject === OrgPermissionSubjects.Workspace) {
      subject = OrgPermissionSubjects.Project;
    }
    if (!formVal?.[subject]) formVal[subject] = {};
    formVal[subject][action] = true;
  });

  return formVal;
};

export type TOrgPermissionAction = {
  value: string;
  label: string;
  description?: string;
};

export type TOrgPermissionConfig = {
  title: string;
  description: string;
  actions: readonly TOrgPermissionAction[];
};

export const ORG_PERMISSION_OBJECT: Record<string, TOrgPermissionConfig> = {
  [OrgPermissionSubjects.Member]: {
    title: "User Management",
    description: "Manage organization member access and role assignments",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View all members",
        description: "View organization members and their roles"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Invite members",
        description: "Invite new users to join the organization"
      },
      {
        value: OrgPermissionActions.Edit,
        label: "Edit members",
        description: "Modify member roles and access settings"
      },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove members",
        description: "Remove members from the organization"
      }
    ]
  },
  [OrgPermissionSubjects.Role]: {
    title: "Role Management",
    description: "Define and configure custom organization-level permission roles",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View",
        description: "View organization roles and their permissions"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Create",
        description: "Create new custom organization roles"
      },
      {
        value: OrgPermissionActions.Edit,
        label: "Modify",
        description: "Update role permissions and settings"
      },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove",
        description: "Delete organization roles"
      }
    ]
  },
  [OrgPermissionSubjects.IncidentAccount]: {
    title: "Incident Contacts",
    description: "Manage contacts notified during security incidents",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View contacts",
        description: "View contacts notified during security incidents"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Add new contacts",
        description: "Add new contacts for incident notifications"
      },
      {
        value: OrgPermissionActions.Edit,
        label: "Edit contacts",
        description: "Update existing contact information"
      },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove contacts",
        description: "Remove contacts from incident notifications"
      }
    ]
  },
  [OrgPermissionSubjects.Settings]: {
    title: "Organization Profile",
    description: "Configure organization-wide settings and preferences",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View",
        description: "View organization settings and configuration"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Create",
        description: "Configure new organization settings"
      },
      {
        value: OrgPermissionActions.Edit,
        label: "Modify",
        description: "Update organization profile and settings"
      },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove",
        description: "Remove organization configuration entries"
      }
    ]
  },
  [OrgPermissionSubjects.SecretScanning]: {
    title: "Secret Scanning",
    description: "Configure automated scanning for leaked secrets",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View risks",
        description: "View detected leaked secret risks"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Add integrations",
        description: "Connect new secret scanning integrations"
      },
      {
        value: OrgPermissionActions.Edit,
        label: "Edit risk status",
        description: "Update the status of detected risks"
      },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove integrations",
        description: "Disconnect secret scanning integrations"
      }
    ]
  },
  [OrgPermissionSubjects.Ldap]: {
    title: "LDAP",
    description: "Configure LDAP directory integration for authentication",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View",
        description: "View LDAP directory configuration"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Create",
        description: "Configure LDAP integration"
      },
      { value: OrgPermissionActions.Edit, label: "Modify", description: "Update LDAP settings" },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove",
        description: "Remove LDAP configuration"
      }
    ]
  },
  [OrgPermissionSubjects.Scim]: {
    title: "SCIM",
    description: "Manage SCIM provisioning for automated user lifecycle management",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View",
        description: "View SCIM provisioning configuration"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Create",
        description: "Set up SCIM provisioning"
      },
      { value: OrgPermissionActions.Edit, label: "Modify", description: "Update SCIM settings" },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove",
        description: "Remove SCIM configuration"
      }
    ]
  },
  [OrgPermissionSubjects.GithubOrgSync]: {
    title: "GitHub Organization Sync",
    description: "Sync GitHub organization teams with Infisical groups",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View",
        description: "View GitHub organization sync configuration"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Create",
        description: "Set up GitHub organization team sync"
      },
      {
        value: OrgPermissionActions.Edit,
        label: "Modify",
        description: "Update sync configuration"
      },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove",
        description: "Remove GitHub organization sync"
      }
    ]
  },
  [OrgPermissionSubjects.Kms]: {
    title: "External KMS",
    description: "Configure external key management systems for encryption",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View",
        description: "View external KMS configuration"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Create",
        description: "Configure external key management systems"
      },
      { value: OrgPermissionActions.Edit, label: "Modify", description: "Update KMS settings" },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove",
        description: "Remove external KMS configuration"
      }
    ]
  },
  [OrgPermissionSubjects.ProjectTemplates]: {
    title: "Project Templates",
    description: "Manage reusable templates applied when creating new projects",
    actions: [
      {
        value: OrgPermissionActions.Read,
        label: "View & Apply",
        description: "View and apply templates when creating projects"
      },
      {
        value: OrgPermissionActions.Create,
        label: "Create",
        description: "Create new project templates"
      },
      {
        value: OrgPermissionActions.Edit,
        label: "Modify",
        description: "Update existing project templates"
      },
      {
        value: OrgPermissionActions.Delete,
        label: "Remove",
        description: "Delete project templates"
      }
    ]
  },
  [OrgPermissionSubjects.Sso]: {
    title: "SSO",
    description: "Configure and enforce single sign-on authentication for the organization",
    actions: [
      { value: OrgPermissionSsoActions.Read, label: "View", description: "View SSO configuration" },
      {
        value: OrgPermissionSsoActions.Create,
        label: "Create",
        description: "Set up new SSO providers"
      },
      {
        value: OrgPermissionSsoActions.Edit,
        label: "Modify",
        description: "Update SSO configuration"
      },
      {
        value: OrgPermissionSsoActions.Delete,
        label: "Remove",
        description: "Remove SSO providers"
      },
      {
        value: OrgPermissionSsoActions.BypassSsoEnforcement,
        label: "Bypass SSO Enforcement",
        description: "Allow login without SSO when enforcement is enabled"
      }
    ]
  },
  [OrgPermissionSubjects.AuditLogs]: {
    title: "Audit Logs",
    description: "View organization activity and audit trail",
    actions: [
      {
        value: OrgPermissionAuditLogsActions.Read,
        label: "Read",
        description: "View organization activity and audit events"
      }
    ]
  },
  [OrgPermissionSubjects.Identity]: {
    title: "Machine Identity Management",
    description: "Manage machine identities and their access within the organization",
    actions: [
      {
        value: OrgPermissionIdentityActions.Read,
        label: "Read Identities",
        description: "View machine identities and their configuration"
      },
      {
        value: OrgPermissionIdentityActions.Create,
        label: "Create Identities",
        description: "Create new machine identities"
      },
      {
        value: OrgPermissionIdentityActions.Edit,
        label: "Edit Identities",
        description: "Update machine identity settings"
      },
      {
        value: OrgPermissionIdentityActions.Delete,
        label: "Delete Identities",
        description: "Delete machine identities"
      },
      { value: OrgPermissionIdentityActions.GrantPrivileges, label: "Grant Privileges" },
      {
        value: OrgPermissionIdentityActions.RevokeAuth,
        label: "Revoke Auth",
        description: "Revoke authentication for a machine identity"
      },
      {
        value: OrgPermissionIdentityActions.CreateToken,
        label: "Create Token",
        description: "Generate access tokens for machine identities"
      },
      {
        value: OrgPermissionIdentityActions.GetToken,
        label: "Get Token",
        description: "View existing access tokens"
      },
      {
        value: OrgPermissionIdentityActions.DeleteToken,
        label: "Delete Token",
        description: "Revoke access tokens"
      }
    ]
  },
  [OrgPermissionSubjects.Groups]: {
    title: "Group Management",
    description: "Organize users into groups for bulk permission management",
    actions: [
      {
        value: OrgPermissionGroupActions.Read,
        label: "Read Groups",
        description: "View groups and their members"
      },
      {
        value: OrgPermissionGroupActions.Create,
        label: "Create Groups",
        description: "Create new user groups"
      },
      {
        value: OrgPermissionGroupActions.Edit,
        label: "Edit Groups",
        description: "Update group membership and settings"
      },
      {
        value: OrgPermissionGroupActions.Delete,
        label: "Delete Groups",
        description: "Delete groups"
      },
      { value: OrgPermissionGroupActions.GrantPrivileges, label: "Grant Privileges" },
      {
        value: OrgPermissionGroupActions.AddMembers,
        label: "Add Members",
        description: "Add users to a group"
      },
      {
        value: OrgPermissionGroupActions.RemoveMembers,
        label: "Remove Members",
        description: "Remove users from a group"
      }
    ]
  },
  [OrgPermissionSubjects.AppConnections]: {
    title: "App Connections",
    description: "Manage connections to external platforms and services",
    actions: [
      {
        value: OrgPermissionAppConnectionActions.Read,
        label: "Read",
        description: "View configured app connections"
      },
      {
        value: OrgPermissionAppConnectionActions.Create,
        label: "Create",
        description: "Create new connections to external platforms and services"
      },
      {
        value: OrgPermissionAppConnectionActions.Edit,
        label: "Modify",
        description: "Modify app connection settings"
      },
      {
        value: OrgPermissionAppConnectionActions.Delete,
        label: "Remove",
        description: "Remove app connections"
      },
      {
        value: OrgPermissionAppConnectionActions.Connect,
        label: "Connect",
        description: "Use this connection when configuring syncs and integrations"
      },
      {
        value: OrgPermissionAppConnectionActions.RotateCredentials,
        label: "Rotate Credentials",
        description: "Rotate credentials for app connections"
      }
    ]
  },
  [OrgPermissionSubjects.Gateway]: {
    title: "Gateways",
    description: "Manage gateways used for private network access",
    actions: [
      {
        value: OrgGatewayPermissionActions.ListGateways,
        label: "List Gateways",
        description: "View available gateways"
      },
      {
        value: OrgGatewayPermissionActions.CreateGateways,
        label: "Create Gateways",
        description: "Register new gateways for private network access"
      },
      {
        value: OrgGatewayPermissionActions.EditGateways,
        label: "Edit Gateways",
        description: "Update gateway configuration"
      },
      {
        value: OrgGatewayPermissionActions.DeleteGateways,
        label: "Delete Gateways",
        description: "Remove gateways"
      },
      {
        value: OrgGatewayPermissionActions.AttachGateways,
        label: "Attach Gateways",
        description: "Attach gateways to organization resources"
      }
    ]
  },
  [OrgPermissionSubjects.Relay]: {
    title: "Relays",
    description: "Manage relay servers used for secure network tunneling",
    actions: [
      {
        value: OrgRelayPermissionActions.ListRelays,
        label: "List Relays",
        description: "View available relay servers"
      },
      {
        value: OrgRelayPermissionActions.CreateRelays,
        label: "Create Relays",
        description: "Add new relay servers for network tunneling"
      },
      {
        value: OrgRelayPermissionActions.EditRelays,
        label: "Edit Relays",
        description: "Update relay server configuration"
      },
      {
        value: OrgRelayPermissionActions.DeleteRelays,
        label: "Delete Relays",
        description: "Remove relay servers"
      }
    ]
  },
  [OrgPermissionSubjects.Billing]: {
    title: "Billing",
    description: "View and manage billing details, invoices, and payment methods",
    actions: [
      {
        value: OrgPermissionBillingActions.Read,
        label: "View bills",
        description: "View invoices and billing history"
      },
      {
        value: OrgPermissionBillingActions.ManageBilling,
        label: "Manage billing",
        description: "Update payment methods and billing settings"
      }
    ]
  },
  [OrgPermissionSubjects.SecretShare]: {
    title: "Secret Share",
    description: "Configure settings for sharing secrets externally",
    actions: [
      {
        value: OrgPermissionSecretShareAction.ManageSettings,
        label: "Manage settings",
        description: "Configure settings for sharing secrets externally"
      }
    ]
  },
  [OrgPermissionSubjects.Project]: {
    title: "Project",
    description: "Create new projects within the organization",
    actions: [
      {
        value: OrgPermissionActions.Create,
        label: "Create projects",
        description: "Create new projects within the organization"
      }
    ]
  },
  [OrgPermissionSubjects.AdminConsole]: {
    title: "Organization Admin Console",
    description: "Bypass project membership to access all projects in the organization",
    actions: [
      {
        value: OrgPermissionAdminConsoleAction.AccessAllProjects,
        label: "Access all organization projects",
        description: "Bypass project membership to access all projects in the organization"
      }
    ]
  },
  [OrgPermissionSubjects.MachineIdentityAuthTemplate]: {
    title: "Machine Identity Auth Templates",
    description: "Manage reusable authentication configuration templates for machine identities",
    actions: [
      {
        value: OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates,
        label: "List Templates",
        description: "View available authentication templates"
      },
      {
        value: OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates,
        label: "Create Templates",
        description: "Create reusable authentication configuration templates"
      },
      {
        value: OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates,
        label: "Edit Templates",
        description: "Update authentication template settings"
      },
      {
        value: OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates,
        label: "Delete Templates",
        description: "Remove authentication templates"
      },
      {
        value: OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates,
        label: "Unlink Templates",
        description: "Detach authentication templates from machine identities"
      },
      {
        value: OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
        label: "Attach Templates",
        description: "Apply authentication templates to machine identities"
      }
    ]
  },
  [OrgPermissionSubjects.Kmip]: {
    title: "KMIP",
    description: "Proxy KMIP requests to organization key management infrastructure",
    actions: [
      {
        value: OrgPermissionKmipActions.Proxy,
        label: "Proxy KMIP requests",
        description: "Route KMIP requests to organization key management infrastructure"
      }
    ]
  },
  [OrgPermissionSubjects.SubOrganization]: {
    title: "Sub-Organizations",
    description: "Create and manage namespaces within the organization",
    actions: [
      {
        value: OrgPermissionSubOrgActions.Create,
        label: "Create",
        description: "Create new sub-organizations"
      },
      {
        value: OrgPermissionSubOrgActions.Edit,
        label: "Edit",
        description: "Update sub-organization settings"
      },
      {
        value: OrgPermissionSubOrgActions.Delete,
        label: "Delete",
        description: "Remove sub-organizations"
      },
      {
        value: OrgPermissionSubOrgActions.DirectAccess,
        label: "Direct Access",
        description: "Access sub-organizations directly without membership"
      },
      {
        value: OrgPermissionSubOrgActions.LinkGroup,
        label: "Link Group",
        description: "Link organization groups to sub-organizations"
      }
    ]
  }
};

export const formRolePermission2API = (formVal: TFormSchema["permissions"]) => {
  const permissions: TPermission[] = [];
  Object.entries(formVal || {}).forEach(([rule, actions]) => {
    Object.entries(actions).forEach(([action, isAllowed]) => {
      if (isAllowed) {
        permissions.push({ subject: rule, action });
      }
    });
  });

  return permissions;
};
