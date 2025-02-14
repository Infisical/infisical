import { MongoAbility } from "@casl/ability";

export enum OrgPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum OrgGatewayPermissionActions {
  // is there a better word for this. This mean can an identity be a gateway
  Create = "create",
  Read = "read",
  Edit = "edit",
  Delete = "delete"
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
  Gateway = "gateway"
}

export enum OrgPermissionAdminConsoleAction {
  AccessAllProjects = "access-all-projects"
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
  | [OrgPermissionActions, OrgPermissionSubjects.Sso]
  | [OrgPermissionActions, OrgPermissionSubjects.Ldap]
  | [OrgPermissionActions, OrgPermissionSubjects.Groups]
  | [OrgPermissionActions, OrgPermissionSubjects.SecretScanning]
  | [OrgPermissionActions, OrgPermissionSubjects.Billing]
  | [OrgPermissionActions, OrgPermissionSubjects.Identity]
  | [OrgPermissionActions, OrgPermissionSubjects.Kms]
  | [OrgPermissionAdminConsoleAction, OrgPermissionSubjects.AdminConsole]
  | [OrgPermissionActions, OrgPermissionSubjects.AuditLogs]
  | [OrgPermissionActions, OrgPermissionSubjects.ProjectTemplates]
  | [OrgPermissionAppConnectionActions, OrgPermissionSubjects.AppConnections]
  | [OrgPermissionKmipActions, OrgPermissionSubjects.Kmip]
  | [OrgGatewayPermissionActions, OrgPermissionSubjects.Gateway];
// TODO(scott): add back once org UI refactored
// | [
//     OrgPermissionAppConnectionActions,
//     (
//       | OrgPermissionSubjects.AppConnections
//       | (ForcedSubject<OrgPermissionSubjects.AppConnections> & AppConnectionSubjectFields)
//     )
//   ];

export type TOrgPermission = MongoAbility<OrgPermissionSet>;
