import {
  AbilityBuilder,
  ForcedSubject,
  MongoAbility,
  RawRuleOf,
  createMongoAbility
} from "@casl/ability";
import { Membership } from "../models";
import { IRole } from "../models/role";
import { BadRequestError, UnauthorizedRequestError } from "../utils/errors";

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
  SecretImports = "secret-imports",
  SecretRollback = "secret-rollback",
  Folders = "folders"
}

type SubjectFields = {
  environment: string;
  secretPath?: string;
};

export type ProjectPermissionSet =
  | [
      ProjectPermissionActions,
      ProjectPermissionSub.Secrets | (ForcedSubject<ProjectPermissionSub.Secrets> & SubjectFields)
    ]
  | [
      ProjectPermissionActions,
      ProjectPermissionSub.Folders | (ForcedSubject<ProjectPermissionSub.Folders> & SubjectFields)
    ]
  | [
      ProjectPermissionActions,
      (
        | ProjectPermissionSub.SecretImports
        | (ForcedSubject<ProjectPermissionSub.SecretImports> & SubjectFields)
      )
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
  | [ProjectPermissionActions.Delete, ProjectPermissionSub.Workspace]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Workspace]
  | [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback];

const buildAdminPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Secrets);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Folders);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Folders);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Folders);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Folders);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretImports);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Member);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Role);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Webhooks);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.ServiceTokens);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Settings);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Environments);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Tags);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.AuditLogs);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.IpAllowList);

  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Workspace);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.IpAllowList);

  return build();
};

export const adminProjectPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Secrets);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Folders);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Folders);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Folders);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Folders);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);

  return build();
};

export const memberProjectPermissions = buildMemberPermission();

const buildViewerPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Folders);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);

  return build();
};

export const viewerProjectPermission = buildViewerPermission();

export const getUserProjectPermissions = async (userId: string, workspaceId: string) => {
  // TODO(akhilmhdh): speed this up by pulling from cache later
  const membership = await Membership.findOne({
    user: userId,
    workspace: workspaceId
  })
    .populate<{
      customRole: IRole & { permissions: RawRuleOf<MongoAbility<ProjectPermissionSet>>[] };
    }>("customRole")
    .exec();

  console.log(membership, userId, workspaceId);
  if (!membership || (membership.role === "custom" && !membership.customRole)) {
    throw UnauthorizedRequestError({ message: "User doesn't belong to organization" });
  }

  if (membership.role === "admin") return { permission: adminProjectPermissions, membership };
  if (membership.role === "member") return { permission: memberProjectPermissions, membership };
  if (membership.role === "viewer") return { permission: memberProjectPermissions, membership };

  if (membership.role === "custom") {
    const permission = createMongoAbility<ProjectPermissionSet>(membership.customRole.permissions);
    return { permission, membership };
  }

  throw BadRequestError({ message: "User role not found" });
};
