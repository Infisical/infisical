import { MongoAbility } from "@casl/ability";

export enum GeneralPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
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
  | [GeneralPermissionActions.Create, OrgPermissionSubjects.Workspace]
  | [GeneralPermissionActions.Read, OrgPermissionSubjects.Workspace]
  | [GeneralPermissionActions, OrgPermissionSubjects.Role]
  | [GeneralPermissionActions, OrgPermissionSubjects.Member]
  | [GeneralPermissionActions, OrgPermissionSubjects.Settings]
  | [GeneralPermissionActions, OrgPermissionSubjects.IncidentAccount]
  | [GeneralPermissionActions, OrgPermissionSubjects.Sso]
  | [GeneralPermissionActions, OrgPermissionSubjects.SecretScanning]
  | [GeneralPermissionActions, OrgPermissionSubjects.Billing];

export type TOrgPermission = MongoAbility<OrgPermissionSet>;
