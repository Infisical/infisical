import { ForcedSubject, MongoAbility } from "@casl/ability";

export enum ProjectPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermissionSub {
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
  SecretRollback = "secret-rollback",
  SecretApproval = "secret-approval",
  SecretRotation = "secret-rotation"
}

type SubjectFields = {
  environment: string;
  secretPath: string;
};

export type ProjectPermissionSet =
  | [
      ProjectPermissionActions,
      ProjectPermissionSub.Secrets | (ForcedSubject<ProjectPermissionSub.Secrets> & SubjectFields)
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.Role]
  | [ProjectPermissionActions, ProjectPermissionSub.Tags]
  | [ProjectPermissionActions, ProjectPermissionSub.Member]
  | [ProjectPermissionActions, ProjectPermissionSub.Integrations]
  | [ProjectPermissionActions, ProjectPermissionSub.Webhooks]
  | [ProjectPermissionActions, ProjectPermissionSub.AuditLogs]
  | [ProjectPermissionActions, ProjectPermissionSub.Environments]
  | [ProjectPermissionActions, ProjectPermissionSub.IpAllowList]
  | [ProjectPermissionActions, ProjectPermissionSub.Settings]
  | [ProjectPermissionActions, ProjectPermissionSub.ServiceTokens]
  | [ProjectPermissionActions, ProjectPermissionSub.SecretApproval]
  | [ProjectPermissionActions, ProjectPermissionSub.SecretRotation]
  | [ProjectPermissionActions.Delete, ProjectPermissionSub.Workspace]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Workspace]
  | [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback];

export type TProjectPermission = MongoAbility<ProjectPermissionSet>;
