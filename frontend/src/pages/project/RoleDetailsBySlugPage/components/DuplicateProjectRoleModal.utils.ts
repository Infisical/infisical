import {
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { TProjectRole } from "@app/hooks/api/roles/types";

// the built-in roles still carry grant-privileges next to the actions that replaced it, but the
// role API rejects a rule holding both, so the legacy one goes once a replacement is present
const LEGACY_PRIVILEGE_ACTIONS: Record<string, { legacyAction: string; replacedBy: string[] }> = {
  [ProjectPermissionSub.Member]: {
    legacyAction: ProjectPermissionMemberActions.GrantPrivileges,
    replacedBy: [
      ProjectPermissionMemberActions.AssignRole,
      ProjectPermissionMemberActions.AssignAdditionalPrivileges
    ]
  },
  [ProjectPermissionSub.Identity]: {
    legacyAction: ProjectPermissionIdentityActions.GrantPrivileges,
    replacedBy: [
      ProjectPermissionIdentityActions.AssignRole,
      ProjectPermissionIdentityActions.AssignAdditionalPrivileges
    ]
  },
  [ProjectPermissionSub.Groups]: {
    legacyAction: ProjectPermissionGroupActions.GrantPrivileges,
    replacedBy: [ProjectPermissionGroupActions.AssignRole]
  }
};

export const sanitizeDuplicateRolePermissions = (permissions: TProjectRole["permissions"]) =>
  permissions.flatMap((permission) => {
    if (
      permission.subject === ProjectPermissionSub.Secrets &&
      (permission.action.includes(ProjectPermissionSecretActions.DescribeSecret) ||
        permission.action.includes(ProjectPermissionSecretActions.ReadValue))
    ) {
      return [
        {
          ...permission,
          action: (permission.action as string[])?.filter(
            (action) => action !== ProjectPermissionSecretActions.DescribeAndReadValue
          )
        }
      ];
    }

    if (permission.subject === ProjectPermissionSub.SecretFolders) {
      // manage-access is only obtainable through the folder access flow, so the role API rejects
      // it; the built-in Admin role grants it and would otherwise fail validation here.
      const action = [permission.action]
        .flat()
        .filter((el) => el !== ProjectPermissionSecretFolderActions.ManageAccess);

      return action.length ? [{ ...permission, action }] : [];
    }

    const legacyPrivilege = LEGACY_PRIVILEGE_ACTIONS[permission.subject as string];
    if (legacyPrivilege) {
      const action = [permission.action].flat();

      if (action.some((el) => legacyPrivilege.replacedBy.includes(el))) {
        return [
          { ...permission, action: action.filter((el) => el !== legacyPrivilege.legacyAction) }
        ];
      }
    }

    return [permission];
  });
