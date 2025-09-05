import { MongoAbility } from "@casl/ability";

export enum OrgPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum OrgPermissionBillingActions {
  Read = "read",
  ManageBilling = "manage-billing"
}

// we are deprecating this in favor of connector
export enum OrgGatewayPermissionActions {
  // is there a better word for this. This mean can an identity be a gateway
  CreateGateways = "create-gateways",
  ListGateways = "list-gateways",
  EditGateways = "edit-gateways",
  DeleteGateways = "delete-gateways",
  AttachGateways = "attach-gateways"
}

export enum OrgPermissionConnectorActions {
  CreateConnectors = "create-connectors",
  ListConnectors = "list-connectors",
  EditConnectors = "edit-connectors",
  DeleteConnectors = "delete-connectors",
  AttachConnectors = "attach-connectors"
}

export enum OrgPermissionMachineIdentityAuthTemplateActions {
  ListTemplates = "list-templates",
  CreateTemplates = "create-templates",
  EditTemplates = "edit-templates",
  DeleteTemplates = "delete-templates",
  UnlinkTemplates = "unlink-templates",
  AttachTemplates = "attach-templates"
}

export enum OrgPermissionSubjects {
  Workspace = "workspace",
  Role = "role",
  Member = "member",
  Settings = "settings",
  IncidentAccount = "incident-contact",
  Scim = "scim",
  Sso = "sso",
  Ldap = "ldap",
  Groups = "groups",
  Billing = "billing",
  SecretScanning = "secret-scanning",
  Identity = "identity",
  Kms = "kms",
  AdminConsole = "organization-admin-console",
  AuditLogs = "audit-logs",
  ProjectTemplates = "project-templates",
  AppConnections = "app-connections",
  Kmip = "kmip",
  Gateway = "gateway",
  SecretShare = "secret-share",
  GithubOrgSync = "github-org-sync",
  GithubOrgSyncManual = "github-org-sync-manual",
  MachineIdentityAuthTemplate = "machine-identity-auth-template"
}

export enum OrgPermissionAdminConsoleAction {
  AccessAllProjects = "access-all-projects"
}

export enum OrgPermissionSecretShareAction {
  ManageSettings = "manage-settings"
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
  AddMembers = "add-members",
  RemoveMembers = "remove-members"
}

export type AppConnectionSubjectFields = {
  connectionId: string;
};

export type OrgPermissionSet =
  | [OrgPermissionActions.Create, OrgPermissionSubjects.Workspace]
  | [OrgPermissionActions.Read, OrgPermissionSubjects.Workspace]
  | [OrgPermissionActions, OrgPermissionSubjects.Role]
  | [OrgPermissionActions, OrgPermissionSubjects.Member]
  | [OrgPermissionActions, OrgPermissionSubjects.Settings]
  | [OrgPermissionActions, OrgPermissionSubjects.IncidentAccount]
  | [OrgPermissionActions, OrgPermissionSubjects.Scim]
  | [OrgPermissionActions, OrgPermissionSubjects.GithubOrgSync]
  | [OrgPermissionActions, OrgPermissionSubjects.GithubOrgSyncManual]
  | [OrgPermissionActions, OrgPermissionSubjects.Sso]
  | [OrgPermissionActions, OrgPermissionSubjects.Ldap]
  | [OrgPermissionGroupActions, OrgPermissionSubjects.Groups]
  | [OrgPermissionActions, OrgPermissionSubjects.SecretScanning]
  | [OrgPermissionBillingActions, OrgPermissionSubjects.Billing]
  | [OrgPermissionActions, OrgPermissionSubjects.Kms]
  | [OrgPermissionAdminConsoleAction, OrgPermissionSubjects.AdminConsole]
  | [OrgPermissionAuditLogsActions, OrgPermissionSubjects.AuditLogs]
  | [OrgPermissionActions, OrgPermissionSubjects.ProjectTemplates]
  | [OrgPermissionAppConnectionActions, OrgPermissionSubjects.AppConnections]
  | [OrgPermissionIdentityActions, OrgPermissionSubjects.Identity]
  | [OrgPermissionKmipActions, OrgPermissionSubjects.Kmip]
  | [
      OrgPermissionMachineIdentityAuthTemplateActions,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    ]
  | [OrgGatewayPermissionActions, OrgPermissionSubjects.Gateway]
  | [OrgPermissionSecretShareAction, OrgPermissionSubjects.SecretShare];
// TODO(scott): add back once org UI refactored
// | [
//     OrgPermissionAppConnectionActions,
//     (
//       | OrgPermissionSubjects.AppConnections
//       | (ForcedSubject<OrgPermissionSubjects.AppConnections> & AppConnectionSubjectFields)
//     )
//   ];

export type TOrgPermission = MongoAbility<OrgPermissionSet>;
