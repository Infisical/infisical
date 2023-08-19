import { MongoAbility } from "@casl/ability";

export enum OrgGeneralPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum OrgWorkspacePermissionActions {
  Read = "read",
  Create = "create"
}

export enum OrgPermissionSubjects {
  Workspace = "workspace",
  Role = "role",
  Member = "member",
  Settings = "settings",
  IncidentAccount = "incident-contact",
  Sso = "sso",
  Billing = "billing",
  SecretScanning = "secret-scanning"
}

export type OrgPermissionSet =
  | [OrgWorkspacePermissionActions, OrgPermissionSubjects.Workspace]
  | [OrgGeneralPermissionActions, OrgPermissionSubjects.Role]
  | [OrgGeneralPermissionActions, OrgPermissionSubjects.Member]
  | [OrgGeneralPermissionActions, OrgPermissionSubjects.Settings]
  | [OrgGeneralPermissionActions, OrgPermissionSubjects.IncidentAccount]
  | [OrgGeneralPermissionActions, OrgPermissionSubjects.Sso]
  | [OrgGeneralPermissionActions, OrgPermissionSubjects.SecretScanning]
  | [OrgGeneralPermissionActions, OrgPermissionSubjects.Billing];

export type TOrgPermission = MongoAbility<OrgPermissionSet>;
