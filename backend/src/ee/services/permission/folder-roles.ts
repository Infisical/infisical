import { AbilityBuilder, createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";

import { SecretFolderRole } from "@app/db/schemas";
import {
  ProjectPermissionActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretEventActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

// Folder RBAC. These are project-subject rules scoped to one folder by
// additional_privileges.folderId rather than by CASL conditions, so they carry no subject fields.
// The tiers are cumulative, and each apply* helper chains to the one below it so that relationship
// lives in one place instead of being re-listed five times.
type TProjectCan = AbilityBuilder<MongoAbility<ProjectPermissionSet>>["can"];

// See what exists, without exposing any secret values.
const applyFolderListRules = (can: TProjectCan) => {
  can([ProjectPermissionSecretActions.DescribeSecret], ProjectPermissionSub.Secrets);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.Tags);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.SecretImports);
  can([ProjectPermissionSecretSyncActions.Read], ProjectPermissionSub.SecretSyncs);
  can([ProjectPermissionSecretRotationActions.Read], ProjectPermissionSub.SecretRotation);
  can([ProjectPermissionHoneyTokenActions.Read], ProjectPermissionSub.HoneyTokens);
};

const applyFolderReadRules = (can: TProjectCan) => {
  applyFolderListRules(can);

  can([ProjectPermissionSecretActions.ReadValue], ProjectPermissionSub.Secrets);
  can([ProjectPermissionCommitsActions.Read], ProjectPermissionSub.Commits);
  can([ProjectPermissionDynamicSecretActions.Lease], ProjectPermissionSub.DynamicSecrets);
  can(
    [
      ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
      ProjectPermissionSecretEventActions.SubscribeToUpdateEvents,
      ProjectPermissionSecretEventActions.SubscribeToDeleteEvents,
      ProjectPermissionSecretEventActions.SubscribeToImportMutationEvents
    ],
    ProjectPermissionSub.SecretEventSubscriptions
  );
};

const applyFolderEditRules = (can: TProjectCan) => {
  applyFolderReadRules(can);

  can(
    [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit, ProjectPermissionSecretActions.Delete],
    ProjectPermissionSub.Secrets
  );
  can(
    [ProjectPermissionActions.Create, ProjectPermissionActions.Edit, ProjectPermissionActions.Delete],
    ProjectPermissionSub.SecretImports
  );
};

const applyFolderManageRules = (can: TProjectCan) => {
  applyFolderEditRules(can);

  can(
    [
      ProjectPermissionSecretRotationActions.Create,
      ProjectPermissionSecretRotationActions.Edit,
      ProjectPermissionSecretRotationActions.Delete,
      ProjectPermissionSecretRotationActions.RotateSecrets,
      ProjectPermissionSecretRotationActions.ReadGeneratedCredentials
    ],
    ProjectPermissionSub.SecretRotation
  );
  can(
    [
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      ProjectPermissionDynamicSecretActions.CreateRootCredential,
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      ProjectPermissionDynamicSecretActions.DeleteRootCredential
    ],
    ProjectPermissionSub.DynamicSecrets
  );
  can(
    [
      ProjectPermissionHoneyTokenActions.Create,
      ProjectPermissionHoneyTokenActions.Edit,
      ProjectPermissionHoneyTokenActions.Reset,
      ProjectPermissionHoneyTokenActions.Revoke,
      ProjectPermissionHoneyTokenActions.ReadCredentials
    ],
    ProjectPermissionSub.HoneyTokens
  );
  can(
    [
      ProjectPermissionSecretSyncActions.Create,
      ProjectPermissionSecretSyncActions.Edit,
      ProjectPermissionSecretSyncActions.Delete,
      ProjectPermissionSecretSyncActions.SyncSecrets,
      ProjectPermissionSecretSyncActions.ImportSecrets,
      ProjectPermissionSecretSyncActions.RemoveSecrets
    ],
    ProjectPermissionSub.SecretSyncs
  );
};

const applyFolderFullAccessRules = (can: TProjectCan) => {
  applyFolderManageRules(can);

  can(
    [ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionActions.Delete],
    ProjectPermissionSub.SecretFolders
  );
};

const buildFolderRoleRules = (applyRules: (can: TProjectCan) => void) => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  applyRules(can);
  return rules;
};

export const folderListPermissions = buildFolderRoleRules(applyFolderListRules);
export const folderReadPermissions = buildFolderRoleRules(applyFolderReadRules);
export const folderEditPermissions = buildFolderRoleRules(applyFolderEditRules);
export const folderManagePermissions = buildFolderRoleRules(applyFolderManageRules);
export const folderFullAccessPermissions = buildFolderRoleRules(applyFolderFullAccessRules);

export const SECRET_FOLDER_ROLE_PERMISSIONS: Record<SecretFolderRole, RawRuleOf<MongoAbility<ProjectPermissionSet>>[]> =
  {
    [SecretFolderRole.List]: folderListPermissions,
    [SecretFolderRole.Read]: folderReadPermissions,
    [SecretFolderRole.Edit]: folderEditPermissions,
    [SecretFolderRole.Manage]: folderManagePermissions,
    [SecretFolderRole.FullAccess]: folderFullAccessPermissions
  };

const buildFolderScopedDenyRules = () => {
  const { cannot, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  cannot(
    [
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Edit,
      ProjectPermissionSecretActions.Delete
    ],
    ProjectPermissionSub.Secrets
  );
  cannot(
    [
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Delete,
      ProjectPermissionSecretFolderActions.ManageAccess
    ],
    ProjectPermissionSub.SecretFolders
  );
  cannot(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.SecretImports
  );
  cannot(
    [
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      ProjectPermissionDynamicSecretActions.CreateRootCredential,
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      ProjectPermissionDynamicSecretActions.DeleteRootCredential,
      ProjectPermissionDynamicSecretActions.Lease
    ],
    ProjectPermissionSub.DynamicSecrets
  );
  cannot(
    [
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSecretSyncActions.Create,
      ProjectPermissionSecretSyncActions.Edit,
      ProjectPermissionSecretSyncActions.Delete,
      ProjectPermissionSecretSyncActions.SyncSecrets,
      ProjectPermissionSecretSyncActions.ImportSecrets,
      ProjectPermissionSecretSyncActions.RemoveSecrets
    ],
    ProjectPermissionSub.SecretSyncs
  );
  cannot(
    [
      ProjectPermissionSecretRotationActions.Read,
      ProjectPermissionSecretRotationActions.ReadGeneratedCredentials,
      ProjectPermissionSecretRotationActions.Create,
      ProjectPermissionSecretRotationActions.Edit,
      ProjectPermissionSecretRotationActions.Delete,
      ProjectPermissionSecretRotationActions.RotateSecrets
    ],
    ProjectPermissionSub.SecretRotation
  );
  cannot(
    [
      ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
      ProjectPermissionSecretEventActions.SubscribeToUpdateEvents,
      ProjectPermissionSecretEventActions.SubscribeToDeleteEvents,
      ProjectPermissionSecretEventActions.SubscribeToImportMutationEvents
    ],
    ProjectPermissionSub.SecretEventSubscriptions
  );
  cannot(
    [
      ProjectPermissionHoneyTokenActions.Read,
      ProjectPermissionHoneyTokenActions.ReadCredentials,
      ProjectPermissionHoneyTokenActions.Create,
      ProjectPermissionHoneyTokenActions.Edit,
      ProjectPermissionHoneyTokenActions.Reset,
      ProjectPermissionHoneyTokenActions.Revoke
    ],
    ProjectPermissionSub.HoneyTokens
  );

  return rules;
};

export const FOLDER_SCOPED_DENY_RULES = buildFolderScopedDenyRules();
