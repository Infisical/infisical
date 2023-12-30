import { AbilityBuilder, createMongoAbility, ForcedSubject, MongoAbility } from "@casl/ability";

import { conditionsMatcher } from "@app/lib/casl";

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
  Project = "workspace",
  Secrets = "secrets",
  SecretRollback = "secret-rollback",
  SecretApproval = "secret-approval",
  SecretRotation = "secret-rotation",
  Identity = "identity"
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
  | [ProjectPermissionActions, ProjectPermissionSub.Identity]
  | [ProjectPermissionActions.Delete, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback];

const buildAdminPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Secrets);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretApproval);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretRotation);

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

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Identity);

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

  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Project);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Project);

  return build({ conditionsMatcher });
};

export const projectAdminPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Secrets);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRotation);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Member);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Webhooks);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Identity);

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

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);

  return build({ conditionsMatcher });
};

export const projectMemberPermissions = buildMemberPermission();

const buildViewerPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);

  return build({ conditionsMatcher });
};

export const projectViewerPermission = buildViewerPermission();

const buildNoAccessProjectPermission = () => {
  const { build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  return build({ conditionsMatcher });
};

export const projectNoAccessPermissions = buildNoAccessProjectPermission();

/**
 * Extracts and formats permissions from a CASL Ability object or a raw permission set.
 * @param ability
 * @returns
 */
const extractPermissions = (ability: any) =>
  ability.A.map((permission: any) => `${permission.action}_${permission.subject}`);

/**
 * Compares two sets of permissions to determine if the first set is at least as privileged as the second set.
 * The function checks if all permissions in the second set are contained within the first set and if the first set has equal or more permissions.
 *
 */
export const isAtLeastAsPrivilegedWorkspace = (
  permissions1: MongoAbility<ProjectPermissionSet> | ProjectPermissionSet,
  permissions2: MongoAbility<ProjectPermissionSet> | ProjectPermissionSet
) => {
  const set1 = new Set(extractPermissions(permissions1));
  const set2 = new Set(extractPermissions(permissions2));

  // eslint-disable-next-line
  for (const perm of set2) {
    if (!set1.has(perm)) {
      return false;
    }
  }

  return set1.size >= set2.size;
};
