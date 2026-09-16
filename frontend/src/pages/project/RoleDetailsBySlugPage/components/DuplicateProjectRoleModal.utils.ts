import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { TProjectRole } from "@app/hooks/api/roles/types";

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

    return [permission];
  });
