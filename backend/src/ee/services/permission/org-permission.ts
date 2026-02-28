import { AbilityBuilder, createMongoAbility, ForcedSubject, MongoAbility } from "@casl/ability";
import { z } from "zod";

import {
  CASL_ACTION_SCHEMA_ENUM,
  CASL_ACTION_SCHEMA_NATIVE_ENUM
} from "@app/ee/services/permission/permission-schemas";
import { PermissionConditionSchema } from "@app/ee/services/permission/permission-types";
import { PermissionConditionOperators } from "@app/lib/casl";

export enum OrgPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum OrgPermissionSubOrgActions {
  Create = "create",
  DirectAccess = "direct-access",
  LinkGroup = "link-group"
}

export enum OrgPermissionAppConnectionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  Connect = "connect"
}

export enum OrgPermissionAuditLogsActions {
  Read = "read"
}

export enum OrgPermissionKmipActions {
  Proxy = "proxy",
  Setup = "setup"
}

export enum OrgPermissionMachineIdentityAuthTemplateActions {
  ListTemplates = "list-templates",
  EditTemplates = "edit-templates",
  CreateTemplates = "create-templates",
  DeleteTemplates = "delete-templates",
  UnlinkTemplates = "unlink-templates",
  AttachTemplates = "attach-templates"
}

export enum OrgPermissionAdminConsoleAction {
  AccessAllProjects = "access-all-projects"
}

export enum OrgPermissionSecretShareAction {
  ManageSettings = "manage-settings"
}

export enum OrgPermissionGatewayActions {
  // is there a better word for this. This mean can an identity be a gateway
  CreateGateways = "create-gateways",
  ListGateways = "list-gateways",
  EditGateways = "edit-gateways",
  DeleteGateways = "delete-gateways",
  AttachGateways = "attach-gateways"
}

export enum OrgPermissionRelayActions {
  CreateRelays = "create-relays",
  ListRelays = "list-relays",
  EditRelays = "edit-relays",
  DeleteRelays = "delete-relays"
}

export enum OrgPermissionIdentityActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges",
  RevokeAuth = "revoke-auth",
  CreateToken = "create-token",
  GetToken = "get-token",
  DeleteToken = "delete-token"
}

export enum OrgPermissionGroupActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges",
  AddIdentities = "add-identities",
  AddMembers = "add-members",
  RemoveMembers = "remove-members",
  RemoveIdentities = "remove-identities"
}

export enum OrgPermissionBillingActions {
  Read = "read",
  ManageBilling = "manage-billing"
}

export enum OrgPermissionSubjects {
  Workspace = "workspace",
  Project = "project",
  Role = "role",
  Member = "member",
  Settings = "settings",
  IncidentAccount = "incident-contact",
  Sso = "sso",
  Scim = "scim",
  GithubOrgSync = "github-org-sync",
  GithubOrgSyncManual = "github-org-sync-manual",
  Ldap = "ldap",
  Groups = "groups",
  Billing = "billing",
  SecretScanning = "secret-scanning",
  Identity = "identity",
  Kms = "kms",
  AdminConsole = "organization-admin-console",
  MachineIdentityAuthTemplate = "machine-identity-auth-template",
  AuditLogs = "audit-logs",
  ProjectTemplates = "project-templates",
  AppConnections = "app-connections",
  Kmip = "kmip",
  Gateway = "gateway",
  Relay = "relay",
  SecretShare = "secret-share",
  SubOrganization = "sub-organization"
}

export type AppConnectionSubjectFields = {
  connectionId: string;
};

export type OrgPermissionSet =
  | [OrgPermissionActions.Create, OrgPermissionSubjects.Workspace]
  | [OrgPermissionActions.Create, OrgPermissionSubjects.Project]
  | [OrgPermissionActions, OrgPermissionSubjects.Role]
  | [OrgPermissionSubOrgActions, OrgPermissionSubjects.SubOrganization]
  | [OrgPermissionActions, OrgPermissionSubjects.Member]
  | [OrgPermissionActions, OrgPermissionSubjects.Settings]
  | [OrgPermissionActions, OrgPermissionSubjects.IncidentAccount]
  | [OrgPermissionActions, OrgPermissionSubjects.Sso]
  | [OrgPermissionActions, OrgPermissionSubjects.Scim]
  | [OrgPermissionActions, OrgPermissionSubjects.GithubOrgSync]
  | [OrgPermissionActions, OrgPermissionSubjects.GithubOrgSyncManual]
  | [OrgPermissionActions, OrgPermissionSubjects.Ldap]
  | [OrgPermissionGroupActions, OrgPermissionSubjects.Groups]
  | [OrgPermissionActions, OrgPermissionSubjects.SecretScanning]
  | [OrgPermissionBillingActions, OrgPermissionSubjects.Billing]
  | [OrgPermissionIdentityActions, OrgPermissionSubjects.Identity]
  | [OrgPermissionActions, OrgPermissionSubjects.Kms]
  | [OrgPermissionAuditLogsActions, OrgPermissionSubjects.AuditLogs]
  | [OrgPermissionActions, OrgPermissionSubjects.ProjectTemplates]
  | [OrgPermissionGatewayActions, OrgPermissionSubjects.Gateway]
  | [OrgPermissionRelayActions, OrgPermissionSubjects.Relay]
  | [
      OrgPermissionAppConnectionActions,
      (
        | OrgPermissionSubjects.AppConnections
        | (ForcedSubject<OrgPermissionSubjects.AppConnections> & AppConnectionSubjectFields)
      )
    ]
  | [OrgPermissionAdminConsoleAction, OrgPermissionSubjects.AdminConsole]
  | [OrgPermissionMachineIdentityAuthTemplateActions, OrgPermissionSubjects.MachineIdentityAuthTemplate]
  | [OrgPermissionKmipActions, OrgPermissionSubjects.Kmip]
  | [OrgPermissionSecretShareAction, OrgPermissionSubjects.SecretShare];

const AppConnectionConditionSchema = z
  .object({
    connectionId: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
        })
        .partial()
    ])
  })
  .partial();

export const OrgPermissionSchema = z.discriminatedUnion("subject", [
  z.object({
    subject: z.literal(OrgPermissionSubjects.Workspace).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_ENUM([OrgPermissionActions.Create]).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Project).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_ENUM([OrgPermissionActions.Create]).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Role).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.SubOrganization).describe("The entity this permission pertains to."),
    // Use CASL_ACTION_SCHEMA_ENUM so OpenAPI anyOf structure matches reference (string enum + array), avoiding oasdiff breaking change
    action: CASL_ACTION_SCHEMA_ENUM([
      OrgPermissionSubOrgActions.Create,
      OrgPermissionSubOrgActions.DirectAccess,
      OrgPermissionSubOrgActions.LinkGroup
    ]).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Member).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Settings).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.IncidentAccount).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Sso).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Scim).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.GithubOrgSync).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.GithubOrgSyncManual).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Ldap).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Groups).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionGroupActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.SecretScanning).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Billing).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionBillingActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Identity).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionIdentityActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Kms).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.AuditLogs).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionAuditLogsActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.ProjectTemplates).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.AppConnections).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionAppConnectionActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: AppConnectionConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.AdminConsole).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionAdminConsoleAction).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.SecretShare).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionSecretShareAction).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Kmip).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionKmipActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z
      .literal(OrgPermissionSubjects.MachineIdentityAuthTemplate)
      .describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionMachineIdentityAuthTemplateActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Gateway).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionGatewayActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Relay).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionRelayActions).describe(
      "Describe what action an entity can take."
    )
  })
]);

const buildAdminPermission = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  // ws permissions
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Project);

  can(OrgPermissionSubOrgActions.Create, OrgPermissionSubjects.SubOrganization);
  can(OrgPermissionSubOrgActions.DirectAccess, OrgPermissionSubjects.SubOrganization);
  can(OrgPermissionSubOrgActions.LinkGroup, OrgPermissionSubjects.SubOrganization);

  // role permission
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Role);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Role);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Role);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Member);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.SecretScanning);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.IncidentAccount);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.IncidentAccount);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.IncidentAccount);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Sso);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Sso);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Sso);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Scim);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Scim);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Scim);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.GithubOrgSync);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.GithubOrgSync);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.GithubOrgSync);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.GithubOrgSync);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.GithubOrgSyncManual);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.GithubOrgSyncManual);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.GithubOrgSyncManual);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.GithubOrgSyncManual);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Ldap);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Ldap);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Ldap);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Ldap);

  can(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);
  can(OrgPermissionGroupActions.Create, OrgPermissionSubjects.Groups);
  can(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);
  can(OrgPermissionGroupActions.Delete, OrgPermissionSubjects.Groups);
  can(OrgPermissionGroupActions.GrantPrivileges, OrgPermissionSubjects.Groups);
  can(OrgPermissionGroupActions.AddIdentities, OrgPermissionSubjects.Groups);
  can(OrgPermissionGroupActions.AddMembers, OrgPermissionSubjects.Groups);
  can(OrgPermissionGroupActions.RemoveMembers, OrgPermissionSubjects.Groups);
  can(OrgPermissionGroupActions.RemoveIdentities, OrgPermissionSubjects.Groups);

  can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);
  can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing);

  can(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.GrantPrivileges, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.RevokeAuth, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.CreateToken, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.GetToken, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.DeleteToken, OrgPermissionSubjects.Identity);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Kms);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Kms);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Kms);

  can(OrgPermissionAuditLogsActions.Read, OrgPermissionSubjects.AuditLogs);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.ProjectTemplates);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.ProjectTemplates);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.ProjectTemplates);

  can(OrgPermissionAppConnectionActions.Read, OrgPermissionSubjects.AppConnections);
  can(OrgPermissionAppConnectionActions.Create, OrgPermissionSubjects.AppConnections);
  can(OrgPermissionAppConnectionActions.Edit, OrgPermissionSubjects.AppConnections);
  can(OrgPermissionAppConnectionActions.Delete, OrgPermissionSubjects.AppConnections);
  can(OrgPermissionAppConnectionActions.Connect, OrgPermissionSubjects.AppConnections);

  can(OrgPermissionGatewayActions.ListGateways, OrgPermissionSubjects.Gateway);
  can(OrgPermissionGatewayActions.CreateGateways, OrgPermissionSubjects.Gateway);
  can(OrgPermissionGatewayActions.EditGateways, OrgPermissionSubjects.Gateway);
  can(OrgPermissionGatewayActions.DeleteGateways, OrgPermissionSubjects.Gateway);
  can(OrgPermissionGatewayActions.AttachGateways, OrgPermissionSubjects.Gateway);

  can(OrgPermissionRelayActions.ListRelays, OrgPermissionSubjects.Relay);
  can(OrgPermissionRelayActions.CreateRelays, OrgPermissionSubjects.Relay);
  can(OrgPermissionRelayActions.EditRelays, OrgPermissionSubjects.Relay);
  can(OrgPermissionRelayActions.DeleteRelays, OrgPermissionSubjects.Relay);

  can(OrgPermissionAdminConsoleAction.AccessAllProjects, OrgPermissionSubjects.AdminConsole);

  can(OrgPermissionKmipActions.Setup, OrgPermissionSubjects.Kmip);

  // the proxy assignment is temporary in order to prevent "more privilege" error during role assignment to MI
  can(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);

  can(OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates, OrgPermissionSubjects.MachineIdentityAuthTemplate);
  can(OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates, OrgPermissionSubjects.MachineIdentityAuthTemplate);
  can(
    OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );

  can(OrgPermissionSecretShareAction.ManageSettings, OrgPermissionSubjects.SecretShare);

  return rules;
};

export const orgAdminPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);

  can(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Project);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
  can(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
  can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.SecretScanning);

  can(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
  can(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity);

  can(OrgPermissionAuditLogsActions.Read, OrgPermissionSubjects.AuditLogs);

  can(OrgPermissionAppConnectionActions.Connect, OrgPermissionSubjects.AppConnections);
  can(OrgPermissionGatewayActions.ListGateways, OrgPermissionSubjects.Gateway);
  can(OrgPermissionGatewayActions.CreateGateways, OrgPermissionSubjects.Gateway);
  can(OrgPermissionGatewayActions.AttachGateways, OrgPermissionSubjects.Gateway);

  can(OrgPermissionRelayActions.ListRelays, OrgPermissionSubjects.Relay);
  can(OrgPermissionRelayActions.CreateRelays, OrgPermissionSubjects.Relay);
  can(OrgPermissionRelayActions.EditRelays, OrgPermissionSubjects.Relay);

  can(OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates, OrgPermissionSubjects.MachineIdentityAuthTemplate);
  can(
    OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );

  return rules;
};

export const orgMemberPermissions = buildMemberPermission();

const buildNoAccessPermission = () => {
  const { rules } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  return rules;
};

export const orgNoAccessPermissions = buildNoAccessPermission();
