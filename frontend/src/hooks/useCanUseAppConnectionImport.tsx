import { useMemo } from "react";
import { ForcedSubject } from "@casl/ability";

import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSecretActions,
  SecretSubjectFields
} from "@app/context/ProjectPermissionContext/types";

type SecretSubjectArg =
  | ProjectPermissionSub.Secrets
  | (ForcedSubject<ProjectPermissionSub.Secrets> & SecretSubjectFields);

export const useCanUseAppConnectionImport = (secretSubject: SecretSubjectArg) => {
  const { permission } = useProjectPermission();
  return useMemo(
    () =>
      permission.can(
        ProjectPermissionAppConnectionActions.Connect,
        ProjectPermissionSub.AppConnections
      ) && permission.can(ProjectPermissionSecretActions.Create, secretSubject),
    [permission, secretSubject]
  );
};
