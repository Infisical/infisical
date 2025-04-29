import { MongoAbility } from "@casl/ability";

export enum OrgPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum OrgGatewayPermissionActions {
  // is there a better word for this. This mean can an identity be a gateway
  CreateGateways = "create-gateways",
  ListGateways = "list-gateways",
  EditGateways = "edit-gateways",
  DeleteGateways = "delete-gateways"
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
  GithubOrgSync = "github-org-sync"
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
  | [OrgPermissionActions, OrgPermissionSubjects.Sso]
  | [OrgPermissionActions, OrgPermissionSubjects.Ldap]
  | [OrgPermissionGroupActions, OrgPermissionSubjects.Groups]
  | [OrgPermissionActions, OrgPermissionSubjects.SecretScanning]
  | [OrgPermissionActions, OrgPermissionSubjects.Billing]
  | [OrgPermissionActions, OrgPermissionSubjects.Kms]
  | [OrgPermissionAdminConsoleAction, OrgPermissionSubjects.AdminConsole]
  | [OrgPermissionActions, OrgPermissionSubjects.AuditLogs]
  | [OrgPermissionActions, OrgPermissionSubjects.ProjectTemplates]
  | [OrgPermissionAppConnectionActions, OrgPermissionSubjects.AppConnections]
  | [OrgPermissionIdentityActions, OrgPermissionSubjects.Identity]
  | [OrgPermissionKmipActions, OrgPermissionSubjects.Kmip]
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
