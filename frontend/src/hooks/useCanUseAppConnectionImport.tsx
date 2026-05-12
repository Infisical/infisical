import { useMemo } from "react";

import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";

type Params = {
  canReadSecrets: boolean;
  canCreateSecrets: boolean;
};

export const useCanUseAppConnectionImport = ({ canReadSecrets, canCreateSecrets }: Params) => {
  const { permission } = useProjectPermission();
  return useMemo(
    () =>
      permission.can(
        ProjectPermissionAppConnectionActions.Read,
        ProjectPermissionSub.AppConnections
      ) &&
      permission.can(
        ProjectPermissionAppConnectionActions.Create,
        ProjectPermissionSub.AppConnections
      ) &&
      canReadSecrets &&
      canCreateSecrets,
    [permission, canReadSecrets, canCreateSecrets]
  );
};
