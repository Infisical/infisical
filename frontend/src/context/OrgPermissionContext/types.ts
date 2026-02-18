import { ForcedSubject, MongoAbility } from "@casl/ability";

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

export enum OrgGatewayPermissionActions {
  // is there a better word for this. This mean can an identity be a gateway
  CreateGateways = "create-gateways",
  ListGateways = "list-gateways",
  EditGateways = "edit-gateways",
  DeleteGateways = "delete-gateways",
  AttachGateways = "attach-gateways"
}

export enum OrgRelayPermissionActions {
  CreateRelays = "create-relays",
  ListRelays = "list-relays",
  EditRelays = "edit-relays",
  DeleteRelays = "delete-relays"
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
  Project = "project",
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
  Relay = "relay",
  SecretShare = "secret-share",
  GithubOrgSync = "github-org-sync",
  GithubOrgSyncManual = "github-org-sync-manual",
  MachineIdentityAuthTemplate = "machine-identity-auth-template",
  SubOrganization = "sub-organization"
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

export enum OrgPermissionSubOrgActions {
  Create = "create",
  DirectAccess = "direct-access",
  LinkGroup = "link-group"
}

export type AppConnectionSubjectFields = {
  connectionId: string;
};

export type OrgPermissionSet =
  | [OrgPermissionActions.Create, OrgPermissionSubjects.Workspace]
  | [OrgPermissionActions.Create, OrgPermissionSubjects.Project]
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
  | [OrgPermissionIdentityActions, OrgPermissionSubjects.Identity]
  | [OrgPermissionKmipActions, OrgPermissionSubjects.Kmip]
  | [
      OrgPermissionMachineIdentityAuthTemplateActions,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    ]
  | [OrgGatewayPermissionActions, OrgPermissionSubjects.Gateway]
  | [OrgRelayPermissionActions, OrgPermissionSubjects.Relay]
  | [OrgPermissionSecretShareAction, OrgPermissionSubjects.SecretShare]
  | [
      OrgPermissionAppConnectionActions,
      (
        | OrgPermissionSubjects.AppConnections
        | (ForcedSubject<OrgPermissionSubjects.AppConnections> & AppConnectionSubjectFields)
      )
    ]
  | [OrgPermissionSubOrgActions, OrgPermissionSubjects.SubOrganization];

export type TOrgPermission = MongoAbility<OrgPermissionSet>;
