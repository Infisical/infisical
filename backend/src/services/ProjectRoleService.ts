import { AbilityBuilder, MongoAbility, RawRuleOf, createMongoAbility } from "@casl/ability";
import { Membership } from "../models";
import { IRole } from "../models/role";
import { BadRequestError, UnauthorizedRequestError } from "../utils/errors";

export enum GeneralPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermission {
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
  | [GeneralPermissionActions, ProjectPermission.Secrets]
  | [GeneralPermissionActions, ProjectPermission.Folders]
  | [GeneralPermissionActions, ProjectPermission.SecretImports]
  | [GeneralPermissionActions, ProjectPermission.Role]
  | [GeneralPermissionActions, ProjectPermission.Tags]
  | [GeneralPermissionActions, ProjectPermission.Member]
  | [GeneralPermissionActions, ProjectPermission.Integrations]
  | [GeneralPermissionActions, ProjectPermission.Webhooks]
  | [GeneralPermissionActions, ProjectPermission.AuditLogs]
  | [GeneralPermissionActions, ProjectPermission.Environments]
  | [GeneralPermissionActions, ProjectPermission.IpAllowList]
  | [GeneralPermissionActions, ProjectPermission.Settings]
  | [GeneralPermissionActions, ProjectPermission.ServiceTokens]
  | [GeneralPermissionActions.Delete, ProjectPermission.Workspace]
  | [GeneralPermissionActions.Edit, ProjectPermission.Workspace];

const buildAdminPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(GeneralPermissionActions.Read, ProjectPermission.Secrets);
  can(GeneralPermissionActions.Create, ProjectPermission.Secrets);
  can(GeneralPermissionActions.Edit, ProjectPermission.Secrets);
  can(GeneralPermissionActions.Delete, ProjectPermission.Secrets);

  can(GeneralPermissionActions.Read, ProjectPermission.Folders);
  can(GeneralPermissionActions.Create, ProjectPermission.Folders);
  can(GeneralPermissionActions.Edit, ProjectPermission.Folders);
  can(GeneralPermissionActions.Delete, ProjectPermission.Folders);

  can(GeneralPermissionActions.Read, ProjectPermission.SecretImports);
  can(GeneralPermissionActions.Create, ProjectPermission.SecretImports);
  can(GeneralPermissionActions.Edit, ProjectPermission.SecretImports);
  can(GeneralPermissionActions.Delete, ProjectPermission.SecretImports);

  can(GeneralPermissionActions.Read, ProjectPermission.Member);
  can(GeneralPermissionActions.Create, ProjectPermission.Member);
  can(GeneralPermissionActions.Edit, ProjectPermission.Member);
  can(GeneralPermissionActions.Delete, ProjectPermission.Member);

  can(GeneralPermissionActions.Read, ProjectPermission.Role);
  can(GeneralPermissionActions.Create, ProjectPermission.Role);
  can(GeneralPermissionActions.Edit, ProjectPermission.Role);
  can(GeneralPermissionActions.Delete, ProjectPermission.Role);

  can(GeneralPermissionActions.Read, ProjectPermission.Integrations);
  can(GeneralPermissionActions.Create, ProjectPermission.Integrations);
  can(GeneralPermissionActions.Edit, ProjectPermission.Integrations);
  can(GeneralPermissionActions.Delete, ProjectPermission.Integrations);

  can(GeneralPermissionActions.Read, ProjectPermission.Webhooks);
  can(GeneralPermissionActions.Create, ProjectPermission.Webhooks);
  can(GeneralPermissionActions.Edit, ProjectPermission.Webhooks);
  can(GeneralPermissionActions.Delete, ProjectPermission.Webhooks);

  can(GeneralPermissionActions.Read, ProjectPermission.ServiceTokens);
  can(GeneralPermissionActions.Create, ProjectPermission.ServiceTokens);
  can(GeneralPermissionActions.Edit, ProjectPermission.ServiceTokens);
  can(GeneralPermissionActions.Delete, ProjectPermission.ServiceTokens);

  can(GeneralPermissionActions.Read, ProjectPermission.Settings);
  can(GeneralPermissionActions.Create, ProjectPermission.Settings);
  can(GeneralPermissionActions.Edit, ProjectPermission.Settings);
  can(GeneralPermissionActions.Delete, ProjectPermission.Settings);

  can(GeneralPermissionActions.Read, ProjectPermission.Environments);
  can(GeneralPermissionActions.Create, ProjectPermission.Environments);
  can(GeneralPermissionActions.Edit, ProjectPermission.Environments);
  can(GeneralPermissionActions.Delete, ProjectPermission.Environments);

  can(GeneralPermissionActions.Read, ProjectPermission.Tags);
  can(GeneralPermissionActions.Create, ProjectPermission.Tags);
  can(GeneralPermissionActions.Edit, ProjectPermission.Tags);
  can(GeneralPermissionActions.Delete, ProjectPermission.Tags);

  can(GeneralPermissionActions.Read, ProjectPermission.AuditLogs);
  can(GeneralPermissionActions.Create, ProjectPermission.AuditLogs);
  can(GeneralPermissionActions.Edit, ProjectPermission.AuditLogs);
  can(GeneralPermissionActions.Delete, ProjectPermission.AuditLogs);

  can(GeneralPermissionActions.Read, ProjectPermission.IpAllowList);
  can(GeneralPermissionActions.Create, ProjectPermission.IpAllowList);
  can(GeneralPermissionActions.Edit, ProjectPermission.IpAllowList);
  can(GeneralPermissionActions.Delete, ProjectPermission.IpAllowList);

  can(GeneralPermissionActions.Edit, ProjectPermission.Workspace);
  can(GeneralPermissionActions.Delete, ProjectPermission.IpAllowList);

  return build();
};

export const adminProjectPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(GeneralPermissionActions.Read, ProjectPermission.Secrets);
  can(GeneralPermissionActions.Create, ProjectPermission.Secrets);
  can(GeneralPermissionActions.Edit, ProjectPermission.Secrets);
  can(GeneralPermissionActions.Delete, ProjectPermission.Secrets);

  can(GeneralPermissionActions.Read, ProjectPermission.Folders);
  can(GeneralPermissionActions.Create, ProjectPermission.Folders);
  can(GeneralPermissionActions.Edit, ProjectPermission.Folders);
  can(GeneralPermissionActions.Delete, ProjectPermission.Folders);

  can(GeneralPermissionActions.Read, ProjectPermission.SecretImports);
  can(GeneralPermissionActions.Create, ProjectPermission.SecretImports);
  can(GeneralPermissionActions.Edit, ProjectPermission.SecretImports);
  can(GeneralPermissionActions.Delete, ProjectPermission.SecretImports);

  can(GeneralPermissionActions.Read, ProjectPermission.Member);
  can(GeneralPermissionActions.Read, ProjectPermission.Role);
  can(GeneralPermissionActions.Read, ProjectPermission.Integrations);
  can(GeneralPermissionActions.Read, ProjectPermission.Webhooks);
  can(GeneralPermissionActions.Read, ProjectPermission.ServiceTokens);
  can(GeneralPermissionActions.Read, ProjectPermission.Settings);
  can(GeneralPermissionActions.Read, ProjectPermission.Environments);
  can(GeneralPermissionActions.Read, ProjectPermission.Tags);
  can(GeneralPermissionActions.Read, ProjectPermission.AuditLogs);
  can(GeneralPermissionActions.Read, ProjectPermission.IpAllowList);

  return build();
};

export const memberProjectPermissions = buildMemberPermission();

const buildViewerPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(GeneralPermissionActions.Read, ProjectPermission.Secrets);
  can(GeneralPermissionActions.Read, ProjectPermission.Folders);
  can(GeneralPermissionActions.Read, ProjectPermission.SecretImports);
  can(GeneralPermissionActions.Read, ProjectPermission.Member);
  can(GeneralPermissionActions.Read, ProjectPermission.Role);
  can(GeneralPermissionActions.Read, ProjectPermission.Integrations);
  can(GeneralPermissionActions.Read, ProjectPermission.Webhooks);
  can(GeneralPermissionActions.Read, ProjectPermission.ServiceTokens);
  can(GeneralPermissionActions.Read, ProjectPermission.Settings);
  can(GeneralPermissionActions.Read, ProjectPermission.Environments);
  can(GeneralPermissionActions.Read, ProjectPermission.Tags);
  can(GeneralPermissionActions.Read, ProjectPermission.AuditLogs);
  can(GeneralPermissionActions.Read, ProjectPermission.IpAllowList);

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
