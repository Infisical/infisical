/* eslint-disable no-param-reassign */
import { z } from "zod";

import { OrgPermissionSubjects } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgGatewayPoolPermissionActions,
  OrgKmipServerPermissionActions,
  OrgPermissionActions,
  OrgPermissionAdminConsoleAction,
  OrgPermissionAppConnectionActions,
  OrgPermissionAuditLogsActions,
  OrgPermissionBillingActions,
  OrgPermissionEmailDomainActions,
  OrgPermissionGroupActions,
  OrgPermissionHoneyTokenActions,
  OrgPermissionIdentityActions,
  OrgPermissionKmipActions,
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionProjectActions,
  OrgPermissionSecretShareAction,
  OrgPermissionSsoActions,
  OrgPermissionSubOrgActions,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { TPermission } from "@app/hooks/api/roles/types";

const generalPermissionSchema = z
  .array(
    z.object({
      read: z.boolean().optional(),
      edit: z.boolean().optional(),
      delete: z.boolean().optional(),
      create: z.boolean().optional()
    })
  )
  .optional();

const auditLogsPermissionSchema = z
  .array(z.object({ [OrgPermissionAuditLogsActions.Read]: z.boolean().optional() }))
  .optional();

const billingPermissionSchema = z
  .array(
    z.object({
      [OrgPermissionBillingActions.Read]: z.boolean().optional(),
      [OrgPermissionBillingActions.ManageBilling]: z.boolean().optional()
    })
  )
  .optional();

const emailDomainPermissionSchema = z
  .array(
    z.object({
      [OrgPermissionEmailDomainActions.Read]: z.boolean().optional(),
      [OrgPermissionEmailDomainActions.Create]: z.boolean().optional(),
      [OrgPermissionEmailDomainActions.VerifyDomain]: z.boolean().optional(),
      [OrgPermissionEmailDomainActions.Delete]: z.boolean().optional()
    })
  )
  .optional();

const appConnectionsPermissionSchema = z
  .array(
    z.object({
      [OrgPermissionAppConnectionActions.Read]: z.boolean().optional(),
      [OrgPermissionAppConnectionActions.Edit]: z.boolean().optional(),
      [OrgPermissionAppConnectionActions.Create]: z.boolean().optional(),
      [OrgPermissionAppConnectionActions.Delete]: z.boolean().optional(),
      [OrgPermissionAppConnectionActions.Connect]: z.boolean().optional(),
      [OrgPermissionAppConnectionActions.RotateCredentials]: z.boolean().optional()
    })
  )
  .optional();

const kmipPermissionSchema = z
  .array(z.object({ [OrgPermissionKmipActions.Proxy]: z.boolean().optional() }))
  .optional();

const identityPermissionSchema = z
  .array(
    z.object({
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
  )
  .optional();

const groupPermissionSchema = z
  .array(
    z.object({
      [OrgPermissionGroupActions.Read]: z.boolean().optional(),
      [OrgPermissionGroupActions.Create]: z.boolean().optional(),
      [OrgPermissionGroupActions.Edit]: z.boolean().optional(),
      [OrgPermissionGroupActions.Delete]: z.boolean().optional(),
      [OrgPermissionGroupActions.GrantPrivileges]: z.boolean().optional(),
      [OrgPermissionGroupActions.AddMembers]: z.boolean().optional(),
      [OrgPermissionGroupActions.RemoveMembers]: z.boolean().optional()
    })
  )
  .optional();

const orgGatewayPermissionSchema = z
  .array(
    z.object({
      [OrgGatewayPermissionActions.ListGateways]: z.boolean().optional(),
      [OrgGatewayPermissionActions.EditGateways]: z.boolean().optional(),
      [OrgGatewayPermissionActions.DeleteGateways]: z.boolean().optional(),
      [OrgGatewayPermissionActions.CreateGateways]: z.boolean().optional(),
      [OrgGatewayPermissionActions.AttachGateways]: z.boolean().optional(),
      [OrgGatewayPermissionActions.RevokeGatewayAccess]: z.boolean().optional()
    })
  )
  .optional();

const orgGatewayPoolPermissionSchema = z
  .array(
    z.object({
      [OrgGatewayPoolPermissionActions.ListGatewayPools]: z.boolean().optional(),
      [OrgGatewayPoolPermissionActions.CreateGatewayPools]: z.boolean().optional(),
      [OrgGatewayPoolPermissionActions.EditGatewayPools]: z.boolean().optional(),
      [OrgGatewayPoolPermissionActions.DeleteGatewayPools]: z.boolean().optional(),
      [OrgGatewayPoolPermissionActions.AttachGatewayPools]: z.boolean().optional()
    })
  )
  .optional();

const orgRelayPermissionSchema = z
  .array(
    z.object({
      [OrgRelayPermissionActions.ListRelays]: z.boolean().optional(),
      [OrgRelayPermissionActions.EditRelays]: z.boolean().optional(),
      [OrgRelayPermissionActions.DeleteRelays]: z.boolean().optional(),
      [OrgRelayPermissionActions.CreateRelays]: z.boolean().optional(),
      [OrgRelayPermissionActions.RevokeRelayAccess]: z.boolean().optional()
    })
  )
  .optional();

const orgKmipServerPermissionSchema = z
  .array(
    z.object({
      [OrgKmipServerPermissionActions.ListKmipServers]: z.boolean().optional(),
      [OrgKmipServerPermissionActions.EditKmipServers]: z.boolean().optional(),
      [OrgKmipServerPermissionActions.DeleteKmipServers]: z.boolean().optional(),
      [OrgKmipServerPermissionActions.CreateKmipServers]: z.boolean().optional(),
      [OrgKmipServerPermissionActions.RevokeKmipServerAccess]: z.boolean().optional()
    })
  )
  .optional();

const machineIdentityAuthTemplatePermissionSchema = z
  .array(
    z.object({
      [OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates]: z.boolean().optional(),
      [OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates]: z.boolean().optional(),
      [OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates]: z.boolean().optional(),
      [OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates]: z.boolean().optional(),
      [OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates]: z.boolean().optional(),
      [OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates]: z.boolean().optional()
    })
  )
  .optional();

const adminConsolePermissionSchmea = z
  .array(z.object({ "access-all-projects": z.boolean().optional() }))
  .optional();

const secretSharingPermissionSchema = z
  .array(z.object({ [OrgPermissionSecretShareAction.ManageSettings]: z.boolean().optional() }))
  .optional();

const subOrganizationPermissionSchema = z
  .array(
    z.object({
      [OrgPermissionSubOrgActions.Create]: z.boolean().optional(),
      [OrgPermissionSubOrgActions.Edit]: z.boolean().optional(),
      [OrgPermissionSubOrgActions.Delete]: z.boolean().optional(),
      [OrgPermissionSubOrgActions.DirectAccess]: z.boolean().optional(),
      [OrgPermissionSubOrgActions.LinkGroup]: z.boolean().optional()
    })
  )
  .optional();

const honeyTokenPermissionSchema = z
  .array(z.object({ [OrgPermissionHoneyTokenActions.Setup]: z.boolean().optional() }))
  .optional();

const projectPermissionSchema = z
  .array(
    z.object({
      [OrgPermissionProjectActions.Create]: z.boolean().optional(),
      [OrgPermissionProjectActions.RequestAccess]: z.boolean().optional()
    })
  )
  .optional();

const ssoPermissionSchema = z
  .array(
    z.object({
      [OrgPermissionSsoActions.Read]: z.boolean().optional(),
      [OrgPermissionSsoActions.Create]: z.boolean().optional(),
      [OrgPermissionSsoActions.Edit]: z.boolean().optional(),
      [OrgPermissionSsoActions.Delete]: z.boolean().optional(),
      [OrgPermissionSsoActions.BypassSsoEnforcement]: z.boolean().optional()
    })
  )
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
      project: projectPermissionSchema,
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
      "github-org-sync": generalPermissionSchema,

      ldap: generalPermissionSchema,
      billing: billingPermissionSchema,
      identity: identityPermissionSchema,
      "organization-admin-console": adminConsolePermissionSchmea,
      [OrgPermissionSubjects.Kms]: generalPermissionSchema,
      [OrgPermissionSubjects.ProjectTemplates]: generalPermissionSchema,
      "app-connections": appConnectionsPermissionSchema,
      kmip: kmipPermissionSchema,
      gateway: orgGatewayPermissionSchema,
      "gateway-pool": orgGatewayPoolPermissionSchema,
      relay: orgRelayPermissionSchema,
      [OrgPermissionSubjects.KmipServer]: orgKmipServerPermissionSchema,
      "machine-identity-auth-template": machineIdentityAuthTemplatePermissionSchema,
      "secret-share": secretSharingPermissionSchema,
      "sub-organization": subOrganizationPermissionSchema,
      "email-domains": emailDomainPermissionSchema,
      "honey-tokens": honeyTokenPermissionSchema
    })
    .optional()
    .superRefine((permissions, ctx) => {
      if (!permissions) return;

      Object.entries(permissions).forEach(([subject, rules]) => {
        if (!Array.isArray(rules)) return;
        rules.forEach((rule, ruleIndex) => {
          if (!rule || typeof rule !== "object") return;
          const hasAction = Object.values(rule).some((value) => value === true);
          if (!hasAction) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "At least one action is required",
              path: [subject, ruleIndex, "actionRequired"]
            });
          }
        });
      });
    })
});

export type TFormSchema = z.infer<typeof formSchema>;
export type TPermissionsKey = keyof NonNullable<TFormSchema["permissions"]>;

export const rolePermission2Form = (permissions: TPermission[] = []) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formVal: Record<string, any> = {};
  permissions.forEach((permission) => {
    const actions = Array.isArray(permission.action) ? permission.action : [permission.action];
    let { subject } = permission;
    if (subject === OrgPermissionSubjects.Workspace) {
      subject = OrgPermissionSubjects.Project;
    }
    if (!formVal?.[subject]) formVal[subject] = [{}];
    actions.forEach((action) => {
      formVal[subject][0][action] = true;
    });
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
      {
        value: OrgPermissionIdentityActions.GrantPrivileges,
        label: "Grant Privileges",
        description: "Assign roles and additional privileges to machine identities"
      },
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
      {
        value: OrgPermissionGroupActions.GrantPrivileges,
        label: "Grant Privileges",
        description: "Assign roles and additional privileges to groups"
      },
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
      },
      {
        value: OrgGatewayPermissionActions.RevokeGatewayAccess,
        label: "Revoke Gateway Access",
        description: "Revoke access to gateways"
      }
    ]
  },
  [OrgPermissionSubjects.GatewayPool]: {
    title: "Gateway Pools",
    description: "Manage gateway pools for grouping gateways",
    actions: [
      {
        value: OrgGatewayPoolPermissionActions.ListGatewayPools,
        label: "List Gateway Pools",
        description: "View available gateway pools"
      },
      {
        value: OrgGatewayPoolPermissionActions.CreateGatewayPools,
        label: "Create Gateway Pools",
        description: "Create new gateway pools"
      },
      {
        value: OrgGatewayPoolPermissionActions.EditGatewayPools,
        label: "Edit Gateway Pools",
        description: "Update gateway pool configuration"
      },
      {
        value: OrgGatewayPoolPermissionActions.DeleteGatewayPools,
        label: "Delete Gateway Pools",
        description: "Remove gateway pools"
      },
      {
        value: OrgGatewayPoolPermissionActions.AttachGatewayPools,
        label: "Attach Gateway Pools",
        description: "Attach gateway pools to organization resources"
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
      },
      {
        value: OrgRelayPermissionActions.RevokeRelayAccess,
        label: "Revoke Relay Access",
        description: "Revoke access to relay servers"
      }
    ]
  },
  [OrgPermissionSubjects.KmipServer]: {
    title: "KMIP Servers",
    description: "Manage KMIP servers that proxy KMIP requests to Infisical KMS",
    actions: [
      {
        value: OrgKmipServerPermissionActions.ListKmipServers,
        label: "List KMIP Servers",
        description: "View available KMIP servers"
      },
      {
        value: OrgKmipServerPermissionActions.CreateKmipServers,
        label: "Create KMIP Servers",
        description: "Add new KMIP servers"
      },
      {
        value: OrgKmipServerPermissionActions.EditKmipServers,
        label: "Edit KMIP Servers",
        description: "Update KMIP server configuration and auth method"
      },
      {
        value: OrgKmipServerPermissionActions.DeleteKmipServers,
        label: "Delete KMIP Servers",
        description: "Remove KMIP servers"
      },
      {
        value: OrgKmipServerPermissionActions.RevokeKmipServerAccess,
        label: "Revoke KMIP Server Access",
        description: "Revoke access to KMIP servers"
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
  [OrgPermissionSubjects.EmailDomains]: {
    title: "Email Domains",
    description: "Manage organization email domain verification and configuration",
    actions: [
      {
        value: OrgPermissionEmailDomainActions.Read,
        label: "View domains",
        description: "View organization email domains"
      },
      {
        value: OrgPermissionEmailDomainActions.Create,
        label: "Add domains",
        description: "Add new email domains to the organization"
      },
      {
        value: OrgPermissionEmailDomainActions.VerifyDomain,
        label: "Verify domains",
        description: "Verify ownership of email domains"
      },
      {
        value: OrgPermissionEmailDomainActions.Delete,
        label: "Delete domains",
        description: "Remove email domains from the organization"
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
  [OrgPermissionSubjects.HoneyTokens]: {
    title: "Honey Tokens",
    description: "Configure honey token setup for the organization",
    actions: [
      {
        value: OrgPermissionHoneyTokenActions.Setup,
        label: "Setup",
        description: "Set up honey tokens for the organization"
      }
    ]
  },
  [OrgPermissionSubjects.Project]: {
    title: "Project",
    description: "Create new projects within the organization",
    actions: [
      {
        value: OrgPermissionProjectActions.Create,
        label: "Create projects",
        description: "Create new projects within the organization"
      },
      {
        value: OrgPermissionProjectActions.RequestAccess,
        label: "Request access",
        description: "Request access to projects in the organization"
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
  // NOTE: The "KMIP" (proxy) org permission is deprecated — KMIP servers now authenticate via
  // enrollment-based access tokens, so the permission is no longer needed and is intentionally
  // not surfaced here. The schema still accepts it so existing roles that carry it keep working.
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
  Object.entries(formVal || {}).forEach(([rule, ruleArr]) => {
    if (!ruleArr?.[0]) return;
    Object.entries(ruleArr[0]).forEach(([action, isAllowed]) => {
      if (isAllowed) {
        permissions.push({ subject: rule, action });
      }
    });
  });

  return permissions;
};
