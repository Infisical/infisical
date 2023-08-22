import { MongoAbility } from "@casl/ability";

export enum ProjectGeneralPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermissionSubjects {
  Role = "role",
  Member = "member",
  Settings = "settings",
  Integrations = "integrations",
  Webhooks = "webhooks",
  ServiceTokens = "service-tokens",
  Environments = "environments",
  Tags = "tags",
  AuditLogs = "audit-logs",
  IpAllowList = "ip-allowlist",
  Workspace = "workspace",
  Secrets = "secrets",
  SecretImports = "secret-imports",
  Folders = "folders"
}

export type ProjectPermissionSet =
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.Secrets]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.Folders]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.SecretImports]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.Role]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.Tags]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.Member]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.Integrations]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.Webhooks]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.AuditLogs]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.Environments]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.IpAllowList]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.Settings]
  | [ProjectGeneralPermissionActions, ProjectPermissionSubjects.ServiceTokens]
  | [ProjectGeneralPermissionActions.Delete, ProjectPermissionSubjects.Workspace]
  | [ProjectGeneralPermissionActions.Edit, ProjectPermissionSubjects.Workspace];

export type TProjectPermission = MongoAbility<ProjectPermissionSet>;
